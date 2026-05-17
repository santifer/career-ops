import { getPipeline } from "@/lib/api"
import { Metadata } from "next"
import { BatchClient } from "./batch-client"

export const metadata: Metadata = { title: "Batch Evaluate — career-ops" }

export default async function BatchPage() {
  const items = await getPipeline()
  const pending = items.filter(i => !i.done)

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Batch Evaluate</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select multiple pipeline items and evaluate them in parallel.
        </p>
      </div>
      <BatchClient items={pending} />
    </>
  )
}
