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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { COURSES, courseLabel, type CourseId } from "@/lib/course"
import type { SolveSuccess, VisionStatus } from "@/lib/vision"

type Failure = {
  error: string
  code: "missing_key" | "bad_request" | "model_error" | "camera"
}

type Phase = "idle" | "loading" | "result" | "error"

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
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<SolveSuccess | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [preparing, setPreparing] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const photoUrlRef = useRef<string | null>(null)

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
    setResult(null)
    setFailure(null)
    setPhase("idle")
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
          "This browser has no camera API. Use Take a photo, or upload a picture you already have.",
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
          "No camera opened. On a phone, use Take a photo. On a computer, upload a picture of the question.",
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
    if (phase !== "loading") {
      setResult(null)
      setFailure(null)
      setPhase("idle")
    }
  }

  async function solve() {
    if (!photo || phase === "loading") return
    const submittedCourse = course
    setPhase("loading")
    setFailure(null)
    setResult(null)
    try {
      const body = new FormData()
      body.set("image", photo.file)
      body.set("course", submittedCourse)
      const response = await fetch("/api/solve", { method: "POST", body })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
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
        setFailure({
          code,
          error:
            typeof record.error === "string"
              ? record.error
              : "Math Buddy couldn't solve that photo.",
        })
        setPhase("error")
        return
      }
      setResult(payload as SolveSuccess)
      setPhase("result")
    } catch {
      setFailure({
        code: "model_error",
        error: "The request stopped before an answer came back. Try again.",
      })
      setPhase("error")
    }
  }

  const selectedCourse = courseLabel(course)
  const busy = phase === "loading" || preparing

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

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-28 pb-16">
        <p id="course-hint" className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Snap a question from a book, a worksheet, or a screen. {selectedCourse}{" "}
          sets the ceiling: the solution uses only ideas taught up through that
          course. Earlier courses get shorter steps and simpler words.
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
                Use this device&apos;s camera, the phone camera app, or a photo
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
                  {photo ? (
                    // The preview is a local object URL of the user's photo.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt="The question you are about to solve"
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
                  disabled={busy}
                >
                  <Camera />
                  Use camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base"
                  onClick={() => captureRef.current?.click()}
                  disabled={busy}
                >
                  <Camera />
                  Take a photo
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
                ref={captureRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Take a photo with the camera app"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) void acceptFile(file)
                }}
              />
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

              <Button
                type="button"
                size="lg"
                className="h-11 text-base"
                onClick={() => void solve()}
                disabled={!photo || busy}
              >
                {phase === "loading" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Solving for {selectedCourse}
                  </>
                ) : (
                  <>Solve for {selectedCourse}</>
                )}
              </Button>
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
              {phase === "loading" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-h-52 flex-col items-start justify-center gap-3"
                >
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-base leading-relaxed">
                    Reading the question and writing the steps for{" "}
                    {selectedCourse}.
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
                  onClick={() => void solve()}
                >
                  <RotateCcw />
                  Try again
                </Button>
              ) : null}

              {phase === "result" && result ? (
                <div className="flex flex-col gap-5">
                  <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                    {courseLabel(result.course)}
                  </p>
                  {result.question ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-muted-foreground">
                        From the photo
                      </p>
                      <p className="leading-relaxed">{result.question}</p>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-accent px-4 py-3">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Answer
                    </p>
                    <p className="font-heading text-2xl leading-snug text-foreground">
                      {result.answer}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold text-muted-foreground">
                      How to get there
                    </p>
                    {result.steps.length > 0 ? (
                      <ol className="flex flex-col gap-3">
                        {result.steps.map((step, index) => (
                          <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              {index + 1}
                            </span>
                            <p className="pt-0.5 leading-relaxed">{step}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="leading-relaxed text-muted-foreground">
                        The model gave an answer without listing steps. Try the
                        photo again if you want the working.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {phase === "idle" ? (
                <div className="flex min-h-52 flex-col justify-center gap-2">
                  <p className="font-heading text-xl leading-snug">
                    Nothing solved yet.
                  </p>
                  <p className="max-w-md leading-relaxed text-muted-foreground">
                    When you send a photo, the answer and the working land here,
                    using only ideas taught up through {selectedCourse}.
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
