"use client"

import { useEffect, useState } from "react"
import { courseLabel } from "@/lib/course"
import type { SavedSolve } from "@/lib/solve-history"
import { Button } from "@/components/ui/button"

export function SolveHistoryDialog({
  open,
  entries,
  onClose,
  onOpen,
}: {
  open: boolean
  entries: SavedSolve[]
  onClose: () => void
  onOpen: (entry: SavedSolve) => void
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const next: Record<string, string> = {}
    for (const entry of entries) {
      next[entry.id] = URL.createObjectURL(entry.image)
    }
    setThumbs(next)
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url)
    }
  }, [open, entries])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close history"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="history-title" className="font-heading text-2xl">
            History
          </h2>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saved on this device. Opening one shows the cropped photo, the hint
          or the solution, any follow-ups, and the model calls from that session.
        </p>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm leading-relaxed text-muted-foreground">
            No saved sessions yet. After you hint or solve a photo, it stays
            here so you can open it again.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              const when = new Date(entry.updatedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
              const modeLabel = entry.helpMode === "hint" ? "Hint" : "Solve"
              const solved =
                entry.solveMode === "all"
                  ? `${modeLabel} · all ${entry.questions.length} questions`
                  : `${modeLabel} · ${entry.solvedQuestions[0] || "one question"}`
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    className="flex w-full gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
                  >
                    {thumbs[entry.id] ? (
                      // Thumbnail of the cropped photo stored on this device.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbs[entry.id]}
                        alt=""
                        className="size-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="size-16 shrink-0 rounded-lg bg-muted" />
                    )}
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-semibold">
                        {courseLabel(entry.course)}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {solved}
                      </span>
                      <span className="text-xs text-muted-foreground">{when}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
