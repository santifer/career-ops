"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PipelineItem } from "@/lib/api"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

const STAGE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Fetching job posting", pattern: /fetch|scraping|getting|retrieving|navigat/i },
  { label: "Analyzing fit",        pattern: /analyz|evaluat|assess|review/i },
  { label: "Scoring",              pattern: /scor|block [A-F]|A\.|B\.|C\.|D\.|E\.|F\./i },
  { label: "Writing report",       pattern: /report|writing|generat/i },
  { label: "Updating tracker",     pattern: /tracker|application|tsv|merge/i },
]

function detectStage(line: string): string | null {
  for (const { label, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return label
  }
  return null
}

function extractScore(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/(\d+\.?\d*)\/5/)
    if (m) return m[1]
  }
  return null
}

type JobState = "pending" | "running" | "done" | "error"

interface JobStatus {
  jobId: string
  url: string
  company: string
  role: string
  state: JobState
  lines: string[]
  currentStage: string | null
  score: string | null
  error: string | null
}

function JobRow({ job }: { job: JobStatus }) {
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [job.lines])

  const stateColor = {
    pending: "bg-gray-100 text-gray-500",
    running: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  }[job.state]

  const stateLabel = {
    pending: "Pending",
    running: job.currentStage ? `${job.currentStage}…` : "Running…",
    done: job.score ? `${job.score}/5` : "Done",
    error: "Error",
  }[job.state]

  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {job.company && <span className="font-semibold text-sm">{job.company}</span>}
            {job.role && <span className="text-sm text-muted-foreground truncate">{job.role}</span>}
            {!job.company && <span className="text-xs text-muted-foreground font-mono truncate">{job.url}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={stateColor} variant="secondary">
            {job.state === "running" && <span className="inline-flex size-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />}
            {stateLabel}
          </Badge>
          {job.lines.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "▲" : "▼"} log
            </button>
          )}
        </div>
      </div>
      {expanded && job.lines.length > 0 && (
        <div
          ref={logRef}
          className="mt-2 bg-muted rounded-md p-2 max-h-32 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap"
        >
          {job.lines.map((l, i) => (
            <div key={i} className={l.startsWith("⚠") ? "text-yellow-600" : ""}>{l}</div>
          ))}
          {job.error && <div className="text-red-500 font-semibold mt-1">{job.error}</div>}
        </div>
      )}
    </div>
  )
}

export function BatchClient({ items }: { items: PipelineItem[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [jobs, setJobs] = useState<JobStatus[]>([])
  const [running, setRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const esRefs = useRef<Map<string, EventSource>>(new Map())

  useEffect(() => () => {
    esRefs.current.forEach(es => es.close())
  }, [])

  function toggleSelect(url: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.url)))
    }
  }

  function updateJob(jobId: string, patch: Partial<JobStatus>) {
    setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...patch } : j))
  }

  function appendLine(jobId: string, line: string) {
    setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, lines: [...j.lines, line] } : j))
  }

  async function handleEvaluate() {
    if (selected.size === 0) return
    setRunning(true)
    setAllDone(false)

    const selectedItems = items.filter(i => selected.has(i.url))
    const initialJobs: JobStatus[] = selectedItems.map(item => ({
      jobId: "",
      url: item.url,
      company: item.company,
      role: item.role,
      state: "pending",
      lines: [],
      currentStage: null,
      score: null,
      error: null,
    }))
    setJobs(initialJobs)

    let jobIds: string[]
    try {
      const r = await fetch(`${BASE}/api/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [...selected] }),
      })
      if (!r.ok) throw new Error(`Server error ${r.status}`)
      const data = await r.json()
      jobIds = data.jobIds
    } catch (err: unknown) {
      setJobs(prev => prev.map(j => ({ ...j, state: "error", error: err instanceof Error ? err.message : String(err) })))
      setRunning(false)
      return
    }

    // Map jobIds to urls (order preserved from server)
    setJobs(prev => prev.map((j, i) => ({ ...j, jobId: jobIds[i] ?? j.jobId })))

    let doneCount = 0
    const total = jobIds.length

    jobIds.forEach((jobId, idx) => {
      const url = selectedItems[idx]?.url ?? ""
      const es = new EventSource(`${BASE}/api/evaluate/${jobId}/stream`)
      esRefs.current.set(jobId, es)

      updateJob(jobId, { state: "running" })

      const seenStages = new Set<string>()
      let currentStage: string | null = null

      es.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.line !== undefined) {
          appendLine(jobId, msg.line)
          const stage = detectStage(msg.line)
          if (stage && !seenStages.has(stage)) {
            seenStages.add(stage)
            currentStage = stage
            updateJob(jobId, { currentStage: stage })
          }
        }
        if (msg.done) {
          es.close()
          esRefs.current.delete(jobId)
          if (msg.error) {
            updateJob(jobId, { state: "error", error: msg.error, currentStage: null })
          } else {
            setJobs(prev => {
              const j = prev.find(x => x.jobId === jobId)
              const score = j ? extractScore(j.lines) : null
              return prev.map(x => x.jobId === jobId ? { ...x, state: "done", score, currentStage: null } : x)
            })
            // Auto-mark pipeline done
            fetch(`${BASE}/api/pipeline`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, done: true }),
            }).catch(() => {})
          }
          doneCount++
          if (doneCount === total) {
            setRunning(false)
            setAllDone(true)
            router.refresh()
          }
        }
      }

      es.onerror = () => {
        es.close()
        esRefs.current.delete(jobId)
        updateJob(jobId, { state: "error", error: "Connection lost", currentStage: null })
        doneCount++
        if (doneCount === total) {
          setRunning(false)
          setAllDone(true)
        }
      }
    })
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p className="text-2xl">📭</p>
        <p className="font-medium">Pipeline is empty</p>
        <p className="text-sm">Add job URLs to your pipeline first</p>
        <Button asChild variant="outline" className="mt-2">
          <a href="/dashboard/pipeline">Go to Pipeline</a>
        </Button>
      </div>
    )
  }

  const doneJobs = jobs.filter(j => j.state === "done")
  const errorJobs = jobs.filter(j => j.state === "error")

  return (
    <>
      {jobs.length === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {selected.size > 0 ? `${selected.size} selected` : "Select items to evaluate"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {selected.size === items.length ? "Deselect all" : "Select all"}
                </button>
                <Button
                  onClick={handleEvaluate}
                  disabled={selected.size === 0 || running}
                  size="sm"
                >
                  Evaluate Selected ({selected.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {items.map(item => (
              <label
                key={item.url}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.url)}
                  onChange={() => toggleSelect(item.url)}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.company && <span className="font-semibold text-sm">{item.company}</span>}
                    {item.role && <span className="text-sm text-muted-foreground truncate">{item.role}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{item.url}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {running
                  ? `Evaluating ${jobs.length} job${jobs.length !== 1 ? "s" : ""}…`
                  : `Completed — ${doneJobs.length} done, ${errorJobs.length} error${errorJobs.length !== 1 ? "s" : ""}`
                }
              </CardTitle>
              {running && (
                <span className="inline-flex size-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {jobs.map(job => (
              <JobRow key={job.jobId || job.url} job={job} />
            ))}
          </CardContent>
        </Card>
      )}

      {allDone && doneJobs.length > 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 mb-4">
              {doneJobs.map(j => (
                <div key={j.jobId} className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{j.company || j.url}</span>
                  {j.score && (
                    <span className="font-mono font-bold text-green-700">{j.score}/5</span>
                  )}
                </div>
              ))}
            </div>
            <Button asChild>
              <a href="/dashboard/tracker">View in Tracker</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
