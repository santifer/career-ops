"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type RecruiterScenario, SCENARIO_LABELS, ARCHETYPE_COLORS } from "@/lib/api"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

type State = "idle" | "running" | "done" | "error"

const STAGE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Reading profile",    pattern: /profile|config\/profile/i },
  { label: "Detecting archetype", pattern: /archetype|classif|platform|agentic|founding|architect|forward/i },
  { label: "Finding recruiter",  pattern: /search|query|linkedin|recruiter|find/i },
  { label: "Drafting note",      pattern: /draft|note|300|char|connect/i },
  { label: "Writing follow-up",  pattern: /follow.?up|message|150|200 word/i },
]

function detectStage(line: string): string | null {
  for (const { label, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return label
  }
  return null
}

interface ExtractedOutput {
  note: string | null
  charCount: number | null
  followup: string | null
  archetype: string | null
  queries: string | null
}

function extractOutput(lines: string[]): ExtractedOutput {
  const full = lines.join("\n")

  const noteMatch = full.match(/##\s*Connection Note[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n\n\n|$)/i)
  const note = noteMatch?.[1]?.trim() ?? null

  const charMatch = full.match(/\[(\d+)\/300\s*chars?\]/i)
  const charCount = charMatch ? parseInt(charMatch[1]) : null

  const followupMatch = full.match(/##\s*Follow-up Message[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n\n\n|$)/i)
  const followup = followupMatch?.[1]?.trim() ?? null

  const archetypeMatch = full.match(/Archetype:\s*([^\n|*]+)/i)
  const archetype = archetypeMatch?.[1]?.trim() ?? null

  const queriesMatch = full.match(/##\s*Search Queries?[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n\n\n|$)/i)
  const queries = queriesMatch?.[1]?.trim() ?? null

  return { note, charCount, followup, archetype, queries }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs h-7">
      {copied ? "Copied ✓" : "Copy"}
    </Button>
  )
}

interface LogFormProps {
  scenario: RecruiterScenario
  archetype: string | null
  contextInput: string
  onLogged: () => void
}

function LogAssentForm({ scenario, archetype, contextInput, onLogged }: LogFormProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    company: "",
    role: "",
    contact: contextInput || "",
    channel: scenario === "C" ? "LinkedIn-DM" : "LinkedIn-Note",
  })

  if (done) {
    return <span className="text-xs text-green-600 font-medium">Logged ✓</span>
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Log as Sent
      </Button>
    )
  }

  async function handleLog(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    try {
      await fetch(`${BASE}/api/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "outreach",
          appNumber: "—",
          company: form.company,
          role: form.role,
          channel: form.channel,
          contact: form.contact,
          dateSent: today,
          notes: archetype || "",
        }),
      })
      setDone(true)
      onLogged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleLog} className="flex flex-col gap-2 mt-2 p-3 rounded-md border bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">Log this outreach</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Company *" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} required className="h-8 text-xs" />
        <Input placeholder="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Contact name" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} className="h-8 text-xs" />
        <select
          value={form.channel}
          onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-xs"
        >
          <option value="LinkedIn-Note">LinkedIn Note</option>
          <option value="LinkedIn-DM">LinkedIn DM</option>
          <option value="Email">Email</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !form.company.trim()} className="text-xs h-7">
          {saving ? "Logging…" : "Confirm"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-xs h-7">Cancel</Button>
      </div>
    </form>
  )
}

export default function RecruiterFindPage() {
  const [scenario, setScenario] = useState<RecruiterScenario>("A")
  const [input, setInput] = useState("")
  const [contextInput, setContextInput] = useState("")
  const [state, setState] = useState<State>("idle")
  const [lines, setLines] = useState<string[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [completedStages, setCompletedStages] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [output, setOutput] = useState<ExtractedOutput | null>(null)
  const [logged, setLogged] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const seenStages = useRef<Set<string>>(new Set())
  const currentStageRef = useRef<string | null>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  useEffect(() => () => { esRef.current?.close() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    setState("running")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    setOutput(null)
    setLogged(false)
    seenStages.current = new Set()
    currentStageRef.current = null

    let jobId: string
    try {
      const r = await fetch(`${BASE}/api/recruiter-find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, input: input.trim(), context: contextInput.trim() }),
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

    const es = new EventSource(`${BASE}/api/recruiter-find/${jobId}/stream`)
    esRef.current = es

    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.line !== undefined) {
        setLines(prev => {
          const next = [...prev, msg.line]
          const stage = detectStage(msg.line)
          if (stage && !seenStages.current.has(stage)) {
            seenStages.current.add(stage)
            if (currentStageRef.current && currentStageRef.current !== stage) {
              setCompletedStages(prev2 => {
                if (!prev2.includes(currentStageRef.current!)) {
                  return [...prev2, currentStageRef.current!]
                }
                return prev2
              })
            }
            currentStageRef.current = stage
            setCurrentStage(stage)
          }
          return next
        })
      }
      if (msg.done) {
        es.close()
        if (msg.error) {
          setErrorMsg(msg.error)
          setState("error")
        } else {
          setCurrentStage(null)
          setLines(prev => {
            setOutput(extractOutput(prev))
            return prev
          })
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
    setInput("")
    setContextInput("")
    setLines([])
    setErrorMsg("")
    setCurrentStage(null)
    setCompletedStages([])
    setOutput(null)
    setLogged(false)
    seenStages.current = new Set()
    currentStageRef.current = null
    setState("idle")
  }

  const allStages = STAGE_PATTERNS.map(s => s.label)
  const archetypeColor = output?.archetype ? (ARCHETYPE_COLORS[output.archetype] ?? "bg-gray-100 text-gray-700") : ""

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recruiter Find</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate copy-paste LinkedIn connection notes and follow-up messages for recruiter outreach.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Generate Outreach Message</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Scenario selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium">Scenario</label>
              <div className="flex gap-2">
                {(["A", "B", "C"] as RecruiterScenario[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScenario(s)}
                    disabled={state === "running"}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left ${
                      scenario === s
                        ? "border-foreground bg-foreground text-background"
                        : "border-input bg-background text-muted-foreground hover:border-foreground/50"
                    }`}
                  >
                    <span className="font-bold">{s}</span>
                    <span className="ml-1.5">{SCENARIO_LABELS[s]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main input */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
                {scenario === "A" && "Recruiter LinkedIn URL or profile info"}
                {scenario === "B" && "Job posting URL or company + role name"}
                {scenario === "C" && "Paste the recruiter's message"}
              </label>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={state === "running"}
                placeholder={
                  scenario === "A" ? "linkedin.com/in/sarah-recruiter or paste their profile text" :
                  scenario === "B" ? "https://jobs.lever.co/... or \"Company: Anthropic, Role: Senior ML Engineer\"" :
                  "Hi, I saw your profile and we're hiring a Senior AI Engineer at Cohere..."
                }
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
              />
            </div>

            {/* Optional context */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
                Extra context <span className="font-normal">(optional)</span>
              </label>
              <Input
                value={contextInput}
                onChange={e => setContextInput(e.target.value)}
                disabled={state === "running"}
                placeholder="Recruiter name, company, target role, or anything else useful…"
              />
            </div>

            <div className="flex gap-2">
              {state === "idle" || state === "error" ? (
                <Button type="submit" disabled={!input.trim()}>
                  Generate Message
                </Button>
              ) : state === "running" ? (
                <Button type="button" variant="outline" disabled>Running…</Button>
              ) : (
                <Button type="button" variant="outline" onClick={handleReset}>
                  Generate Another
                </Button>
              )}
              {(state === "done" || state === "error") && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  Reset
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Success card */}
      {state === "done" && output && (
        <Card className="max-w-2xl border-green-200 bg-green-50/30">
          <CardContent className="pt-5 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div className="flex-1">
                <p className="font-semibold">Messages Ready</p>
              </div>
              {output.archetype && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${archetypeColor}`}>
                  {output.archetype}
                </span>
              )}
            </div>

            {/* Scenario B: Search queries */}
            {scenario === "B" && output.queries && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search Queries</p>
                  <CopyButton text={output.queries} />
                </div>
                <div className="rounded-md border bg-background p-3">
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono">{output.queries}</pre>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Use these in Google or LinkedIn to find the recruiter, then paste their profile URL back in Scenario A.</p>
              </div>
            )}

            {/* Connection note */}
            {output.note && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection Note</p>
                    {output.charCount !== null && (
                      <span className={`text-xs font-mono ${output.charCount > 280 ? "text-orange-600" : "text-green-600"}`}>
                        [{output.charCount}/300]
                      </span>
                    )}
                  </div>
                  <CopyButton text={output.note} />
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{output.note}</p>
                </div>
              </div>
            )}

            {/* Follow-up message */}
            {output.followup && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-up Message</p>
                  <CopyButton text={output.followup} />
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{output.followup}</p>
                </div>
              </div>
            )}

            {/* Log as Sent */}
            {!logged && (
              <LogAssentForm
                scenario={scenario}
                archetype={output.archetype}
                contextInput={contextInput}
                onLogged={() => setLogged(true)}
              />
            )}
            {logged && (
              <p className="text-xs text-green-600 font-medium">Logged to follow-ups ✓</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Streaming log */}
      {state !== "idle" && (
        <Card className="max-w-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {state === "running" && "Generating…"}
                {state === "done" && "Full log"}
                {state === "error" && "Failed"}
              </CardTitle>
              {state === "running" && (
                <div className="flex items-center gap-2">
                  {currentStage && <span className="text-xs text-muted-foreground italic">{currentStage}…</span>}
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
