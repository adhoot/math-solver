export const CLASS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type ClassLevel = (typeof CLASS_LEVELS)[number];

export function parseClassLevel(value: unknown): ClassLevel | null {
  const level = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 12) return null;
  return level as ClassLevel;
}

export function classGuidance(level: ClassLevel): string {
  if (level <= 2) {
    return [
      "The student is about 6 or 7.",
      "Use very simple words. One short sentence per step.",
      "No algebra words. Talk about counting, groups, and everyday objects.",
      "Use at most 4 steps.",
    ].join(" ");
  }
  if (level <= 5) {
    return [
      "The student is in primary school.",
      "Use short sentences and name the operation: add, subtract, multiply, divide, or fraction.",
      "One idea per step. Write the numbers out.",
      "Use at most 6 steps.",
    ].join(" ");
  }
  if (level <= 8) {
    return [
      "The student is in middle school.",
      "Show each line of working. The first time you use a new term, say what it means in plain words.",
      "Finish with a quick check of the answer.",
      "Use about 4 to 8 steps.",
    ].join(" ");
  }
  if (level <= 10) {
    return [
      "The student is in secondary school.",
      "Name formulas when you use them and show the algebra or geometry properly.",
      "Explain why each move is valid, then check the answer.",
      "Fuller reasoning is welcome.",
    ].join(" ");
  }
  return [
    "The student is in senior secondary school.",
    "Give complete reasoning, state assumptions, and show the full working with precise notation.",
    "Mention a second method only when it genuinely helps.",
  ].join(" ");
}
