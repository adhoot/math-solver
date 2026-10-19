import { classGuidance, type ClassLevel } from "./class-level";

export const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4.1-mini",
    url: "https://api.openai.com/v1/chat/completions",
  },
  {
    id: "xai",
    label: "xAI",
    model: "grok-4.6",
    url: "https://api.x.ai/v1/chat/completions",
  },
  {
    id: "groq",
    label: "Groq",
    model: "qwen/qwen3.8-27b",
    url: "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    model: "claude-sonnet-5",
    url: "https://api.anthropic.com/v1/messages",
  },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
export type Provider = (typeof PROVIDERS)[number];

export type SolveSuccess = {
  question: string;
  answer: string;
  steps: string[];
  classLevel: ClassLevel;
  provider: Provider["label"];
  model: string;
};

export type SolveErrorCode = "missing_key" | "rejected_key" | "model_error";

export class SolveError extends Error {
  readonly code: SolveErrorCode;

  constructor(code: SolveErrorCode, message: string) {
    super(message);
    this.name = "SolveError";
    this.code = code;
  }
}

const EMPTY_KEYS: Record<ProviderId, string> = {
  openai: "",
  xai: "",
  groq: "",
  anthropic: "",
};

export function emptyKeys(): Record<ProviderId, string> {
  return { ...EMPTY_KEYS };
}

export function isProviderId(value: string | null | undefined): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

export function getProvider(id: ProviderId): Provider {
  const provider = PROVIDERS.find((item) => item.id === id);
  if (!provider) {
    throw new SolveError("model_error", "That provider is not available.");
  }
  return provider;
}

export function tutorPrompt(level: ClassLevel): string {
  return [
    "You are Math Buddy, a patient maths tutor.",
    `The student is in Class ${level} of a Class 1 to Class 12 school.`,
    classGuidance(level),
    "Read the maths question in the image. Solve it correctly.",
    `Every word of the explanation must fit Class ${level}.`,
    "If a diagram matters, describe the facts you used from it.",
    "If the image is not a maths question, say so in the answer and explain what you saw in the steps.",
    "Return only a JSON object with this shape and no markdown:",
    '{"question":"the question in plain text","answer":"the final answer only","steps":["step 1","step 2"]}',
  ].join("\n");
}

export function parseTutorJson(text: string): {
  question: string;
  answer: string;
  steps: string[];
} {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new SolveError("model_error", "The model did not return the answer as JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new SolveError("model_error", "The model did not return the answer as JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new SolveError("model_error", "The model did not return the answer as JSON.");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.answer !== "string" || !record.answer.trim()) {
    throw new SolveError("model_error", "The model left out the final answer.");
  }
  if (!Array.isArray(record.steps)) {
    throw new SolveError("model_error", "The model left out the steps.");
  }
  const steps = record.steps
    .map((step) => (typeof step === "string" ? step.trim() : ""))
    .filter(Boolean);
  return {
    question: typeof record.question === "string" ? record.question.trim() : "",
    answer: record.answer.trim(),
    steps,
  };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

function redact(message: string, secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return message;
  return message.split(trimmed).join("••••");
}

function clip(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact || compact.startsWith("<")) return "";
  return compact.slice(0, 280);
}

async function readProviderError(response: Response, secret: string): Promise<string> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const error = record.error;
      if (typeof error === "string" && error.trim()) {
        return redact(clip(error), secret);
      }
      if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
          return redact(clip(message), secret);
        }
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return redact(clip(record.message), secret);
      }
    }
  } catch {
    // The body was not JSON.
  }
  return redact(clip(text), secret);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SolveError(
        "model_error",
        "The request stopped before an answer came back. Try again.",
      );
    }
    throw new SolveError(
      "model_error",
      "The request stopped before an answer came back. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function throwIfUnsuccessful(
  response: Response,
  provider: Provider,
  secret: string,
): Promise<void> {
  if (response.ok) return;
  const detail = await readProviderError(response, secret);
  if (response.status === 401 || response.status === 403) {
    throw new SolveError(
      "rejected_key",
      detail ||
        `${provider.label} rejected that key. Check the provider and paste the key again.`,
    );
  }
  throw new SolveError(
    "model_error",
    detail || `The model request failed (${response.status}).`,
  );
}

async function callOpenAICompatible(
  provider: Provider,
  key: string,
  level: ClassLevel,
  mimeType: string,
  base64: string,
): Promise<string> {
  const response = await fetchWithTimeout(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: tutorPrompt(level) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Solve this for Class ${level}. Reply with the JSON object only.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  await throwIfUnsuccessful(response, provider, key);

  const payload: unknown = await response.json();
  const content =
    payload &&
    typeof payload === "object" &&
    "choices" in payload &&
    Array.isArray((payload as { choices?: unknown }).choices)
      ? (payload as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]
          ?.message?.content
      : undefined;
  const text = messageText(content);
  if (!text.trim()) {
    throw new SolveError("model_error", "The model returned an empty answer.");
  }
  return text;
}

async function callAnthropic(
  provider: Provider,
  key: string,
  level: ClassLevel,
  mimeType: string,
  base64: string,
): Promise<string> {
  const response = await fetchWithTimeout(provider.url, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1800,
      system: tutorPrompt(level),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            {
              type: "text",
              text: `Solve this for Class ${level}. Reply with the JSON object only.`,
            },
          ],
        },
      ],
    }),
  });

  await throwIfUnsuccessful(response, provider, key);

  const payload: unknown = await response.json();
  const blocks =
    payload && typeof payload === "object" && "content" in payload
      ? (payload as { content?: unknown }).content
      : undefined;
  const text = messageText(blocks);
  if (!text.trim()) {
    throw new SolveError("model_error", "The model returned an empty answer.");
  }
  return text;
}

export async function solveFromImage(input: {
  classLevel: ClassLevel;
  providerId: ProviderId;
  apiKey: string;
  mimeType: string;
  base64: string;
}): Promise<SolveSuccess> {
  const provider = getProvider(input.providerId);
  const apiKey = input.apiKey.replace(/\s+/g, "");
  if (!apiKey) {
    throw new SolveError(
      "missing_key",
      `Paste an API key for ${provider.label} (${provider.model}). It stays on this iPhone.`,
    );
  }
  if (!input.base64) {
    throw new SolveError("model_error", "Add a photo of the question, then solve it.");
  }

  const raw =
    provider.id === "anthropic"
      ? await callAnthropic(provider, apiKey, input.classLevel, input.mimeType, input.base64)
      : await callOpenAICompatible(
          provider,
          apiKey,
          input.classLevel,
          input.mimeType,
          input.base64,
        );
  const parsed = parseTutorJson(raw);
  return {
    ...parsed,
    classLevel: input.classLevel,
    provider: provider.label,
    model: provider.model,
  };
}
