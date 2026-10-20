import { parseCourse } from "@/lib/course"
import { readUploadedImage } from "@/lib/uploaded-image"
import {
  MISSING_KEY_MESSAGE,
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
      if (typeof record.answer !== "string" || !record.answer.trim()) return null
      const steps = Array.isArray(record.steps)
        ? record.steps.filter((step): step is string => typeof step === "string")
        : []
      solved.push({
        question: typeof record.question === "string" ? record.question : "",
        answer: record.answer.trim(),
        steps,
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

  const solved = readSolved(formData.get("solved"))
  if (!solved) {
    return jsonError(
      400,
      "bad_request",
      "The solution was missing, so the follow-up had nothing to refer to.",
    )
  }

  const uploaded = await readUploadedImage(formData)
  if (!uploaded.ok) return jsonError(400, "bad_request", uploaded.error)

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const reply = await answerFollowUp({
      course,
      solved,
      previousReplies: readReplies(formData.get("previousReplies")),
      followUp: followUp.trim(),
      ...uploaded.image,
    })
    return Response.json({ course, reply })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not answer that follow-up."
    if (message === MISSING_KEY_MESSAGE) {
      return jsonError(503, "missing_key", message)
    }
    return jsonError(502, "model_error", message)
  }
}
