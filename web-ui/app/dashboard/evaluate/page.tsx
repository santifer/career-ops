"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

type State = "idle" | "running" | "done" | "error"

// Detect named stages from log output
const STAGE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Fetching job posting", pattern: /fetch|scraping|getting|retrieving|navigat/i },
  { label: "Analyzing fit", pattern: /analyz|evaluat|assess|review/i },
  { label: "Scoring", pattern: /scor|block [A-F]|A\.|B\.|C\.|D\.|E\.|F\./i },
  { label: "Writing report", pattern: /report|writing|generat/i },
  { label: "Updating tracker", pattern: /tracker|application|tsv|merge/i },
]

function detectStage(line: string): string | null {
  for (const { label, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return label
  }
  return null
}

// Extract score and company from log output
function extractSummary(lines: string[]): { score: string | null; company: string | null } {
  let score: string | null = null
  let company: string | null = null
  for (const line of lines) {
    const scoreMatch = line.match(/(\d+\.?\d*)\/5/)
    if (scoreMatch && !score) score = scoreMatch[1]
    const companyMatch = line.match(/(?:company|empresa|firma)[:\s]+([A-Z][a-zA-Z\s]+?)(?:\s*[-|,]|$)/i)
    if (companyMatch && !company) company = companyMatch[1].trim()
  }
  return { score, company }
}

export default function EvaluatePage() {
  const searchParams = useSearchParams()
  const [url, setUrl] = useState("")

  useEffect(() => {
    const prefill = searchParams?.get("url")
    if (prefill) setUrl(prefill)
  }, [searchParams])
  const [state, setState] = useState<State>("idle")
  const [lines, setLines] = useState<string[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [completedStages, setCompletedStages] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const seenStages = useRef<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  useEffect(() => () => { esRef.current?.close() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return

    setState("running")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    seenStages.current = new Set()

    let jobId: string
    try {
      const r = await fetch(`${BASE}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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

    const es = new EventSource(`${BASE}/api/evaluate/${jobId}/stream`)
    esRef.current = es

    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.line !== undefined) {
        setLines(prev => [...prev, msg.line])
        const stage = detectStage(msg.line)
        if (stage && !seenStages.current.has(stage)) {
          seenStages.current.add(stage)
          setCurrentStage(stage)
          setCompletedStages(prev => {
            // Mark previous stage as completed when new one detected
            return prev
          })
        }
        // Move current to completed on next stage change
        setCompletedStages(prev => {
          if (stage && stage !== currentStage && currentStage && !prev.includes(currentStage)) {
            return [...prev, currentStage]
          }
          return prev
        })
      }
      if (msg.done) {
        es.close()
        if (msg.error) {
          setErrorMsg(msg.error)
          setState("error")
        } else {
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
    setUrl("")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    seenStages.current = new Set()
    setState("idle")
  }

  const summary = state === "done" ? extractSummary(lines) : { score: null, company: null }
  const allStages = STAGE_PATTERNS.map(s => s.label)

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Evaluate a Job</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste a job posting URL — career-ops will evaluate it, generate a report, and update the tracker.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Job URL</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              type="url"
              placeholder="https://jobs.lever.co/company/job-id"
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={state === "running"}
              className="flex-1"
            />
            {state === "idle" || state === "error" ? (
              <Button type="submit" disabled={!url.trim()}>
                Evaluate
              </Button>
            ) : state === "running" ? (
              <Button type="button" variant="outline" disabled>
                Running…
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={handleReset}>
                Evaluate another
              </Button>
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
                <p className="font-semibold text-base">Evaluation complete</p>
                {summary.company && <p className="text-sm text-muted-foreground mt-0.5">{summary.company}</p>}
                {summary.score && (
                  <p className="text-sm mt-1">
                    Score: <span className="font-bold text-foreground">{summary.score}/5</span>
                    <span className="text-muted-foreground ml-2">
                      {parseFloat(summary.score) >= 4.0 ? "— Strong fit, consider applying" :
                       parseFloat(summary.score) >= 3.5 ? "— Decent fit" : "— Weak fit"}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Report saved · Tracker updated</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => router.push("/dashboard/tracker")}>
                View in Tracker
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Evaluate another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {state !== "idle" && (
        <Card className="max-w-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {state === "running" && "Running evaluation…"}
                {state === "done" && "Full log"}
                {state === "error" && "Evaluation failed"}
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
                <span className="text-muted-foreground">Starting claude…</span>
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
