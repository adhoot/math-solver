import { parseCourse } from "@/lib/course"
import { readUploadedImage } from "@/lib/uploaded-image"
import { helpModeFromForm } from "@/lib/model-call"
import {
  MISSING_KEY_MESSAGE,
  ModelReplyError,
  readQuestionsFromImage,
  visionStatus,
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

  const uploaded = await readUploadedImage(formData)
  if (!uploaded.ok) return jsonError(400, "bad_request", uploaded.error)

  const course = parseCourse(formData.get("course"))
  if (!course) {
    return jsonError(400, "bad_request", "Choose a math course before reading the photo.")
  }

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const result = await readQuestionsFromImage({
      course,
      mode: helpModeFromForm(formData.get("helpMode")),
      mimeType: uploaded.image.mimeType,
      bytes: uploaded.image.bytes,
    })
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not read the questions in this photo."
    const call = error instanceof ModelReplyError ? error.call : undefined
    if (message === MISSING_KEY_MESSAGE) {
      return Response.json({ error: message, code: "missing_key", call }, { status: 503 })
    }
    return Response.json({ error: message, code: "model_error", call }, { status: 502 })
  }
}
