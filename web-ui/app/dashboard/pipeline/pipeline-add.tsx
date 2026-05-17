"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

export function AddToPipelineForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ url: "", company: "", role: "" })

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.url.trim()) return
    setSaving(true)
    try {
      await fetch(`${BASE}/api/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      setForm({ url: "", company: "", role: "" })
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add URL
      </Button>
    )
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Add to Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input
            placeholder="Job URL *"
            type="url"
            value={form.url}
            onChange={field("url")}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Company (optional)" value={form.company} onChange={field("company")} />
            <Input placeholder="Role (optional)" value={form.role} onChange={field("role")} />
          </div>
          <div className="flex gap-2 mt-1">
            <Button type="submit" size="sm" disabled={saving || !form.url.trim()}>
              {saving ? "Adding…" : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
