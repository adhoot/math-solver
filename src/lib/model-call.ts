import { parseCourse, type CourseId } from "@/lib/course"

export type HelpMode = "hint" | "solve"

export type CallKind = "questions" | "hint" | "solve" | "follow-up"

/** Text of one vision-model call. Stored on the device with the solve. No image bytes and no API key. */
export type ModelCallLog = {
  kind: CallKind
  course: CourseId
  mode: HelpMode | null
  startedAt: number
  finishedAt: number
  provider: string
  model: string
  request: string
  reply: string
}

export const CALL_KIND_LABEL: Record<CallKind, string> = {
  questions: "Question read",
  hint: "Hint",
  solve: "Solve",
  "follow-up": "Follow-up",
}

export function isHelpMode(value: unknown): value is HelpMode {
  return value === "hint" || value === "solve"
}

export function helpModeFromForm(value: unknown): HelpMode | null {
  return isHelpMode(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

export function readModelCall(value: unknown): ModelCallLog | null {
  if (!isRecord(value)) return null
  const kind = value.kind
  if (
    kind !== "questions" &&
    kind !== "hint" &&
    kind !== "solve" &&
    kind !== "follow-up"
  ) {
    return null
  }
  const course = parseCourse(value.course)
  if (!course) return null
  if (typeof value.request !== "string" || typeof value.reply !== "string") return null
  if (typeof value.startedAt !== "number" || typeof value.finishedAt !== "number") {
    return null
  }
  return {
    kind,
    course,
    mode: isHelpMode(value.mode) ? value.mode : null,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    provider: typeof value.provider === "string" ? value.provider : "",
    model: typeof value.model === "string" ? value.model : "",
    request: value.request,
    reply: value.reply,
  }
}
