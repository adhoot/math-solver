"use client"

import { courseLabel } from "@/lib/course"
import { CALL_KIND_LABEL, type ModelCallLog } from "@/lib/model-call"

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function ModelCallLogList({ calls }: { calls: ModelCallLog[] }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Model calls</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Stored in IndexedDB on this device with the saved solve. The photo is
        the cropped picture above. Each entry is the text sent to the model
        and the raw text it sent back. Nothing here is uploaded anywhere else.
      </p>
      {calls.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No model calls were stored with this solve.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {calls.map((call, index) => (
            <li
              key={`${call.kind}-${call.startedAt}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-border p-3"
            >
              <p className="text-sm font-semibold">
                {CALL_KIND_LABEL[call.kind]}
                {call.mode ? ` · ${call.mode === "hint" ? "Hint" : "Solve"}` : ""}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {courseLabel(call.course)}
                {call.provider ? ` · ${call.provider}` : ""}
                {call.model ? ` · ${call.model}` : ""}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sent {formatStamp(call.startedAt)}
                {" · "}
                Reply {formatStamp(call.finishedAt)}
              </p>
              <details open>
                <summary className="cursor-pointer text-sm font-semibold">
                  Request
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed">
                  {call.request}
                </pre>
              </details>
              <details open>
                <summary className="cursor-pointer text-sm font-semibold">
                  Raw model text
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed">
                  {call.reply}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
