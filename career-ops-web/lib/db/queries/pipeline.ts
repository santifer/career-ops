import { db } from "@/lib/db";
import { pipelineEntries } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type PipelineRow = typeof pipelineEntries.$inferSelect;

export async function listPipelineEntries(userId: string): Promise<PipelineRow[]> {
  return db.query.pipelineEntries.findMany({
    where: eq(pipelineEntries.userId, userId),
    orderBy: [desc(pipelineEntries.addedAt)],
  });
}

export async function getPipelineEntry(
  id: string,
  userId: string,
): Promise<PipelineRow | undefined> {
  return db.query.pipelineEntries.findFirst({
    where: and(eq(pipelineEntries.id, id), eq(pipelineEntries.userId, userId)),
  });
}

export async function addPipelineUrls(
  userId: string,
  urls: string[],
): Promise<PipelineRow[]> {
  if (urls.length === 0) return [];

  const values = urls.map((url) => ({
    userId,
    url: url.trim(),
    source: "manual" as const,
    status: "pending" as const,
  }));

  return db.insert(pipelineEntries).values(values).returning();
}

export async function updatePipelineEntry(
  id: string,
  userId: string,
  data: Partial<{
    status: "pending" | "processing" | "completed" | "failed";
    company: string;
    role: string;
    reportId: string;
    processedAt: Date;
  }>,
): Promise<PipelineRow | undefined> {
  const [row] = await db
    .update(pipelineEntries)
    .set(data)
    .where(and(eq(pipelineEntries.id, id), eq(pipelineEntries.userId, userId)))
    .returning();

  return row;
}

export async function deletePipelineEntry(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(pipelineEntries)
    .where(and(eq(pipelineEntries.id, id), eq(pipelineEntries.userId, userId)))
    .returning({ id: pipelineEntries.id });

  return result.length > 0;
}
