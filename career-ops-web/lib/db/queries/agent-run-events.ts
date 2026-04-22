import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRunEvents } from "@/lib/db/schema";

export async function appendAgentRunEvent(input: {
  runId: string;
  type:
    | "queued"
    | "claimed"
    | "status_changed"
    | "log"
    | "artifact"
    | "review_required"
    | "completed"
    | "failed";
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const [row] = await db
    .insert(agentRunEvents)
    .values({
      runId: input.runId,
      type: input.type,
      message: input.message,
      metadata: input.metadata ?? null,
    })
    .returning();

  return row;
}

export async function listAgentRunEvents(runId: string) {
  return db.query.agentRunEvents.findMany({
    where: eq(agentRunEvents.runId, runId),
    orderBy: [asc(agentRunEvents.createdAt)],
  });
}
