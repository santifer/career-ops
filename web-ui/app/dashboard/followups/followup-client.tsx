"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

export function TrackButton({ company, role, appliedDate }: { company: string; role: string; appliedDate: string }) {
  const router = useRouter()
  const [tracking, setTracking] = useState(false)

  async function handleTrack() {
    setTracking(true)
    const today = new Date()
    const dueDate = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
    try {
      await fetch(`${BASE}/api/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, appliedDate, nextAction: "Follow up via email", dueDate }),
      })
      router.refresh()
    } finally {
      setTracking(false)
    }
  }

  return (
    <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={handleTrack} disabled={tracking}>
      {tracking ? "Adding…" : "+ Track"}
    </Button>
  )
}

export function AddFollowUpForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company: "", role: "", appliedDate: "", nextAction: "Follow up via email", dueDate: "",
  })

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    setSaving(true)
    try {
      await fetch(`${BASE}/api/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      setForm({ company: "", role: "", appliedDate: "", nextAction: "Follow up via email", dueDate: "" })
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add follow-up
      </Button>
    )
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Add follow-up</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Company *" value={form.company} onChange={field("company")} required />
            <Input placeholder="Role" value={form.role} onChange={field("role")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Applied date</label>
              <Input type="date" value={form.appliedDate} onChange={field("appliedDate")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Due date</label>
              <Input type="date" value={form.dueDate} onChange={field("dueDate")} />
            </div>
          </div>
          <Input placeholder="Next action" value={form.nextAction} onChange={field("nextAction")} />
          <div className="flex gap-2 mt-1">
            <Button type="submit" size="sm" disabled={saving || !form.company.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
