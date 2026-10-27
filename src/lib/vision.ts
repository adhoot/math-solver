import { courseGuidance, courseLabel, type CourseId } from "@/lib/course"
import { MATH_TUTOR_SYSTEM_PROMPT } from "@/lib/math-tutor-system-prompt"
import {
  type CallKind,
  type HelpMode,
  type ModelCallLog,
} from "@/lib/model-call"

export const MISSING_KEY_MESSAGE =
  "Math Buddy has no vision model key yet. Set OPENAI_API_KEY, XAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY on the server, then try the photo again."

const PROVIDERS = [
  {
    id: "openai",
    env: "OPENAI_API_KEY",
    model: "gpt-4.1-mini",
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
  },
  {
    id: "xai",
    env: "XAI_API_KEY",
    model: "grok-4.6",
    label: "xAI",
    url: "https://api.x.ai/v1/chat/completions",
  },
  {
    id: "groq",
    env: "GROQ_API_KEY",
    model: "qwen/qwen3.8-27b",
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    id: "anthropic",
    env: "ANTHROPIC_API_KEY",
    model: "claude-sonnet-5",
    label: "Anthropic",
    url: "https://api.anthropic.com/v1/messages",
  },
] as const

type Provider = (typeof PROVIDERS)[number]

export type VisionReady = {
  ready: true
  provider: Provider["label"]
  model: string
}

export type VisionMissing = {
  ready: false
  code: "missing_key"
  message: string
}

export type VisionStatus = VisionReady | VisionMissing

export type SolvedQuestion = {
  question: string
  answer: string
  steps: string[]
  hint: string
}

export type SolveSelection =
  | { mode: "all"; questions: string[] }
  | { mode: "one"; question: string }

export type SolveSuccess = {
  course: CourseId
  helpMode: HelpMode
  solutions: SolvedQuestion[]
  provider: Provider["label"]
  model: string
  call: ModelCallLog
}

export type FollowUpSuccess = {
  reply: string
  call: ModelCallLog
}

type ActiveProvider = Provider & { key: string }

export class ModelReplyError extends Error {
  call: ModelCallLog

