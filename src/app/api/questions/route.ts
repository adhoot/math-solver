import { readUploadedImage } from "@/lib/uploaded-image"
import {
  MISSING_KEY_MESSAGE,
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

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const questions = await readQuestionsFromImage(uploaded.image)
    return Response.json({ questions })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not read the questions in this photo."
    if (message === MISSING_KEY_MESSAGE) {
      return jsonError(503, "missing_key", message)
    }
    return jsonError(502, "model_error", message)
  }
}
