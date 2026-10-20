import { parseCourse } from "@/lib/course"
import {
  MISSING_KEY_MESSAGE,
  solveFromImage,
  visionStatus,
} from "@/lib/vision"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_BYTES = 8_000_000

const MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

function jsonError(
  status: number,
  code: "missing_key" | "bad_request" | "model_error",
  error: string,
) {
  return Response.json({ error, code }, { status })
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
    return jsonError(
      400,
      "bad_request",
      "Choose a math course before solving.",
    )
  }

  const image = formData.get("image")
  if (!(image instanceof File) || image.size === 0) {
    return jsonError(
      400,
      "bad_request",
      "Add a photo of the question, then solve it.",
    )
  }

  const mimeType = image.type === "image/jpg" ? "image/jpeg" : image.type
  if (!MIME_TYPES.has(image.type)) {
    return jsonError(
      400,
      "bad_request",
      "Use a JPEG, PNG, WebP, or GIF photo of the question.",
    )
  }
  if (image.size > MAX_BYTES) {
    return jsonError(
      400,
      "bad_request",
      "That photo is larger than 8 MB. Take a closer crop or upload a smaller one.",
    )
  }

  if (!visionStatus().ready) {
    return jsonError(503, "missing_key", MISSING_KEY_MESSAGE)
  }

  try {
    const bytes = Buffer.from(await image.arrayBuffer())
    const result = await solveFromImage({ course, mimeType, bytes })
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The vision model could not solve this photo."
    if (message === MISSING_KEY_MESSAGE) {
      return jsonError(503, "missing_key", message)
    }
    return jsonError(502, "model_error", message)
  }
}
