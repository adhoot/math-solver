import { courseGuidance, courseLabel, type CourseId } from "@/lib/course"

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
}

export type SolveSelection =
  | { mode: "all"; questions: string[] }
  | { mode: "one"; question: string }

export type SolveSuccess = {
  course: CourseId
  solutions: SolvedQuestion[]
  provider: Provider["label"]
  model: string
}

type ActiveProvider = Provider & { key: string }

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

function selectionRules(course: CourseId, selection: SolveSelection): string {
  const label = courseLabel(course)
  if (selection.mode === "one") {
    return [
      "Solve only this question. Ignore every other question in the picture:",
      selection.question,
      `Stay inside ${label}.`,
    ].join("\n")
  }
  const lines = selection.questions.map(
    (question, index) => `${index + 1}. ${question}`,
  )
  return [
    "Solve every question listed here, and no others. Give each question its own solution.",
    ...lines,
    `Stay inside ${label}.`,
  ].join("\n")
}

function tutorPrompt(course: CourseId, selection: SolveSelection): string {
  const label = courseLabel(course)
  return [
    "You are Math Buddy, a patient maths tutor.",
    `The student is taking ${label}.`,
    courseGuidance(course),
    selectionRules(course, selection),
    "Solve the chosen question or questions correctly.",
    `Every word of the explanation must stay inside ${label}.`,
    "If a diagram matters, describe the facts you used from it.",
    "If the image is not a maths question, say so in the answer and explain what you saw in the steps.",
    "Return only a JSON object with this shape and no markdown:",
    '{"solutions":[{"question":"the question in plain text","answer":"the final answer only","steps":["step 1","step 2"]}]}',
  ].join("\n")
}

const QUESTION_PROMPT = [
  "You are Math Buddy.",
  "Read every distinct maths question visible in the image, from top to bottom.",
  "Do not solve anything. Do not give answers, hints, or steps.",
  "Skip page numbers, names, scores, and instructions that are not themselves questions.",
  "Copy each question as its own plain-text item.",
  "Return only a JSON object with this shape and no markdown:",
  '{"questions":["question 1","question 2"]}',
  "If the image has no maths question, return {\"questions\":[]}.",
].join("\n")

function parseQuestions(text: string): string[] {
  const record = parseJsonObject(text)
  if (!Array.isArray(record.questions)) {
    throw new Error("The model did not list the questions.")
  }
  return record.questions
    .map((question) => (typeof question === "string" ? question.trim() : ""))
    .filter(Boolean)
}

function parseSolutions(text: string): SolvedQuestion[] {
  const record = parseJsonObject(text)
  const rawList = Array.isArray(record.solutions)
    ? record.solutions
    : record.answer
      ? [record]
      : null
  if (!rawList) throw new Error("The model did not return the solutions.")
  const solutions = rawList.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("The model did not return the solutions.")
    }
    const solution = item as Record<string, unknown>
    if (typeof solution.answer !== "string" || !solution.answer.trim()) {
      throw new Error("The model left out the final answer.")
    }
    if (!Array.isArray(solution.steps)) {
      throw new Error("The model left out the steps.")
    }
    const steps = solution.steps
      .map((step) => (typeof step === "string" ? step.trim() : ""))
      .filter(Boolean)
    return {
      question:
        typeof solution.question === "string" ? solution.question.trim() : "",
      answer: solution.answer.trim(),
      steps,
    }
  })
  if (solutions.length === 0) {
    throw new Error("The model did not return the solutions.")
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
  const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1))
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

export async function readQuestionsFromImage(input: {
  mimeType: string
  bytes: Buffer
}): Promise<string[]> {
  const provider = activeProvider()
  if (!provider) throw new Error(MISSING_KEY_MESSAGE)
  const raw = await askVision(
    provider,
    QUESTION_PROMPT,
    "List every maths question in this picture. Do not solve them. Reply with the JSON object only.",
    input.mimeType,
    input.bytes,
  )
  return parseQuestions(raw)
}

export async function solveFromImage(input: {
  course: CourseId
  selection: SolveSelection
  mimeType: string
  bytes: Buffer
}): Promise<SolveSuccess> {
  const provider = activeProvider()
  if (!provider) throw new Error(MISSING_KEY_MESSAGE)
  const label = courseLabel(input.course)
  const raw = await askVision(
    provider,
    tutorPrompt(input.course, input.selection),
    `Solve this for ${label}. Use only ideas taught up through ${label}. Reply with the JSON object only.`,
    input.mimeType,
    input.bytes,
  )
  return {
    course: input.course,
    solutions: parseSolutions(raw),
    provider: provider.label,
    model: provider.model,
  }
}