  constructor(message: string, call: ModelCallLog) {
    super(message)
    this.name = "ModelReplyError"
    this.call = call
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function activeProvider(): ActiveProvider | null {
  for (const provider of PROVIDERS) {
    const key = readEnv(provider.env)
    if (key) return { ...provider, key }
  }
  return null
}

export function visionStatus(): VisionStatus {
  const provider = activeProvider()
  if (!provider) {
    return { ready: false, code: "missing_key", message: MISSING_KEY_MESSAGE }
  }
  return { ready: true, provider: provider.label, model: provider.model }
}

function selectionLines(selection: SolveSelection): string[] {
  if (selection.mode === "one") return [selection.question]
  return selection.questions.map((question, index) => `${index + 1}. ${question}`)
}

const COURSE_PLACEHOLDER = "{{course}}"

/** Tutor template with the selected course filled in. Hint turns use this. Solve turns do not. */
function tutorSystemPrompt(course: CourseId): string {
  const label = courseLabel(course)
  if (!MATH_TUTOR_SYSTEM_PROMPT.includes(COURSE_PLACEHOLDER)) {
    throw new Error("The tutor prompt is missing the course placeholder.")
  }
  const filled = MATH_TUTOR_SYSTEM_PROMPT.replaceAll(COURSE_PLACEHOLDER, label)
  if (filled.includes(COURSE_PLACEHOLDER)) {
    throw new Error("The selected course was not applied to the tutor prompt.")
  }
  return [filled.trimEnd(), courseGuidance(course)].join("\n\n")
}

function courseSystem(course: CourseId): string {
  const label = courseLabel(course)
  return [
    "You are Math Buddy, a patient maths tutor.",
    `The student is taking ${label}.`,
    courseGuidance(course),
  ].join("\n")
}

function questionSystem(course: CourseId): string {
  const label = courseLabel(course)
  return [
    "You are Math Buddy.",
    `The student is taking ${label}.`,
    "Read every distinct maths question visible in the image, from top to bottom.",
    "Do not solve anything. Do not give answers, hints, or steps.",
    "Skip page numbers, names, scores, and instructions that are not themselves questions.",
    "Copy each question as its own plain-text item.",
    "Return only a JSON object with this shape and no markdown:",
    '{"questions":["question 1","question 2"]}',
    "If the image has no maths question, return {\"questions\":[]}.",
  ].join("\n")
}

const QUESTION_USER =
  "List every maths question in this picture. Do not solve them. Reply with the JSON object only."

function hintRequest(course: CourseId, selection: SolveSelection): string {
  const label = courseLabel(course)
  const scope =
    selection.mode === "one"
      ? [
          "Give a hint for only this question. Ignore every other question in the picture:",
          selection.question,
        ]
      : [
          "Give each listed question its own hint, and no others.",
          ...selectionLines(selection),
        ]
  return [
    ...scope,
    `Stay inside ${label}.`,
    "Follow the tutor instructions in the system prompt.",
    "Write one short hint or one guiding question.",
    "Do not give the final answer.",
    "Do not give the complete step-by-step solution.",
    "If a diagram matters, mention only the fact the student should look at.",
    "Return only a JSON object with this shape and no markdown fence:",
    '{"solutions":[{"question":"the question in plain text","hint":"one short hint or guiding question"}]}',
  ].join("\n")
}

function solveRequest(course: CourseId, selection: SolveSelection): string {
  const label = courseLabel(course)
  const scope =
    selection.mode === "one"
      ? [
          "Solve only this question. Ignore every other question in the picture:",
          selection.question,
        ]
      : [
          "Solve every question listed here, and no others. Give each question its own solution.",
          ...selectionLines(selection),
        ]
  return [
    ...scope,
    `Stay inside ${label}.`,
    "Solve the chosen question or questions correctly.",
    `Every word of the explanation must stay inside ${label}.`,
    "If a diagram matters, describe the facts you used from it.",
    "If the image is not a maths question, say so in the answer and explain what you saw in the steps.",
    "Return only a JSON object with this shape and no markdown:",
    '{"solutions":[{"question":"the question in plain text","answer":"the final answer only","steps":["step 1","step 2"]}]}',
  ].join("\n")
}

function parseQuestions(text: string): string[] {
  const record = parseJsonObject(text)
  if (!Array.isArray(record.questions)) {
    throw new Error("The model did not list the questions.")
  }
  return record.questions
    .map((question) => (typeof question === "string" ? question.trim() : ""))
    .filter(Boolean)
}

function rawSolutions(record: Record<string, unknown>, fallbackKey: string): unknown[] | null {
  if (Array.isArray(record.solutions)) return record.solutions
  if (typeof record[fallbackKey] === "string" && record[fallbackKey]) return [record]
  return null
}

function parseSolutions(text: string, helpMode: HelpMode): SolvedQuestion[] {
  const record = parseJsonObject(text)
  const rawList = rawSolutions(record, helpMode === "hint" ? "hint" : "answer")
  if (!rawList) {
    throw new Error(
      helpMode === "hint"
        ? "The model did not return a hint."
        : "The model did not return the solutions.",
    )
  }
  const solutions = rawList.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error(
        helpMode === "hint"
          ? "The model did not return a hint."
          : "The model did not return the solutions.",
      )
    }
    const solution = item as Record<string, unknown>
    const question =
      typeof solution.question === "string" ? solution.question.trim() : ""
    if (helpMode === "hint") {
      if (typeof solution.hint !== "string" || !solution.hint.trim()) {
        throw new Error("The model did not return a hint.")
      }
      return { question, answer: "", steps: [], hint: solution.hint.trim() }
    }
    if (typeof solution.answer !== "string" || !solution.answer.trim()) {
      throw new Error("The model left out the final answer.")
    }
    if (!Array.isArray(solution.steps)) {
      throw new Error("The model left out the steps.")
    }
    const steps = solution.steps
      .map((step) => (typeof step === "string" ? step.trim() : ""))
      .filter(Boolean)
    return { question, answer: solution.answer.trim(), steps, hint: "" }
  })
  if (solutions.length === 0) {
    throw new Error(
      helpMode === "hint"
        ? "The model did not return a hint."
        : "The model did not return the solutions.",
    )
  }
  return solutions
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start === -1 || end <= start) {
    throw new Error("The model did not return JSON.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    throw new Error("The model did not return JSON.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model did not return JSON.")
  }
  return parsed as Record<string, unknown>
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text
        return typeof text === "string" ? text : ""
      }
      return ""
    })
    .join("")
}

