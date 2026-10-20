"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type Rect = { x: number; y: number; w: number; h: number }
type Handle = "move" | "nw" | "ne" | "sw" | "se"

const MIN = 0.08

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resize(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  let x = start.x
  let y = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h

  if (handle === "move") {
    const w = start.w
    const h = start.h
    return {
      x: clamp(start.x + dx, 0, 1 - w),
      y: clamp(start.y + dy, 0, 1 - h),
      w,
      h,
    }
  }
  if (handle === "nw" || handle === "sw") x = clamp(start.x + dx, 0, right - MIN)
  if (handle === "ne" || handle === "se") {
    right = clamp(right + dx, x + MIN, 1)
  }
  if (handle === "nw" || handle === "ne") y = clamp(start.y + dy, 0, bottom - MIN)
  if (handle === "sw" || handle === "se") {
    bottom = clamp(bottom + dy, y + MIN, 1)
  }
  return { x, y, w: right - x, h: bottom - y }
}

export function PhotoCrop({
  url,
  busy,
  onUse,
}: {
  url: string
  busy: boolean
  onUse: (file: File) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ handle: Handle; x: number; y: number; rect: Rect } | null>(
    null,
  )
  const [rect, setRect] = useState<Rect>({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 })

  function fraction(event: React.PointerEvent) {
    const img = imgRef.current
    if (!img) return null
    const box = img.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    }
  }

  function startDrag(event: React.PointerEvent, handle: Handle) {
    if (busy) return
    const point = fraction(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { handle, x: point.x, y: point.y, rect }
  }

  function moveDrag(event: React.PointerEvent) {
    const current = drag.current
    if (!current) return
    const point = fraction(event)
    if (!point) return
    setRect(
      resize(current.rect, current.handle, point.x - current.x, point.y - current.y),
    )
  }

  function endDrag() {
    drag.current = null
  }

  async function confirm(wholePhoto: boolean) {
    const img = imgRef.current
    if (!img || img.naturalWidth === 0) return
    const region = wholePhoto ? { x: 0, y: 0, w: 1, h: 1 } : rect
    const sx = Math.round(region.x * img.naturalWidth)
    const sy = Math.round(region.y * img.naturalHeight)
    const sw = Math.max(1, Math.round(region.w * img.naturalWidth))
    const sh = Math.max(1, Math.round(region.h * img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = sw
    canvas.height = sh
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    })
    if (!blob) return
    onUse(new File([blob], "question.jpg", { type: "image/jpeg" }))
  }

  const handles: Array<{ id: Handle; className: string }> = [
    { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { id: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
    { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative inline-block max-w-full touch-none overflow-hidden rounded-lg"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* The crop source is a local object URL of the user's photo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt="Photo to crop before the questions are read"
          draggable={false}
          className="block max-h-[28rem] max-w-full rounded-lg"
        />
        <div
          role="presentation"
          className="absolute cursor-move border-2 border-primary bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
          }}
          onPointerDown={(event) => startDrag(event, "move")}
        >
          {handles.map((handle) => (
            <button
              key={handle.id}
              type="button"
              aria-label={`Drag the ${handle.id} corner of the crop`}
              className={`absolute size-4 rounded-full border-2 border-primary bg-background ${handle.className}`}
              onPointerDown={(event) => startDrag(event, handle.id)}
            />
          ))}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Drag the box so it covers the questions you want. Nothing is read until
        you keep this crop.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="h-11 flex-1 text-base"
          disabled={busy}
          onClick={() => void confirm(false)}
        >
          Use this crop
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-11 flex-1 text-base"
          disabled={busy}
          onClick={() => void confirm(true)}
        >
          Use the whole photo
        </Button>
      </div>
    </div>
  )
}
