import { parseCourse, type CourseId } from "@/lib/course"
import type { SolvedQuestion } from "@/lib/vision"

const DB_NAME = "math-buddy"
const STORE = "solves"
const VERSION = 1

export type SolveMode = "all" | "one"

export type SavedSolve = {
  id: string
  createdAt: number
  updatedAt: number
  course: CourseId
  image: Blob
  questions: string[]
  solveMode: SolveMode
  chosenIndex: number
  solvedQuestions: string[]
  solutions: SolvedQuestion[]
  replies: string[]
  provider: string
  model: string
}

export type NewSolve = Omit<SavedSolve, "id" | "createdAt" | "updatedAt">

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser has no on-device storage."))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function readSaved(value: unknown): SavedSolve | null {
  if (!isRecord(value)) return null
  const course = parseCourse(value.course)
  if (!course || !(value.image instanceof Blob)) return null
  if (typeof value.id !== "string") return null
  if (!Array.isArray(value.questions) || !Array.isArray(value.solutions)) return null
  const questions = value.questions.filter(
    (question): question is string => typeof question === "string",
  )
  const solutions = value.solutions.filter(isRecord).map((solution) => ({
    question: typeof solution.question === "string" ? solution.question : "",
    answer: typeof solution.answer === "string" ? solution.answer : "",
    steps: Array.isArray(solution.steps)
      ? solution.steps.filter((step): step is string => typeof step === "string")
      : [],
  }))
  if (solutions.length === 0 || solutions.some((solution) => !solution.answer)) {
    return null
  }
  const solveMode: SolveMode = value.solveMode === "one" ? "one" : "all"
  const chosenIndex =
    typeof value.chosenIndex === "number" && value.chosenIndex >= 0
      ? value.chosenIndex
      : 0
  const solvedQuestions = Array.isArray(value.solvedQuestions)
    ? value.solvedQuestions.filter((question): question is string => typeof question === "string")
    : solveMode === "one"
      ? [questions[chosenIndex] ?? solutions[0]?.question ?? ""].filter(Boolean)
      : questions
  return {
    id: value.id,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    course,
    image: value.image,
    questions,
    solveMode,
    chosenIndex,
    solvedQuestions,
    solutions,
    replies: Array.isArray(value.replies)
      ? value.replies.filter((reply): reply is string => typeof reply === "string")
      : [],
    provider: typeof value.provider === "string" ? value.provider : "",
    model: typeof value.model === "string" ? value.model : "",
  }
}

export async function listSolves(): Promise<SavedSolve[]> {
  try {
    const db = await openDb()
    const records = await requestToPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).getAll(),
    )
    db.close()
    return records
      .map(readSaved)
      .filter((entry): entry is SavedSolve => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function saveSolve(input: NewSolve): Promise<SavedSolve> {
  const now = Date.now()
  const saved: SavedSolve = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  const db = await openDb()
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(saved))
  db.close()
  return saved
}

export async function saveFollowUps(id: string, replies: string[]): Promise<void> {
  const db = await openDb()
  const store = db.transaction(STORE, "readwrite").objectStore(STORE)
  const existing = readSaved(await requestToPromise(store.get(id)))
  if (!existing) {
    db.close()
    throw new Error("That saved solve is no longer on this device.")
  }
  existing.replies = replies
  existing.updatedAt = Date.now()
  await requestToPromise(store.put(existing))
  db.close()
}