async function providerError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      const error = record.error
      if (typeof error === "string" && error.trim()) return error
      if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message.trim()) return message
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message
      }
    }
  } catch {
    // The body was not JSON.
  }
  const compact = text.replace(/\s+/g, " ").trim()
  return compact.slice(0, 280) || `The model request failed (${response.status}).`
}

async function callOpenAICompatible(
  provider: ActiveProvider,
  system: string,
  userText: string,
  mimeType: string,
  base64: string,
): Promise<string> {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  })

  if (!response.ok) {
    throw new Error(await providerError(response))
  }

  const payload: unknown = await response.json()
  const content =
    payload &&
    typeof payload === "object" &&
    "choices" in payload &&
    Array.isArray((payload as { choices?: unknown }).choices)
      ? (payload as { choices: Array<{ message?: { content?: unknown } }> })
          .choices[0]?.message?.content
      : undefined
  const text = messageText(content)
  if (!text.trim()) {
    throw new Error("The model returned an empty answer.")
  }
  return text
}

async function callAnthropic(
  provider: ActiveProvider,
  system: string,
  userText: string,
  mimeType: string,
  base64: string,
): Promise<string> {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "x-api-key": provider.key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 3000,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  })

  if (!response.ok) {
    throw new Error(await providerError(response))
  }

  const payload: unknown = await response.json()
  const blocks =
    payload && typeof payload === "object" && "content" in payload
      ? (payload as { content?: unknown }).content
      : undefined
  const text = messageText(blocks)
  if (!text.trim()) {
    throw new Error("The model returned an empty answer.")
  }
  return text
}

async function askVision(
  provider: ActiveProvider,
  system: string,
  userText: string,
  mimeType: string,
  bytes: Buffer,
): Promise<string> {
  const base64 = bytes.toString("base64")
  return provider.id === "anthropic"
    ? callAnthropic(provider, system, userText, mimeType, base64)
    : callOpenAICompatible(provider, system, userText, mimeType, base64)
}

function requestText(system: string, userText: string): string {
  return `System:\n${system}\n\nUser:\n${userText}`
}

async function loggedVision(input: {
  kind: CallKind
  course: CourseId
  mode: HelpMode | null
  system: string
  userText: string
  mimeType: string
  bytes: Buffer
}): Promise<{ text: string; call: ModelCallLog }> {
  const provider = activeProvider()
  if (!provider) throw new Error(MISSING_KEY_MESSAGE)
  const startedAt = Date.now()
  const text = await askVision(
    provider,
    input.system,
    input.userText,
    input.mimeType,
    input.bytes,
  )
  return {
    text,
    call: {
      kind: input.kind,
      course: input.course,
      mode: input.mode,
      startedAt,
      finishedAt: Date.now(),
      provider: provider.label,
      model: provider.model,
      request: requestText(input.system, input.userText),
      reply: text,
    },
  }
}

function rethrowWithCall(error: unknown, call: ModelCallLog, fallback: string): never {
  const message = error instanceof Error && error.message ? error.message : fallback
  throw new ModelReplyError(message, call)
}

export async function readQuestionsFromImage(input: {
  course: CourseId
  mode: HelpMode | null
  mimeType: string
  bytes: Buffer
}): Promise<{ questions: string[]; call: ModelCallLog }> {
  const { text, call } = await loggedVision({
    kind: "questions",
    course: input.course,
    mode: input.mode,
    system: questionSystem(input.course),
    userText: QUESTION_USER,
    mimeType: input.mimeType,
    bytes: input.bytes,
  })
  try {
    return { questions: parseQuestions(text), call }
  } catch (error) {
    rethrowWithCall(error, call, "The model did not list the questions.")
  }
}

