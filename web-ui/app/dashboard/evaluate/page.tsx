"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

type State = "idle" | "running" | "done" | "error"

export default function EvaluatePage() {
  const [url, setUrl] = useState("")
  const [state, setState] = useState<State>("idle")
  const [lines, setLines] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
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
      if (msg.line !== undefined) setLines(prev => [...prev, msg.line])
      if (msg.done) {
        es.close()
        if (msg.error) {
          setErrorMsg(msg.error)
          setState("error")
        } else {
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
    setState("idle")
  }

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

      {(state !== "idle") && (
        <Card className="max-w-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {state === "running" && "Running evaluation…"}
                {state === "done" && "Evaluation complete"}
                {state === "error" && "Evaluation failed"}
              </CardTitle>
              {state === "running" && (
                <span className="inline-flex size-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={logRef}
              className="bg-muted rounded-md p-3 h-72 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap"
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

            {state === "done" && (
              <div className="mt-4 flex gap-2">
                <Button onClick={() => router.push("/dashboard/tracker")}>
                  View in Tracker
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  Evaluate another
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
