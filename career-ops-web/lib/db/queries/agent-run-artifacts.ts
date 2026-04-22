import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRunArtifacts } from "@/lib/db/schema";

export async function createAgentRunArtifact(input: {
  runId: string;
  kind: "log" | "report_markdown" | "screenshot" | "pdf" | "json";
  label: string;
  storageKey?: string | null;
  externalUrl?: string | null;
  previewText?: string | null;
}) {
  const [row] = await db
    .insert(agentRunArtifacts)
    .values({
      runId: input.runId,
      kind: input.kind,
      label: input.label,
      storageKey: input.storageKey ?? null,
      externalUrl: input.externalUrl ?? null,
      previewText: input.previewText ?? null,
    })
    .returning();

  return row;
}

export async function listAgentRunArtifacts(runId: string) {
  return db.query.agentRunArtifacts.findMany({
    where: eq(agentRunArtifacts.runId, runId),
    orderBy: [asc(agentRunArtifacts.createdAt)],
  });
}
