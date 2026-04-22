import { and, desc, eq, sql } from "drizzle-orm";
import { buildQueuedRunSeed } from "@/lib/career-ops/run-seed";
import { db } from "@/lib/db";
import { agentRuns } from "@/lib/db/schema";
import { appendAgentRunEvent, listAgentRunEvents } from "./agent-run-events";
import { listAgentRunArtifacts } from "./agent-run-artifacts";

export async function createQueuedAgentRun(input: {
  userId: string;
  mode: string;
  cliLine: string;
  promptBundle: string;
  subagentInstruction: string;
  userNotes?: string | null;
  repoRevision?: string | null;
  runnerKind?: string | null;
}) {
  const seed = buildQueuedRunSeed({
    mode: input.mode,
    promptBundle: input.promptBundle,
    repoRevision: input.repoRevision,
  });

  const [row] = await db
    .insert(agentRuns)
    .values({
      userId: input.userId,
      mode: input.mode,
      status: "queued",
      cliLine: input.cliLine,
      promptBundle: input.promptBundle,
      subagentInstruction: input.subagentInstruction,
      userNotes: input.userNotes ?? null,
      repoRevision: seed.repoRevision,
      workspaceBundleHash: seed.workspaceBundleHash,
      runnerKind: input.runnerKind ?? "fake",
    })
    .returning();

  await appendAgentRunEvent({
    runId: row.id,
    type: "queued",
    message: `Queued ${row.mode} run`,
  });

  return row;
}

export async function claimNextQueuedAgentRun() {
  const result = await db.execute(sql`
    update agent_runs
    set
      status = 'provisioning',
      started_at = now(),
      updated_at = now()
    where id = (
      select id
      from agent_runs
      where status = 'queued'
      order by created_at asc
      limit 1
    )
    returning *;
  `);

  const row = result.rows[0] as typeof agentRuns.$inferSelect | undefined;

  if (!row) return null;

  await appendAgentRunEvent({
    runId: row.id,
    type: "claimed",
    message: "Runner claimed queued run",
  });

  return row;
}

export async function updateAgentRunStatus(input: {
  runId: string;
  status:
    | "queued"
    | "provisioning"
    | "running"
    | "waiting_for_user"
    | "succeeded"
    | "failed"
    | "canceled"
    | "timed_out";
  errorMessage?: string | null;
}) {
  const [row] = await db
    .update(agentRuns)
    .set({
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      finishedAt:
        input.status === "succeeded" ||
        input.status === "failed" ||
        input.status === "canceled" ||
        input.status === "timed_out"
          ? new Date()
          : null,
      updatedAt: new Date(),
    })
    .where(eq(agentRuns.id, input.runId))
    .returning();

  await appendAgentRunEvent({
    runId: input.runId,
    type: input.status === "failed" ? "failed" : "status_changed",
    message: `Run status changed to ${input.status}`,
    metadata: { status: input.status },
  });

  return row;
}

export async function listAgentRuns(userId: string, limit = 30) {
  return db.query.agentRuns.findMany({
    where: eq(agentRuns.userId, userId),
    orderBy: [desc(agentRuns.createdAt)],
    limit,
  });
}

export async function getAgentRun(userId: string, id: string) {
  return db.query.agentRuns.findFirst({
    where: and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)),
  });
}

export async function getAgentRunDetail(userId: string, id: string) {
  const run = await getAgentRun(userId, id);
  if (!run) return null;

  const [events, artifacts] = await Promise.all([
    listAgentRunEvents(run.id),
    listAgentRunArtifacts(run.id),
  ]);

  return { ...run, events, artifacts };
}
