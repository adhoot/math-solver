"use client"

import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import { cn } from "@/lib/utils"

import "katex/dist/katex.min.css"

type MathNode = {
  type?: string
  value?: string
  children?: MathNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

type MathTree = {
  children: MathNode[]
}

/** One-line $$...$$ is block math in the tutor prompt. remark-math treats it as inline. */
function remarkSingleLineDisplayMath() {
  return (tree: MathTree, file: { value?: unknown }) => {
    const source = typeof file.value === "string" ? file.value : ""
    tree.children = tree.children.map((node) => {
      if (node.type !== "paragraph" || node.children?.length !== 1) return node
      const child = node.children[0]
      if (child?.type !== "inlineMath") return node
      const start = child.position?.start?.offset
      const end = child.position?.end?.offset
      if (start == null || end == null) return node
      const raw = source.slice(start, end)
      if (!raw.startsWith("$$") || !raw.endsWith("$$")) return node
      return {
        type: "math",
        value: child.value,
        data: {
          hName: "pre",
          hChildren: [
            {
              type: "element",
              tagName: "code",
              properties: { className: ["language-math", "math-display"] },
              children: [{ type: "text", value: child.value ?? "" }],
            },
          ],
        },
      }
    })
  }
}

type MathCopyProps = {
  text: string
  className?: string
  paragraphClassName?: string
}

export function MathCopy({ text, className, paragraphClassName }: MathCopyProps) {
  return (
    <div className={cn("math-copy min-w-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkSingleLineDisplayMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: "ignore" }],
        ]}
        components={{
          p: ({ children }) => (
            <p className={cn("leading-relaxed", paragraphClassName)}>{children}</p>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
