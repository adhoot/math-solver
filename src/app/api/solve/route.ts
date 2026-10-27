import { parseCourse } from "@/lib/course"
import { helpModeFromForm } from "@/lib/model-call"
import { readUploadedImage } from "@/lib/uploaded-image"
import {
  MISSING_KEY_MESSAGE,
  ModelReplyError,
  solveFromImage,
  visionStatus,
  type SolveSelection,
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

function readSelection(formData: FormData): SolveSelection | string {
  const mode = formData.get("solveMode")
  const questionsRaw = formData.get("questions")
  let questions: string[] = []
  if (typeof questionsRaw === "string" && questionsRaw.trim()) {
    try {
      const parsed: unknown = JSON.parse(questionsRaw)
      if (
        !Array.isArray(parsed) ||
        parsed.some((question) => typeof question !== "string")
      ) {
        return "The question list was not readable. Crop the photo again."
      }
      questions = parsed.map((question) => question.trim()).filter(Boolean)
    } catch {
      return "The question list was not readable. Crop the photo again."
    }
  }

  if (mode === "all") {
    if (questions.length === 0) {
      return "Read the questions in the crop before solving."
    }
    return { mode: "all", questions }
  }

  if (mode === "one") {
    const question = formData.get("question")
    if (typeof question !== "string" || !question.trim()) {
      return "Choose a question from the list before solving."
    }
    return { mode: "one", question: question.trim() }
  }

  return "Choose whether to solve all the questions or just one."
}

export async function GET() {
  return Response.json(visionStatus())
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonError(
      400,
      "bad_request",
      "The photo did not arrive in one piece. Try sending it again.",
    )
  }

  const course = parseCourse(formData.get("course"))
  if (!course) {
    return jsonError(400, "bad_request", "Choose a math course before solving.")
  }

  const helpMode = helpModeFromForm(formData.get("helpMode"))
  if (!helpMode) {
    return jsonError(400, "bad_request", "Choose Hint or Solve before running the photo.")
  }

  const selection = readSelection(formData)
  if (typeof selection === "string") {
    return jsonError(400, "bad_request", selection)
  }

  const uploaded = await readUploadedImage(formData)
  if (!uploaded.ok) return jsonError(400, "bad_request", uploaded.error)

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const result = await solveFromImage({
      course,
      helpMode,
      selection,
      ...uploaded.image,
    })
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not finish this photo."
    const call = error instanceof ModelReplyError ? error.call : undefined
    if (message === MISSING_KEY_MESSAGE) {
      return Response.json({ error: message, code: "missing_key", call }, { status: 503 })
    }
    return Response.json({ error: message, code: "model_error", call }, { status: 502 })
  }
}
