"use client"

import { useEffect, useRef, useState } from "react"
import {
  Camera,
  CircleAlert,
  ImagePlus,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MathCopy } from "@/components/math-copy"
import { PhotoCrop } from "@/components/photo-crop"
import { SolveHistoryDialog } from "@/components/solve-history-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { COURSES, courseLabel, parseCourse, type CourseId } from "@/lib/course"
import { readModelCall, type HelpMode, type ModelCallLog } from "@/lib/model-call"
import { listSolves, saveFollowUps, saveSolve, type SavedSolve } from "@/lib/solve-history"
import type { SolveSuccess, SolvedQuestion, VisionStatus } from "@/lib/vision"

type Failure = {
  error: string
  code: "missing_key" | "bad_request" | "model_error" | "camera"
}

type Phase = "idle" | "crop" | "reading" | "choose" | "loading" | "result" | "error"
type SolveMode = "all" | "one"

function callFromPayload(payload: unknown): ModelCallLog | null {
  if (!payload || typeof payload !== "object") return null
  return readModelCall((payload as { call?: unknown }).call)
}

function callKey(call: ModelCallLog): string {
  return `${call.kind}|${call.startedAt}|${call.finishedAt}`
}

function readSolvePayload(payload: unknown): SolveSuccess | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  if (record.helpMode !== "hint" && record.helpMode !== "solve") return null
  const course = parseCourse(record.course)
  const call = readModelCall(record.call)
  if (!course || !call || !Array.isArray(record.solutions)) return null
  if (typeof record.provider !== "string" || typeof record.model !== "string") return null
  const solutions: SolvedQuestion[] = []
  for (const item of record.solutions) {
    if (!item || typeof item !== "object") return null
    const solution = item as Record<string, unknown>
    const answer = typeof solution.answer === "string" ? solution.answer : ""
    const hint = typeof solution.hint === "string" ? solution.hint : ""
    const steps = Array.isArray(solution.steps)
      ? solution.steps.filter((step): step is string => typeof step === "string")
      : []
    if (record.helpMode === "hint" && !hint.trim()) return null
    if (record.helpMode === "solve" && !answer.trim()) return null
    solutions.push({
      question: typeof solution.question === "string" ? solution.question : "",
      answer,
      steps,
      hint,
    })
  }
  if (solutions.length === 0) return null
  return {
    course,
    helpMode: record.helpMode,
    solutions,
    provider: record.provider as SolveSuccess["provider"],
    model: record.model,
    call,
  }
}

const FAILURE_TITLES: Record<Failure["code"], string> = {
  missing_key: "No vision model key",
  bad_request: "That photo didn't go through",
  model_error: "The model couldn't finish",
  camera: "The camera didn't open",
}

async function fileToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const maxEdge = 1600
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("The browser couldn't prepare this photo.")
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    })
    if (!blob) throw new Error("The browser couldn't prepare this photo.")
    return new File([blob], "question.jpg", { type: "image/jpeg" })
  } finally {
    bitmap.close()
  }
}

