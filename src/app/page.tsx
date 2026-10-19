import { MathBuddy } from "@/components/math-buddy"
import { visionStatus } from "@/lib/vision"

export const dynamic = "force-dynamic"

export default function Home() {
  return <MathBuddy initialStatus={visionStatus()} />
}
