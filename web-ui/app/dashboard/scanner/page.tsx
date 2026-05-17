"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

type State = "idle" | "running" | "done" | "error"

const STAGE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Connecting to portals", pattern: /fetch|connect|request|greenhouse|ashby|lever/i },
  { label: "Searching jobs",        pattern: /search|query|scan|found|job/i },
  { label: "Filtering results",     pattern: /filter|dedup|skip|seen|new/i },
  { label: "Saving to pipeline",    pattern: /writ|sav|pipeline|append/i },
  { label: "Done",                  pattern: /complete|finish|total|result/i },
]

function detectStage(line: string): string | null {
  for (const { label, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return label
  }
  return null
}

function extractNewCount(lines: string[]): number | null {
  for (const line of lines) {
    const m = line.match(/(\d+)\s+new/i)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

export default function ScannerPage() {
  const [company, setCompany] = useState("")
  const [state, setState] = useState<State>("idle")
  const [lines, setLines] = useState<string[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [completedStages, setCompletedStages] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const seenStages = useRef<Set<string>>(new Set())
  const currentStageRef = useRef<string | null>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  useEffect(() => () => { esRef.current?.close() }, [])

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    setState("running")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    seenStages.current = new Set()
    currentStageRef.current = null

    let jobId: string
    try {
      const r = await fetch(`${BASE}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: company.trim() || undefined }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `Server error ${r.status}`)
      }
      const data = await r.json()
      jobId = data.jobId
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState("error")
      return
    }

    const es = new EventSource(`${BASE}/api/scan/${jobId}/stream`)
    esRef.current = es

    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.line !== undefined) {
        setLines(prev => [...prev, msg.line])
        const stage = detectStage(msg.line)
        if (stage && !seenStages.current.has(stage)) {
          seenStages.current.add(stage)
          const prev = currentStageRef.current
          if (prev && prev !== stage) {
            setCompletedStages(cs => cs.includes(prev) ? cs : [...cs, prev])
          }
          currentStageRef.current = stage
          setCurrentStage(stage)
        }
      }
      if (msg.done) {
        es.close()
        if (msg.error) {
          setErrorMsg(msg.error)
          setState("error")
        } else {
          if (currentStageRef.current) {
            setCompletedStages(cs => cs.includes(currentStageRef.current!) ? cs : [...cs, currentStageRef.current!])
          }
          setCurrentStage(null)
          setState("done")
        }
      }
    }

    es.onerror = () => {
      es.close()
      setErrorMsg("Connection to server lost.")
      setState("error")
    }
  }

  function handleReset() {
    esRef.current?.close()
    setCompany("")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    seenStages.current = new Set()
    setState("idle")
  }

  const allStages = STAGE_PATTERNS.map(s => s.label)
  const newCount = state === "done" ? extractNewCount(lines) : null

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan for Jobs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Zero-token scan of Greenhouse, Ashby, and Lever portals. Results go directly to your Pipeline Inbox.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Scan Options</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScan} className="flex gap-2">
            <Input
              placeholder="Company name (leave blank to scan all)"
              value={company}
              onChange={e => setCompany(e.target.value)}
              disabled={state === "running"}
              className="flex-1"
            />
            {state === "idle" || state === "error" ? (
              <Button type="submit">
                {company.trim() ? "Scan Company" : "Scan All"}
              </Button>
            ) : state === "running" ? (
              <Button type="button" variant="outline" disabled>Running…</Button>
            ) : (
              <Button type="button" variant="outline" onClick={handleReset}>Scan Again</Button>
            )}
          </form>
        </CardContent>
      </Card>

      {state === "done" && (
        <Card className="max-w-2xl border-green-200 bg-green-50/30">
          <CardContent className="pt-5">
            <div className="flex items-start gap-4">
              <div className="text-3xl">✅</div>
              <div className="flex-1">
                <p className="font-semibold text-base">Scan complete</p>
                {newCount !== null ? (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {newCount} new job{newCount !== 1 ? "s" : ""} added to your pipeline
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">Check pipeline for new URLs</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild>
                <a href="/dashboard/pipeline">View Pipeline</a>
              </Button>
              <Button variant="outline" onClick={handleReset}>Scan Again</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {state !== "idle" && (
        <Card className="max-w-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {state === "running" && "Scanning portals…"}
                {state === "done" && "Full log"}
                {state === "error" && "Scan failed"}
              </CardTitle>
              {state === "running" && (
                <div className="flex items-center gap-2">
                  {currentStage && (
                    <span className="text-xs text-muted-foreground italic">{currentStage}…</span>
                  )}
                  <span className="inline-flex size-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              )}
            </div>
            {state === "running" && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
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
          </CardHeader>
          <CardContent>
            <div
              ref={logRef}
              className="bg-muted rounded-md p-3 h-64 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {lines.length === 0 && state === "running" && (
                <span className="text-muted-foreground">Starting scan…</span>
              )}
              {lines.map((l, i) => (
                <div key={i} className={l.startsWith("⚠") ? "text-yellow-600" : ""}>{l}</div>
              ))}
              {state === "error" && errorMsg && (
                <div className="text-red-500 mt-2 font-semibold">{errorMsg}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
