import { parseCourse } from "@/lib/course"
import { helpModeFromForm } from "@/lib/model-call"
import { readUploadedImage } from "@/lib/uploaded-image"
import {
  MISSING_KEY_MESSAGE,
  ModelReplyError,
  answerFollowUp,
  visionStatus,
  type SolvedQuestion,
} from "@/lib/vision"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function jsonError(
  status: number,
  code: "missing_key" | "bad_request" | "model_error",
  error: string,
) {
  return Response.json({ error, code }, { status })
}

function readSolved(value: FormDataEntryValue | null): SolvedQuestion[] | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const solved: SolvedQuestion[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const answer = typeof record.answer === "string" ? record.answer.trim() : ""
      const hint = typeof record.hint === "string" ? record.hint.trim() : ""
      if (!answer && !hint) return null
      const steps = Array.isArray(record.steps)
        ? record.steps.filter((step): step is string => typeof step === "string")
        : []
      solved.push({
        question: typeof record.question === "string" ? record.question : "",
        answer,
        steps,
        hint,
      })
    }
    return solved
  } catch {
    return null
  }
}

function readReplies(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((reply): reply is string => typeof reply === "string")
  } catch {
    return []
  }
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonError(
      400,
      "bad_request",
      "The follow-up did not arrive in one piece. Try sending it again.",
    )
  }

  const course = parseCourse(formData.get("course"))
  if (!course) {
    return jsonError(400, "bad_request", "Choose a math course before asking.")
  }

  const followUp = formData.get("followUp")
  if (typeof followUp !== "string" || !followUp.trim()) {
    return jsonError(400, "bad_request", "Type a follow-up before asking.")
  }

  const helpMode = helpModeFromForm(formData.get("helpMode"))
  if (!helpMode) {
    return jsonError(400, "bad_request", "Choose Hint or Solve before asking a follow-up.")
  }

  const solved = readSolved(formData.get("solved"))
  if (!solved) {
    return jsonError(
      400,
      "bad_request",
      "The earlier working was missing, so the follow-up had nothing to refer to.",
    )
  }

  const uploaded = await readUploadedImage(formData)
  if (!uploaded.ok) return jsonError(400, "bad_request", uploaded.error)

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const result = await answerFollowUp({
      course,
      helpMode,
      solved,
      previousReplies: readReplies(formData.get("previousReplies")),
      followUp: followUp.trim(),
      ...uploaded.image,
    })
    return Response.json({ course, helpMode, reply: result.reply, call: result.call })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not answer that follow-up."
    const call = error instanceof ModelReplyError ? error.call : undefined
    if (message === MISSING_KEY_MESSAGE) {
      return Response.json({ error: message, code: "missing_key", call }, { status: 503 })
    }
    return Response.json({ error: message, code: "model_error", call }, { status: 502 })
  }
}
