export const MAX_IMAGE_BYTES = 8_000_000

const MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

export type UploadedImage = {
  bytes: Buffer
  mimeType: string
}

export async function readUploadedImage(
  formData: FormData,
): Promise<{ ok: true; image: UploadedImage } | { ok: false; error: string }> {
  const image = formData.get("image")
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "Add a photo of the question, then try again." }
  }
  if (!MIME_TYPES.has(image.type)) {
    return {
      ok: false,
      error: "Use a JPEG, PNG, WebP, or GIF photo of the question.",
    }
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error:
        "That photo is larger than 8 MB. Take a closer crop or upload a smaller one.",
    }
  }
  const mimeType = image.type === "image/jpg" ? "image/jpeg" : image.type
  return {
    ok: true,
    image: { bytes: Buffer.from(await image.arrayBuffer()), mimeType },
  }
}