export async function solveFromImage(input: {
  course: CourseId
  helpMode: HelpMode
  selection: SolveSelection
  mimeType: string
  bytes: Buffer
}): Promise<SolveSuccess> {
  const provider = activeProvider()
  if (!provider) throw new Error(MISSING_KEY_MESSAGE)
  const hint = input.helpMode === "hint"
  const { text, call } = await loggedVision({
    kind: input.helpMode,
    course: input.course,
    mode: input.helpMode,
    system: hint ? tutorSystemPrompt(input.course) : courseSystem(input.course),
    userText: hint
      ? hintRequest(input.course, input.selection)
      : solveRequest(input.course, input.selection),
    mimeType: input.mimeType,
    bytes: input.bytes,
  })
  try {
    return {
      course: input.course,
      helpMode: input.helpMode,
      solutions: parseSolutions(text, input.helpMode),
      provider: provider.label,
      model: provider.model,
      call,
    }
  } catch (error) {
    rethrowWithCall(
      error,
      call,
      hint ? "The model did not return a hint." : "The model did not return the solutions.",
    )
  }
}

function hintFollowUpPrompt(
  course: CourseId,
  solved: SolvedQuestion[],
  previousReplies: string[],
  followUp: string,
): string {
  const label = courseLabel(course)
  const given = solved
    .map((solution, index) =>
      [
        `Question ${index + 1}: ${solution.question || "The question in the picture"}`,
        `Hint already given: ${solution.hint}`,
      ].join("\n"),
    )
    .join("\n\n")
  const earlier = previousReplies
    .map((reply, index) => `Earlier hint ${index + 1}: ${reply}`)
    .join("\n")
  return [
    "The picture and the hints already given are the context.",
    "The student asked a follow-up.",
    "Reply with one short hint or one guiding question.",
    "Do not give the final answer.",
    "Do not give the complete step-by-step solution.",
    `Stay inside ${label}. Do not use a technique from a later course.`,
    "If the follow-up needs later mathematics, say so, name that later course, and hint only as far as this course allows.",
    given,
    earlier,
    `Follow-up: ${followUp}`,
    "Return only a JSON object with this shape and no markdown fence:",
    '{"reply":"one short hint or guiding question"}',
  ]
    .filter(Boolean)
    .join("\n")
}

function solveFollowUpPrompt(
  course: CourseId,
  solved: SolvedQuestion[],
  previousReplies: string[],
  followUp: string,
): string {
  const label = courseLabel(course)
  const given = solved
    .map((solution, index) =>
      [
        `Question ${index + 1}: ${solution.question || "The question in the picture"}`,
        `Answer already given: ${solution.answer}`,
        solution.steps.length
          ? `Steps already given: ${solution.steps.join(" ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n")
  const earlier = previousReplies
    .map((reply, index) => `Follow-up reply ${index + 1}: ${reply}`)
    .join("\n")
  return [
    "The picture, the questions that were solved, and the answer already given are the context.",
    "Answer the student's follow-up. Do not start a new problem unless they ask for one.",
    `Stay inside ${label}. Do not use a technique from a later course.`,
    "If the follow-up needs later mathematics, say so, name that later course, and answer only as far as this course allows.",
    given,
    earlier,
    `Follow-up: ${followUp}`,
    "Return only a JSON object with this shape and no markdown:",
    '{"reply":"the answer to the follow-up"}',
  ]
    .filter(Boolean)
    .join("\n")
}

export async function answerFollowUp(input: {
  course: CourseId
  helpMode: HelpMode
  solved: SolvedQuestion[]
  previousReplies: string[]
  followUp: string
  mimeType: string
  bytes: Buffer
}): Promise<FollowUpSuccess> {
  const hint = input.helpMode === "hint"
  const { text, call } = await loggedVision({
    kind: "follow-up",
    course: input.course,
    mode: input.helpMode,
    system: hint ? tutorSystemPrompt(input.course) : courseSystem(input.course),
    userText: hint
      ? hintFollowUpPrompt(
          input.course,
          input.solved,
          input.previousReplies,
          input.followUp,
        )
      : solveFollowUpPrompt(
          input.course,
          input.solved,
          input.previousReplies,
          input.followUp,
        ),
    mimeType: input.mimeType,
    bytes: input.bytes,
  })
  try {
    const record = parseJsonObject(text)
    if (typeof record.reply !== "string" || !record.reply.trim()) {
      throw new Error(
        hint
          ? "The model did not return a hint."
          : "The model did not answer the follow-up.",
      )
    }
    return { reply: record.reply.trim(), call }
  } catch (error) {
    rethrowWithCall(
      error,
      call,
      hint ? "The model did not return a hint." : "The model did not answer the follow-up.",
    )
  }
}
