"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { marked } from "marked"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

// Extract STAR questions from story bank markdown
function extractQuestions(markdown: string): string[] {
  const questions: string[] = []
  const lines = markdown.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("**Q:") || trimmed.startsWith("**Question:") || trimmed.match(/^\*\*.*\?\*\*/)) {
      questions.push(trimmed.replace(/\*\*/g, "").replace(/^Q:\s*/, "").replace(/^Question:\s*/, ""))
    } else if (trimmed.match(/^#+\s+.+\?$/)) {
      questions.push(trimmed.replace(/^#+\s+/, ""))
    }
  }
  return questions
}

export function PracticeMode({ storyBank }: { storyBank: string }) {
  const questions = extractQuestions(storyBank)
  const fallbackQuestions = [
    "Tell me about a time you led a team through a technical challenge.",
    "Describe a situation where you had to make a difficult decision with limited information.",
    "Give an example of when you delivered results under a tight deadline.",
    "Tell me about a time you disagreed with a stakeholder and how you handled it.",
    "What's the most complex system you've designed or contributed to?",
    "Tell me about a time your work had a measurable business impact.",
    "Describe a failure and what you learned from it.",
  ]
  const allQ = questions.length > 0 ? questions : fallbackQuestions

  const [current, setCurrent] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)

  function draw() {
    const next = allQ[Math.floor(Math.random() * allQ.length)]
    setCurrent(next)
    setShowing(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" onClick={draw} className="w-full">
        🎲 Practice random question
      </Button>
      {showing && current && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-foreground mb-1">Question:</p>
            <p className="text-sm text-muted-foreground">{current}</p>
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Use the STAR+R framework:</p>
              <p>Situation → Task → Action → Result → Reflection</p>
            </div>
            <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={draw}>
              Next question →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function CompanyFileViewer({ files }: { files: string[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadFile(name: string) {
    if (selected === name) { setSelected(null); setContent(null); return }
    setSelected(name)
    setLoading(true)
    try {
      const r = await fetch(`${BASE}/api/interview-file/${encodeURIComponent(name)}`)
      if (r.ok) {
        const d = await r.json()
        setContent(d.content)
      }
    } finally {
      setLoading(false)
    }
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2 text-center">
        <p className="text-2xl">🏢</p>
        <p className="text-sm font-medium">No company files yet</p>
        <p className="text-xs">Run a job evaluation to generate company-specific prep.</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {files.map(f => (
          <button
            key={f}
            onClick={() => loadFile(f)}
            className={`rounded-md px-3 py-2 text-sm text-left transition-colors capitalize ${selected === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {f.replace(".md", "").replace(/-/g, " ")}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 border-t pt-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : content ? (
            <div
              className="prose prose-sm max-w-none max-h-80 overflow-y-auto
                prose-headings:font-semibold prose-headings:text-foreground
                prose-h1:text-base prose-h2:text-sm prose-h3:text-xs
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-li:text-muted-foreground prose-strong:text-foreground
                prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
              dangerouslySetInnerHTML={{ __html: marked(content) as string }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Could not load file.</p>
          )}
        </div>
      )}
    </>
  )
}
