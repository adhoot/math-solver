import { readFileSync } from "node:fs"
import { join } from "node:path"

/** Verbatim tutor template. The wording lives in the markdown file. */
export const MATH_TUTOR_SYSTEM_PROMPT = readFileSync(
  join(process.cwd(), "src/lib/prompts/math-tutor-system-prompt.md"),
  "utf8",
)
