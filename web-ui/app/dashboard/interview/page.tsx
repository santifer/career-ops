import { getStoryBank, getInterviewFiles } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Metadata } from "next"
import { marked } from "marked"

export const metadata: Metadata = { title: "Interview Prep — career-ops" }

export default async function InterviewPage() {
  const [storyBank, files] = await Promise.all([getStoryBank(), getInterviewFiles()])
  const storyHTML = marked(storyBank) as string

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interview Prep</h1>
        <p className="text-muted-foreground text-sm mt-1">Story bank · {files.length} company-specific prep files</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Story Bank</CardTitle></CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none max-h-[65vh] overflow-y-auto
                prose-headings:font-semibold prose-headings:text-foreground
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-li:text-muted-foreground prose-strong:text-foreground
                prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
              dangerouslySetInnerHTML={{ __html: storyHTML }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Company Prep ({files.length})</CardTitle></CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2 text-center">
                <p className="text-2xl">🏢</p>
                <p className="text-sm font-medium">No company files yet</p>
                <p className="text-xs">Run a job evaluation to generate company-specific prep.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {files.map(f => (
                  <div key={f} className="rounded-md px-3 py-2 text-sm hover:bg-muted cursor-pointer transition-colors capitalize">
                    {f.replace(".md", "").replace(/-/g, " ")}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
