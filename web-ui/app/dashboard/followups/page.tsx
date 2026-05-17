import { getFollowUps } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Metadata } from "next"
import { AddFollowUpForm } from "./followup-client"

export const metadata: Metadata = { title: "Follow-ups — career-ops" }

function daysSince(dateStr: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default async function FollowUpsPage() {
  const followUps = await getFollowUps()

  const outreachCount = followUps.filter(f => f.type === "outreach").length
  const jobFollowupCount = followUps.filter(f => f.type === "follow-up").length

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow-ups</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {followUps.length} total
            {outreachCount > 0 && <span className="ml-2">· {outreachCount} recruiter outreach</span>}
            {jobFollowupCount > 0 && <span className="ml-2">· {jobFollowupCount} job follow-ups</span>}
          </p>
        </div>
        <AddFollowUpForm />
      </div>

      {followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-2xl">📮</p>
          <p className="font-medium">No follow-ups tracked yet</p>
          <p className="text-sm">Use &ldquo;Recruiter Find&rdquo; to generate and log recruiter outreach.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {["Type", "Company", "Role", "Contact", "Channel", "Sent", "Days Since", "Notes"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(f => (
                    <tr key={f.number} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={f.type === "outreach" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}
                        >
                          {f.type === "outreach" ? "Recruiter" : "Follow-up"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{f.company}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-48 truncate">{f.role}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{f.contact || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{f.channel || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{f.dateSent}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className={daysSince(f.dateSent) > 7 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                          {daysSince(f.dateSent)}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-40 truncate text-xs">{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
