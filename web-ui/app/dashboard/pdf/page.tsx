import { getApplications } from "@/lib/api"
import { Metadata } from "next"
import { PdfClient } from "./pdf-client"

export const metadata: Metadata = { title: "Generate PDFs — career-ops" }

export default async function PdfPage() {
  const apps = await getApplications()
  const noPdf = apps.filter(a => !a.hasPDF && a.reportNumber !== null)

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generate PDFs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate tailored PDF CVs for evaluated applications that don&apos;t have one yet.
        </p>
      </div>
      <PdfClient apps={noPdf} />
    </>
  )
}
