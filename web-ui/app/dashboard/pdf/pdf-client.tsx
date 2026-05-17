"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { scoreVariant, STATUS_LABELS, STATUS_COLORS, type Application } from "@/lib/api"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

type GenState = "idle" | "running" | "done" | "error"

const STAGE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Reading CV",       pattern: /read|load|cv|resume/i },
  { label: "Customizing",      pattern: /custom|tailor|adapt|match/i },
  { label: "Rendering",        pattern: /render|html|template|generat/i },
  { label: "Saving PDF",       pattern: /pdf|save|output|write|file/i },
]

function detectStage(line: string): string | null {
  for (const { label, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return label
  }
  return null
}

function AppRow({
  app,
  onGenerate,
  genState,
  lines,
  currentStage,
  completedStages,
  error,
}: {
  app: Application
  onGenerate: () => void
  genState: GenState
  lines: string[]
  currentStage: string | null
  completedStages: string[]
  error: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const allStages = STAGE_PATTERNS.map(s => s.label)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  useEffect(() => {
    if (genState === "running") setExpanded(true)
  }, [genState])

  return (
    <div className={`rounded-xl border transition-colors ${genState === "done" ? "border-green-300 bg-green-50/20" : ""}`}>
      <div className="p-4 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold uppercase">
          {app.company.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{app.company}</span>
            <span className="text-sm text-muted-foreground truncate">{app.role}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${scoreVariant(app.score)}`}>
              {app.score.toFixed(1)}/5
            </span>
            <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
            {app.reportNumber && (
              <span className="text-xs text-muted-foreground font-mono">Report #{app.reportNumber}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {genState === "done" && <span className="text-green-700 text-sm">✅ PDF ready</span>}
          {genState === "error" && <span className="text-red-500 text-xs">Failed</span>}
          {genState === "idle" || genState === "error" ? (
            <Button size="sm" onClick={onGenerate}>
              Generate PDF
            </Button>
          ) : genState === "running" ? (
            <Button size="sm" variant="outline" disabled>
              <span className="inline-flex size-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5" />
              Generating…
            </Button>
          ) : null}
          {lines.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {expanded && (genState === "running" || genState === "done" || genState === "error") && (
        <div className="px-4 pb-4">
          {genState === "running" && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {allStages.map(stage => {
                const isDone = completedStages.includes(stage)
                const isActive = stage === currentStage
                return (
                  <span
                    key={stage}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                      isDone ? "bg-green-100 text-green-700" :
                      isActive ? "bg-blue-100 text-blue-700 animate-pulse" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? "✓ " : isActive ? "⟳ " : ""}{stage}
                  </span>
                )
              })}
            </div>
          )}
          <div
            ref={logRef}
            className="bg-muted rounded-md p-2 max-h-40 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap"
          >
            {lines.map((l, i) => (
              <div key={i} className={l.startsWith("⚠") ? "text-yellow-600" : ""}>{l}</div>
            ))}
            {error && <div className="text-red-500 font-semibold mt-1">{error}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export function PdfClient({ apps }: { apps: Application[] }) {
  const router = useRouter()
  const [genStates, setGenStates] = useState<Record<number, GenState>>({})
  const [lines, setLines] = useState<Record<number, string[]>>({})
  const [currentStages, setCurrentStages] = useState<Record<number, string | null>>({})
  const [completedStages, setCompletedStages] = useState<Record<number, string[]>>({})
  const [errors, setErrors] = useState<Record<number, string | null>>({})
  const esRefs = useRef<Map<number, EventSource>>(new Map())

  useEffect(() => () => {
    esRefs.current.forEach(es => es.close())
  }, [])

  function appendLine(num: number, line: string) {
    setLines(prev => ({ ...prev, [num]: [...(prev[num] ?? []), line] }))
  }

  async function handleGenerate(app: Application) {
    const num = app.number
    setGenStates(prev => ({ ...prev, [num]: "running" }))
    setLines(prev => ({ ...prev, [num]: [] }))
    setErrors(prev => ({ ...prev, [num]: null }))
    setCurrentStages(prev => ({ ...prev, [num]: null }))
    setCompletedStages(prev => ({ ...prev, [num]: [] }))

    let jobId: string
    try {
      const r = await fetch(`${BASE}/api/pdf/${app.reportNumber}`, { method: "POST" })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `Server error ${r.status}`)
      }
      const data = await r.json()
      jobId = data.jobId
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setGenStates(prev => ({ ...prev, [num]: "error" }))
      setErrors(prev => ({ ...prev, [num]: msg }))
      return
    }

    const es = new EventSource(`${BASE}/api/pdf/${jobId}/stream`)
    esRefs.current.set(num, es)

    const seenStages = new Set<string>()
    let currentStage: string | null = null

    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.line !== undefined) {
        appendLine(num, msg.line)
        const stage = detectStage(msg.line)
        if (stage && !seenStages.has(stage)) {
          seenStages.add(stage)
          if (currentStage && currentStage !== stage) {
            setCompletedStages(prev => ({
              ...prev,
              [num]: prev[num]?.includes(currentStage!) ? prev[num] : [...(prev[num] ?? []), currentStage!],
            }))
          }
          currentStage = stage
          setCurrentStages(prev => ({ ...prev, [num]: stage }))
        }
      }
      if (msg.done) {
        es.close()
        esRefs.current.delete(num)
        if (msg.error) {
          setGenStates(prev => ({ ...prev, [num]: "error" }))
          setErrors(prev => ({ ...prev, [num]: msg.error }))
          setCurrentStages(prev => ({ ...prev, [num]: null }))
        } else {
          setGenStates(prev => ({ ...prev, [num]: "done" }))
          setCurrentStages(prev => ({ ...prev, [num]: null }))
          router.refresh()
        }
      }
    }

    es.onerror = () => {
      es.close()
      esRefs.current.delete(num)
      setGenStates(prev => ({ ...prev, [num]: "error" }))
      setErrors(prev => ({ ...prev, [num]: "Connection lost." }))
      setCurrentStages(prev => ({ ...prev, [num]: null }))
    }
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p className="text-3xl">✅</p>
        <p className="font-medium">All evaluated applications have PDFs</p>
        <p className="text-sm">Evaluate more jobs to generate additional PDFs</p>
        <Button asChild variant="outline" className="mt-2">
          <a href="/dashboard/evaluate">Evaluate a Job</a>
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{apps.length} application{apps.length !== 1 ? "s" : ""} without PDF</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {apps.map(app => (
          <AppRow
            key={app.number}
            app={app}
            onGenerate={() => handleGenerate(app)}
            genState={genStates[app.number] ?? "idle"}
            lines={lines[app.number] ?? []}
            currentStage={currentStages[app.number] ?? null}
            completedStages={completedStages[app.number] ?? []}
            error={errors[app.number] ?? null}
          />
        ))}
      </CardContent>
    </Card>
  )
}
