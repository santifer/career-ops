import { getFollowUps, getApplications } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Metadata } from "next"
import { TrackButton, AddFollowUpForm } from "./followup-client"

export const metadata: Metadata = { title: "Follow-ups — career-ops" }

function daysSince(dateStr: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function urgencyLabel(dueDate: string): { label: string; cls: string } {
  if (!dueDate) return { label: "", cls: "" }
  const diff = (new Date(dueDate).getTime() - Date.now()) / 86400000
  if (diff < 0) return { label: `${Math.abs(Math.floor(diff))}d overdue`, cls: "bg-red-100 text-red-800" }
  if (diff <= 1) return { label: "Today/Tomorrow", cls: "bg-yellow-100 text-yellow-800" }
  return { label: `${Math.floor(diff)}d left`, cls: "bg-green-100 text-green-800" }
}

export default async function FollowUpsPage() {
  const [followUps, apps] = await Promise.all([getFollowUps(), getApplications()])

  const trackedCompanies = new Set(followUps.map(f => f.company.toLowerCase()))
  const suggestions = apps.filter(a =>
    ["applied", "responded"].includes(a.status) && !trackedCompanies.has(a.company.toLowerCase())
  )

  const overdue = followUps.filter(f => f.dueDate && (new Date(f.dueDate).getTime() - Date.now()) / 86400000 < 0)
  const dueSoon = followUps.filter(f => f.dueDate && (new Date(f.dueDate).getTime() - Date.now()) / 86400000 >= 0 && (new Date(f.dueDate).getTime() - Date.now()) / 86400000 <= 2)

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow-ups</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {followUps.length} tracked · {suggestions.length} suggested
            {overdue.length > 0 && <span className="text-red-600 ml-2">· {overdue.length} overdue</span>}
            {dueSoon.length > 0 && <span className="text-yellow-600 ml-2">· {dueSoon.length} due soon</span>}
          </p>
        </div>
        <AddFollowUpForm />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700 font-mono">Suggested — Applied but not tracked</p>
          {suggestions.map(app => (
            <Card key={app.number} className="border-orange-200 bg-orange-50/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 items-center">
                    <span className="font-semibold text-sm">{app.company}</span>
                    <span className="text-sm text-muted-foreground truncate">{app.role}</span>
                    <span className="text-xs text-muted-foreground font-mono">{daysSince(app.date)}d ago · {app.date}</span>
                  </div>
                  <TrackButton company={app.company} role={app.role} appliedDate={app.date} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-2xl">📮</p>
          <p className="font-medium">No follow-ups tracked yet</p>
          <p className="text-sm">Use the &ldquo;+ Add follow-up&rdquo; button or track suggestions above.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {["Company","Role","Applied","Days Since","Next Action","Due","Notes"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(f => {
                    const urg = urgencyLabel(f.dueDate)
                    const isOverdue = urg.cls.includes("red")
                    return (
                      <tr key={f.number} className={`border-b last:border-0 hover:bg-muted/30 ${isOverdue ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">{f.company}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-48 truncate">{f.role}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{f.appliedDate}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className={daysSince(f.lastContact || f.appliedDate) > 7 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                            {daysSince(f.lastContact || f.appliedDate)}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{f.nextAction}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {urg.label && <Badge className={urg.cls} variant="secondary">{urg.label}</Badge>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-40 truncate text-xs">{f.notes}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