export function MathBuddy({ initialStatus }: { initialStatus: VisionStatus }) {
  const [course, setCourse] = useState<CourseId>("algebra-1")
  const [status] = useState(initialStatus)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [solveMode, setSolveMode] = useState<SolveMode>("all")
  const [helpMode, setHelpMode] = useState<HelpMode>("solve")
  const [calls, setCalls] = useState<ModelCallLog[]>([])
  const [chosenIndex, setChosenIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<Omit<SolveSuccess, "call"> | null>(null)
  const [followUp, setFollowUp] = useState("")
  const [replies, setReplies] = useState<string[]>([])
  const [asking, setAsking] = useState(false)
  const [followUpError, setFollowUpError] = useState<Failure | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<SavedSolve[]>([])
  const [historyNote, setHistoryNote] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const photoUrlRef = useRef<string | null>(null)
  const persistedCalls = useRef(new Set<string>())

  function carryCalls(extra?: ModelCallLog): ModelCallLog[] {
    const carried = calls.filter(
      (call) => call.kind === "questions" || !persistedCalls.current.has(callKey(call)),
    )
    return extra ? [...carried, extra] : carried
  }

  function markPersisted(list: ModelCallLog[]) {
    for (const call of list) persistedCalls.current.add(callKey(call))
  }

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (video && stream) video.srcObject = stream
  }, [cameraOn])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listSolves().then((entries) => {
      if (!cancelled) setHistoryEntries(entries)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  function rememberPhoto(file: File) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const url = URL.createObjectURL(file)
    photoUrlRef.current = url
    setPhoto({ file, url })
    setQuestions([])
    setSolveMode("all")
    setChosenIndex(0)
    setCalls([])
    persistedCalls.current = new Set()
    setResult(null)
    setFollowUp("")
    setReplies([])
    setFollowUpError(null)
    setAsking(false)
    setHistoryId(null)
    setHistoryNote(null)
    setFailure(null)
    setPhase("crop")
  }

  async function acceptFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setFailure({
        code: "bad_request",
        error: "That file isn't a photo. Use a JPEG, PNG, WebP, or GIF.",
      })
      setPhase("error")
      return
    }
    setPreparing(true)
    setFailure(null)
    try {
      const jpeg = await fileToJpeg(file)
      stopCamera()
      rememberPhoto(jpeg)
    } catch (error) {
      setFailure({
        code: "bad_request",
        error:
          error instanceof Error
            ? error.message
            : "This photo format didn't open. Try a JPEG or PNG.",
      })
      setPhase("error")
    } finally {
      setPreparing(false)
    }
  }

  async function openCamera() {
    setFailure(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setFailure({
        code: "camera",
        error:
          "This browser has no camera API. Upload a photo instead.",
      })
      setPhase("error")
      return
    }
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        })
      }
      streamRef.current = stream
      setCameraOn(true)
      setPhase((current) => (current === "error" ? "idle" : current))
    } catch {
      setFailure({
        code: "camera",
        error:
          "The camera didn't open. Allow camera access, or upload a photo you already have.",
      })
      setPhase("error")
    }
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) {
      setFailure({
        code: "camera",
        error: "The camera is still starting. Wait a moment, then capture.",
      })
      setPhase("error")
      return
    }
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(video, 0, 0)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await acceptFile(new File([blob], "capture.jpg", { type: "image/jpeg" }))
    }, "image/jpeg", 0.92)
  }

  function onCourseChange(value: string) {
    const next = COURSES.find((item) => item.id === value)
    if (!next) return
    setCourse(next.id)
    if (phase === "loading" || phase === "reading") return
    setResult(null)
    setFailure(null)
    if (questions.length > 0) setPhase("choose")
  }

  function readFailure(payload: unknown, responseOk: boolean) {
    if (responseOk) return null
    const record =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown; code?: unknown })
        : {}
    const code =
      record.code === "missing_key" ||
      record.code === "bad_request" ||
      record.code === "model_error"
        ? record.code
        : "model_error"
    return {
      code,
      error:
        typeof record.error === "string"
          ? record.error
          : "Math Buddy couldn't finish that request.",
    } satisfies Failure
  }

  async function readCrop(file: File) {
    setPhase("reading")
    setFailure(null)
    setResult(null)
    setQuestions([])
    setCalls([])
    persistedCalls.current = new Set()
    try {
      const body = new FormData()
      body.set("image", file)
      body.set("course", course)
      body.set("helpMode", helpMode)
      const response = await fetch("/api/questions", { method: "POST", body })
      const payload: unknown = await response.json().catch(() => null)
      const failure = readFailure(payload, response.ok)
      if (failure) {
        const call = callFromPayload(payload)
        setCalls(call ? [call] : [])
        setFailure(failure)
        setPhase("error")
        return
      }
      const found =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { questions?: unknown }).questions)
          ? (payload as { questions: unknown[] }).questions.filter(
              (question): question is string =>
                typeof question === "string" && question.trim().length > 0,
            )
          : []
      if (found.length === 0) {
        setFailure({
          code: "bad_request",
          error:
            "No maths questions were readable in that crop. Move the box or try another photo.",
        })
        setPhase("error")
        return
      }
      setQuestions(found.map((question) => question.trim()))
      setChosenIndex(0)
      setSolveMode("all")
      const call = callFromPayload(payload)
      setCalls(call ? [call] : [])
      setPhase("choose")
    } catch {
      setFailure({
        code: "model_error",
        error: "The request stopped before the questions came back. Try again.",
      })
      setPhase("error")
    }
  }

  async function run(mode: HelpMode) {
    if (!photo || phase === "loading" || phase === "reading" || questions.length === 0) return
    if (solveMode === "one" && !questions[chosenIndex]) return
    const submittedCourse = course
    setHelpMode(mode)
    setPhase("loading")
    setFailure(null)
    setResult(null)
    setReplies([])
    setFollowUp("")
    setFollowUpError(null)
    try {
      const body = new FormData()
      body.set("image", photo.file)
      body.set("course", submittedCourse)
      body.set("helpMode", mode)
      body.set("solveMode", solveMode)
      body.set("questions", JSON.stringify(questions))
      if (solveMode === "one") body.set("question", questions[chosenIndex])
      const response = await fetch("/api/solve", { method: "POST", body })
      const payload: unknown = await response.json().catch(() => null)
      const failure = readFailure(payload, response.ok)
      if (failure) {
        const call = callFromPayload(payload)
        if (call) setCalls(carryCalls(call))
        setFailure(failure)
        setPhase("error")
        return
      }
      const parsed = readSolvePayload(payload)
      if (!parsed) {
        setFailure({
          code: "model_error",
          error: mode === "hint"
            ? "The model did not return a hint."
            : "The model did not return the solution.",
        })
        setPhase("error")
        return
      }
      setResult(parsed)
      setPhase("result")
      const nextCalls = carryCalls(parsed.call)
      setCalls(nextCalls)
      markPersisted(nextCalls)
      const solvedQuestions =
        solveMode === "one"
          ? [questions[chosenIndex]].filter((question): question is string => Boolean(question))
          : questions
      try {
        const saved = await saveSolve({
          course: submittedCourse,
          image: photo.file,
          questions,
          solveMode,
          helpMode: mode,
          chosenIndex,
          solvedQuestions,
          solutions: parsed.solutions,
          replies: [],
          calls: nextCalls,
          provider: parsed.provider,
          model: parsed.model,
        })
        setHistoryId(saved.id)
        setHistoryEntries(await listSolves())
        setHistoryNote(null)
      } catch {
        setHistoryId(null)
        setHistoryNote("This session could not be saved on this device.")
      }
    } catch {
      setFailure({
        code: "model_error",
        error: "The request stopped before a reply came back. Try again.",
      })
      setPhase("error")
    }
  }

  async function askFollowUp() {
    if (!photo || !result || asking || !followUp.trim()) return
    const question = followUp.trim()
    setAsking(true)
    setFollowUpError(null)
    try {
      const body = new FormData()
      body.set("image", photo.file)
      body.set("course", result.course)
      body.set("helpMode", result.helpMode)
      body.set("solved", JSON.stringify(result.solutions))
      body.set("previousReplies", JSON.stringify(replies))
      body.set("followUp", question)
      const response = await fetch("/api/follow-up", { method: "POST", body })
      const payload: unknown = await response.json().catch(() => null)
      const failure = readFailure(payload, response.ok)
      if (failure) {
        const call = callFromPayload(payload)
        if (call) {
          const nextCalls = [...calls, call]
          setCalls(nextCalls)
          if (historyId) {
            try {
              await saveFollowUps(historyId, replies, nextCalls)
              markPersisted(nextCalls)
              setHistoryEntries(await listSolves())
            } catch {
              setHistoryNote("The model call could not be saved on this device.")
            }
          }
        }
        setFollowUpError(failure)
        return
      }
      const reply =
        payload && typeof payload === "object"
          ? (payload as { reply?: unknown }).reply
          : undefined
      const call = callFromPayload(payload)
      if (typeof reply !== "string" || !reply.trim() || !call) {
        setFollowUpError({
          code: "model_error",
          error: result.helpMode === "hint"
            ? "The model did not return a hint."
            : "The model did not answer that follow-up.",
        })
        return
      }
      const nextReplies = [...replies, reply.trim()]
      const nextCalls = [...calls, call]
      setReplies(nextReplies)
      setCalls(nextCalls)
      setFollowUp("")
      if (historyId) {
        try {
          await saveFollowUps(historyId, nextReplies, nextCalls)
          markPersisted(nextCalls)
          setHistoryEntries(await listSolves())
          setHistoryNote(null)
        } catch {
          setHistoryNote("The follow-up could not be saved on this device.")
        }
      }
    } catch {
      setFollowUpError({
        code: "model_error",
        error: "The request stopped before the follow-up came back. Try again.",
      })
    } finally {
      setAsking(false)
    }
  }

  function openSaved(entry: SavedSolve) {
    stopCamera()
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const url = URL.createObjectURL(entry.image)
    photoUrlRef.current = url
    setPhoto({
      file: new File([entry.image], "question.jpg", {
        type: entry.image.type || "image/jpeg",
      }),
      url,
    })
    setCourse(entry.course)
    setQuestions(entry.questions)
    setSolveMode(entry.solveMode)
    setHelpMode(entry.helpMode)
    setChosenIndex(entry.chosenIndex)
    setCalls(entry.calls)
    persistedCalls.current = new Set(entry.calls.map(callKey))
    setResult({
      course: entry.course,
      helpMode: entry.helpMode,
      solutions: entry.solutions,
      provider: entry.provider as SolveSuccess["provider"],
      model: entry.model,
    })
    setReplies(entry.replies)
    setFollowUp("")
    setFollowUpError(null)
    setFailure(null)
    setHistoryId(entry.id)
    setHistoryNote(null)
    setPhase("result")
  }

  const selectedCourse = courseLabel(course)
  const busy = phase === "loading" || phase === "reading" || preparing || asking

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_55%)]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-lg text-primary-foreground"
            >
              π
            </span>
            <div className="min-w-0">
              <p className="font-heading text-lg leading-none text-foreground">
                Math Buddy
              </p>
              <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">
                A photo of the question is enough.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setHistoryOpen(true)}
            >
              History
            </Button>
            <Label htmlFor="course">Course</Label>
            <Select
              value={course}
              onValueChange={onCourseChange}
              disabled={phase === "loading"}
            >
              <SelectTrigger
                id="course"
                aria-describedby="course-hint"
                className="h-11 w-[11.5rem] text-sm sm:w-[16.5rem] sm:text-base"
              >
                <span data-slot="select-value">{selectedCourse}</span>
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="max-h-80">
                {COURSES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      <SolveHistoryDialog
        open={historyOpen}
        entries={historyEntries}
        onClose={() => setHistoryOpen(false)}
        onOpen={openSaved}
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-28 pb-16">
        <p id="course-hint" className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Snap a question from a book, a worksheet, or a screen. Hint gives one
          guiding question and keeps the final answer back. Solve writes the
          answer and the steps. {selectedCourse} sets the ceiling for both.
          Earlier courses get shorter steps and simpler words.
        </p>

        {!status.ready ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>The solver is waiting for a key</AlertTitle>
            <AlertDescription>
              You can still take or upload a photo. Solving will say which
              environment variable to set: OPENAI_API_KEY, XAI_API_KEY,
              GROQ_API_KEY, or ANTHROPIC_API_KEY.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>The question</CardTitle>
              <CardDescription>
                Take a picture with this device&apos;s camera, or upload a photo
                you already have.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {cameraOn ? (
                <div className="flex flex-col gap-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Camera preview"
                    className="aspect-[4/3] w-full rounded-xl bg-foreground object-cover"
                  />
                  <p className="text-sm text-muted-foreground">
                    Line the whole question up in the frame, then capture it.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      size="lg"
                      className="h-11 flex-1 text-base"
                      onClick={captureFrame}
                      disabled={busy}
                    >
                      <Camera />
                      Capture
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className="h-11 flex-1 text-base"
                      onClick={stopCamera}
                      disabled={busy}
                    >
                      Close camera
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    const file = event.dataTransfer.files?.[0]
                    if (file) void acceptFile(file)
                  }}
                  className={`flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center ${
                    dragging
                      ? "border-primary bg-accent"
                      : "border-border bg-muted/40"
                  }`}
                >
                  {photo && phase === "crop" ? (
                    <PhotoCrop
                      url={photo.url}
                      busy={busy}
                      onUse={(file) => {
                        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
                        const url = URL.createObjectURL(file)
                        photoUrlRef.current = url
                        setPhoto({ file, url })
                        void readCrop(file)
                      }}
                    />
                  ) : photo ? (
                    // The preview is a local object URL of the cropped photo.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt="The cropped photo whose questions will be solved"
                      className="max-h-72 w-full rounded-lg object-contain"
                    />
                  ) : (
                    <>
                      <ImagePlus className="size-8 text-primary" />
                      <p className="max-w-xs text-sm leading-relaxed text-foreground">
                        No question yet. Drop a photo here, or use one of the
                        buttons below.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base"
                  onClick={() => void openCamera()}
                  disabled={busy || cameraOn}
                >
                  <Camera />
                  Take a picture
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base"
                  onClick={() => uploadRef.current?.click()}
                  disabled={busy}
                >
                  <Upload />
                  Upload a photo
                </Button>
              </div>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload a photo of a maths question"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) void acceptFile(file)
                }}
              />

              {phase === "choose" ? (
                <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">
                    Which questions?
                  </legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="solve-mode"
                      checked={solveMode === "all"}
                      onChange={() => setSolveMode("all")}
                    />
                    All {questions.length}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="solve-mode"
                      checked={solveMode === "one"}
                      onChange={() => setSolveMode("one")}
                    />
                    One question
                  </label>
                  <Select
                    value={String(chosenIndex)}
                    onValueChange={(value) => setChosenIndex(Number(value))}
                    disabled={solveMode !== "one"}
                  >
                    <SelectTrigger
                      aria-label="Question to use"
                      className="h-11 w-full text-sm"
                    >
                      <span data-slot="select-value">
                        {questions[chosenIndex] || "Choose a question"}
                      </span>
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-80">
                      {questions.map((question, index) => (
                        <SelectItem key={`${index}-${question.slice(0, 24)}`} value={String(index)}>
                          {question}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </fieldset>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="lg"
                  variant={helpMode === "hint" ? "default" : "outline"}
                  className="h-11 text-base"
                  aria-pressed={helpMode === "hint"}
                  disabled={
                    busy ||
                    (questions.length > 0 && solveMode === "one" && !questions[chosenIndex])
                  }
                  onClick={() => {
                    setHelpMode("hint")
                    if (questions.length > 0 && phase !== "crop") void run("hint")
                  }}
                >
                  {phase === "loading" && helpMode === "hint" ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  Hint
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant={helpMode === "solve" ? "default" : "outline"}
                  className="h-11 text-base"
                  aria-pressed={helpMode === "solve"}
                  disabled={
                    busy ||
                    (questions.length > 0 && solveMode === "one" && !questions[chosenIndex])
                  }
                  onClick={() => {
                    setHelpMode("solve")
                    if (questions.length > 0 && phase !== "crop") void run("solve")
                  }}
                >
                  {phase === "loading" && helpMode === "solve" ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  Solve
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Hint follows the tutor: one short hint or guiding question, and
                not the final answer. Solve gives the answer and the steps.
                {questions.length === 0
                  ? " Choose one before the photo, then press it again after the questions are listed."
                  : " Press Hint or Solve to run the questions you picked."}
              </p>
              {photo && phase !== "crop" && phase !== "reading" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base"
                  disabled={busy}
                  onClick={() => {
                    setFailure(null)
                    setResult(null)
                    setPhase("crop")
                  }}
                >
                  Crop again
                </Button>
              ) : null}
              {preparing ? (
                <p className="text-sm text-muted-foreground">
                  Preparing the photo…
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card aria-busy={phase === "loading"} data-phase={phase}>
            <CardHeader>
              <CardTitle>The working</CardTitle>
              <CardDescription>
                Written for the course selected at the top.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {phase === "reading" || phase === "loading" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-h-52 flex-col items-start justify-center gap-3"
                >
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-base leading-relaxed">
                    {phase === "reading"
                      ? "Reading every question in the crop. Not hinting or solving yet."
                      : helpMode === "hint"
                        ? `Writing one hint for ${selectedCourse}. The final answer stays back.`
                        : `Writing the steps for ${selectedCourse}.`}
                  </p>
                </div>
              ) : null}

              {phase === "error" && failure ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>{FAILURE_TITLES[failure.code]}</AlertTitle>
                  <AlertDescription>{failure.error}</AlertDescription>
                </Alert>
              ) : null}

              {phase === "error" && failure && photo && failure.code !== "camera" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base"
                  onClick={() => {
                    setFailure(null)
                    if (questions.length > 0) {
                      setPhase("choose")
                      return
                    }
                    setPhase("crop")
                  }}
                >
                  <RotateCcw />
                  Try again
                </Button>
              ) : null}

              {phase === "result" && result ? (
                <div className="flex flex-col gap-8">
                  <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                    {courseLabel(result.course)}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {result.helpMode === "hint"
                      ? solveMode === "all"
                        ? `Hint for all ${questions.length} questions in this crop.`
                        : `Hint for question ${chosenIndex + 1} of ${questions.length}.`
                      : solveMode === "all"
                        ? `All ${questions.length} questions in this crop were solved.`
                        : `Solved question ${chosenIndex + 1} of ${questions.length}.`}
                  </p>
                  {historyNote ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {historyNote}
                    </p>
                  ) : null}
                  {result.solutions.map((solution, solutionIndex) => (
                    <div key={`${solutionIndex}-${solution.question.slice(0, 24)}`} className="flex flex-col gap-4">
                      {solution.question ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-semibold text-muted-foreground">
                            {result.solutions.length > 1
                              ? `Question ${solutionIndex + 1}`
                              : "From the photo"}
                          </p>
                          <MathCopy text={solution.question} paragraphClassName="leading-relaxed" />
                        </div>
                      ) : null}
                      {result.helpMode === "hint" ? (
                        <div className="rounded-xl bg-accent px-4 py-3">
                          <p className="text-sm font-semibold text-muted-foreground">
                            Hint
                          </p>
                          <MathCopy
                            text={solution.hint}
                            paragraphClassName="font-heading text-2xl leading-snug text-foreground"
                          />
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            The final answer is not shown.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-xl bg-accent px-4 py-3">
                            <p className="text-sm font-semibold text-muted-foreground">
                              Answer
                            </p>
                            <MathCopy
                              text={solution.answer}
                              paragraphClassName="font-heading text-2xl leading-snug text-foreground"
                            />
                          </div>
                          <div className="flex flex-col gap-3">
                            <p className="text-sm font-semibold text-muted-foreground">
                              How to get there
                            </p>
                            {solution.steps.length > 0 ? (
                              <ol className="flex flex-col gap-3">
                                {solution.steps.map((step, index) => (
                                  <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-3">
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                      {index + 1}
                                    </span>
                                    <MathCopy
                                      text={step}
                                      className="pt-0.5"
                                      paragraphClassName="leading-relaxed"
                                    />
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="leading-relaxed text-muted-foreground">
                                The model gave an answer without listing steps.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  <form
                    className="flex flex-col gap-3 border-t border-border pt-5"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void askFollowUp()
                    }}
                  >
                    <Label htmlFor="follow-up">Ask a follow-up</Label>
                    <textarea
                      id="follow-up"
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      rows={3}
                      placeholder={
                        result.helpMode === "hint"
                          ? "Say what you tried. The reply is another hint, not the answer."
                          : "Ask about a step, a word, or why this works."
                      }
                      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <Button
                      type="submit"
                      size="lg"
                      className="h-11 self-start text-base"
                      disabled={asking || !followUp.trim()}
                    >
                      {asking ? (
                        <>
                          <Loader2 className="animate-spin" />
                          {result.helpMode === "hint"
                            ? `Writing another hint inside ${courseLabel(result.course)}`
                            : `Answering inside ${courseLabel(result.course)}`}
                        </>
                      ) : (
                        "Ask"
                      )}
                    </Button>
                    {followUpError ? (
                      <Alert variant="destructive">
                        <CircleAlert />
                        <AlertTitle>{FAILURE_TITLES[followUpError.code]}</AlertTitle>
                        <AlertDescription>{followUpError.error}</AlertDescription>
                      </Alert>
                    ) : null}
                    {replies.map((reply, index) => (
                      <div key={`${index}-${reply.slice(0, 24)}`} className="flex flex-col gap-1">
                        <p className="text-sm font-semibold text-muted-foreground">
                          Follow-up {index + 1}
                        </p>
                        <MathCopy text={reply} paragraphClassName="leading-relaxed" />
                      </div>
                    ))}
                  </form>
                </div>
              ) : null}

              {phase === "choose" ? (
                <div className="flex min-h-52 flex-col justify-center gap-2">
                  <p className="font-heading text-xl leading-snug">
                    {questions.length} question{questions.length === 1 ? "" : "s"} found.
                  </p>
                  <p className="max-w-md leading-relaxed text-muted-foreground">
                    Use all of them, or pick one from the list, then press Hint or
                    Solve. The working stays inside {selectedCourse}.
                  </p>
                </div>
              ) : null}

              {phase === "idle" || phase === "crop" ? (
                <div className="flex min-h-52 flex-col justify-center gap-2">
                  <p className="font-heading text-xl leading-snug">
                    Nothing solved yet.
                  </p>
                  <p className="max-w-md leading-relaxed text-muted-foreground">
                    After you press Hint or Solve, the hint or the full working
                    lands here, using only ideas taught up through {selectedCourse}.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
