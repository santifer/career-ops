"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

export function PipelineActions({ url, done = false }: { url: string; done?: boolean }) {
  const router = useRouter()
  const [skipping, setSkipping] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const evaluateHref = `/dashboard/evaluate?url=${encodeURIComponent(url)}`

  async function handleSkip() {
    setSkipping(true)
    try {
      await fetch(`${BASE}/api/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, done: true }),
      })
      router.refresh()
    } finally {
      setSkipping(false)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      await fetch(`${BASE}/api/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, done: false }),
      })
      router.refresh()
    } finally {
      setRestoring(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={handleRestore}
          disabled={restoring}
        >
          {restoring ? "…" : "Restore"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <a href={url} target="_blank" rel="noreferrer" className="text-xs border rounded-md px-2.5 py-1 font-medium hover:bg-muted transition-colors">
        Open ↗
      </a>
      <Button asChild size="sm" variant="default" className="text-xs h-7">
        <a href={evaluateHref}>Evaluate</a>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-xs h-7 text-muted-foreground"
        onClick={handleSkip}
        disabled={skipping}
      >
        {skipping ? "…" : "Skip"}
      </Button>
    </div>
  )
}
