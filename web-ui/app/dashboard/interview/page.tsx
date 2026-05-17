import { getStoryBank, getInterviewFiles, getApplications, STATUS_LABELS, STATUS_COLORS } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Metadata } from "next"
import { marked } from "marked"
import Link from "next/link"
import { PracticeMode, CompanyFileViewer } from "./interview-client"

export const metadata: Metadata = { title: "Interview Prep — career-ops" }

export default async function InterviewPage() {
  const [storyBank, files, apps] = await Promise.all([getStoryBank(), getInterviewFiles(), getApplications()])
  const storyHTML = marked(storyBank) as string

  const activeInterviews = apps.filter(a => ["responded", "interview"].includes(a.status))

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interview Prep</h1>
        <p className="text-muted-foreground text-sm mt-1">Story bank · {files.length} company-specific prep file{files.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Active interviews banner */}
      {activeInterviews.length > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50/30 px-4 py-3">
          <p className="text-sm font-semibold text-purple-900 mb-2">Active now — prep for these companies</p>
          <div className="flex flex-wrap gap-2">
            {activeInterviews.map(app => (
              <div key={app.number} className="flex items-center gap-2 rounded-md bg-white border px-3 py-1.5 text-sm">
                <span className="font-medium">{app.company}</span>
                <span className="text-muted-foreground text-xs">{app.role}</span>
                <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-purple-800 mt-2">
            Select the company file below to see role-specific prep material.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Story Bank</CardTitle>
              <span className="text-xs text-muted-foreground">Your STAR+R stories</span>
            </div>
          </CardHeader>
          <CardContent>
            {storyBank.trim() === "# Story Bank\n\nNo stories yet." || storyBank.includes("No stories yet") ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 text-center">
                <p className="text-3xl">📖</p>
                <p className="text-sm font-medium">Story bank is empty</p>
                <p className="text-xs max-w-xs">
                  Your STAR+R stories will be extracted automatically when you evaluate jobs.{" "}
                  <Link href="/dashboard/evaluate" className="text-blue-600 hover:underline">Evaluate a job</Link> to get started.
                </p>
              </div>
            ) : (
              <div
                className="prose prose-sm max-w-none max-h-[60vh] overflow-y-auto
                  prose-headings:font-semibold prose-headings:text-foreground
                  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-li:text-muted-foreground prose-strong:text-foreground
                  prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
                dangerouslySetInnerHTML={{ __html: storyHTML }}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Practice Mode</CardTitle></CardHeader>
            <CardContent>
              <PracticeMode storyBank={storyBank} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Company Prep ({files.length})</CardTitle></CardHeader>
            <CardContent>
              <CompanyFileViewer files={files} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
