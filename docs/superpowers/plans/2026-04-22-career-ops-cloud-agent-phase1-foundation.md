# Career-Ops Cloud Agent Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working cloud-execution slice for `career-ops-web`: queued agent runs, run timeline and artifact persistence, a runner contract, a fake runner process, and a live `/command-center` status UI. This phase replaces compose-only flow with real queued execution while keeping Daytona, Hermes, and cloud browser providers behind a clean adapter boundary for later phases.

**Architecture:** Keep Next.js as the control plane and replace webhook dispatch with DB-backed queued runs plus append-only events and artifacts. Add a separate Node runner process that polls for queued work, claims runs, executes a fake adapter, and writes status transitions back to the database. Extend the command center UI to create queued runs, poll active runs, and render event timelines and artifacts. Later phases swap the fake adapter for real workspace generation, Daytona sandboxes, Hermes runtime, and browser providers without changing the web control plane contract.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM, Neon PostgreSQL, Vitest, tsx, Tailwind CSS, shadcn/ui

---

## Scope Check

The approved design spans multiple independent subsystems: control plane, runner, workspace generation, Daytona/Hermes integration, and browser safety gates. This plan intentionally covers only the first executable subsystem:

- queue-backed run orchestration in `career-ops-web`
- append-only run events and artifacts
- a fake runner adapter that proves lifecycle and UI behavior
- live run polling in `/command-center`

Follow-on plans should cover:

- generated Career-Ops user workspace bundle and repo revision pinning against real data
- real Hermes runner integration
- Daytona sandbox provisioning
- browser-backed `scan`, `auto-pipeline`, and `apply` with review gates

---

## File Structure

```text
career-ops-web/
├── app/
│   └── api/
│       └── career-ops/
│           └── runs/
│               ├── route.ts
│               ├── [id]/route.ts
│               └── __tests__/
│                   └── route.test.ts
├── components/
│   └── command-center/
│       ├── command-center-client.tsx
│       ├── agent-run-status-badge.tsx
│       └── agent-run-timeline.tsx
├── lib/
│   ├── career-ops/
│   │   ├── run-seed.ts
│   │   └── runner/
│   │       ├── config.ts
│   │       ├── types.ts
│   │       ├── status-machine.ts
│   │       ├── fake-adapter.ts
│   │       ├── service.ts
│   │       └── __tests__/
│   │           ├── config.test.ts
│   │           ├── fake-adapter.test.ts
│   │           └── status-machine.test.ts
│   └── db/
│       ├── schema.ts
│       └── queries/
│           ├── agent-runs.ts
│           ├── agent-run-events.ts
│           ├── agent-run-artifacts.ts
│           └── __tests__/
│               └── run-seed.test.ts
├── scripts/
│   └── run-agent-queue.ts
├── test/
│   └── setup.ts
├── package.json
├── vitest.config.ts
├── .env.local.example
└── README.md
```

---

### Task 1: Add Test Harness And Run Status Model

**Files:**
- Modify: `career-ops-web/package.json`
- Create: `career-ops-web/vitest.config.ts`
- Create: `career-ops-web/test/setup.ts`
- Create: `career-ops-web/lib/career-ops/runner/status-machine.ts`
- Test: `career-ops-web/lib/career-ops/runner/__tests__/status-machine.test.ts`

- [ ] **Step 1: Add test tooling and scripts**

Update `career-ops-web/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "db:push": "drizzle-kit push",
    "test": "vitest run",
    "test:watch": "vitest",
    "runner": "tsx scripts/run-agent-queue.ts"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20.19.39",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "tailwindcss": "^4",
    "tsx": "^4.20.6",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add Vitest configuration**

Create `career-ops-web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

Create `career-ops-web/test/setup.ts`:

```ts
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret";
process.env.DATABASE_URL ??=
  "postgresql://test:test@127.0.0.1:5432/career_ops_test?sslmode=disable";
```

- [ ] **Step 3: Write the failing test for the run status state machine**

Create `career-ops-web/lib/career-ops/runner/__tests__/status-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertValidAgentRunTransition,
  isActiveAgentRunStatus,
  isTerminalAgentRunStatus,
  type AgentRunStatus,
} from "@/lib/career-ops/runner/status-machine";

describe("agent run status machine", () => {
  it("allows queued work to move into provisioning and running", () => {
    expect(assertValidAgentRunTransition("queued", "provisioning")).toBe(true);
    expect(assertValidAgentRunTransition("provisioning", "running")).toBe(true);
  });

  it("treats waiting_for_user as non-terminal and succeeded as terminal", () => {
    expect(isActiveAgentRunStatus("waiting_for_user")).toBe(false);
    expect(isTerminalAgentRunStatus("waiting_for_user")).toBe(false);
    expect(isTerminalAgentRunStatus("succeeded")).toBe(true);
  });

  it("rejects invalid backward transitions", () => {
    expect(() =>
      assertValidAgentRunTransition(
        "succeeded" satisfies AgentRunStatus,
        "running" satisfies AgentRunStatus,
      ),
    ).toThrow("Invalid agent run transition");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/career-ops/runner/__tests__/status-machine.test.ts
```

Expected: FAIL with module-not-found or export-not-found errors for `status-machine.ts`.

- [ ] **Step 5: Write the minimal status machine implementation**

Create `career-ops-web/lib/career-ops/runner/status-machine.ts`:

```ts
export type AgentRunStatus =
  | "queued"
  | "provisioning"
  | "running"
  | "waiting_for_user"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timed_out";

const allowedTransitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ["provisioning", "failed", "canceled", "timed_out"],
  provisioning: ["running", "failed", "canceled", "timed_out"],
  running: ["waiting_for_user", "succeeded", "failed", "canceled", "timed_out"],
  waiting_for_user: ["running", "canceled", "timed_out"],
  succeeded: [],
  failed: [],
  canceled: [],
  timed_out: [],
};

export function assertValidAgentRunTransition(
  from: AgentRunStatus,
  to: AgentRunStatus,
) {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid agent run transition: ${from} -> ${to}`);
  }

  return true;
}

export function isTerminalAgentRunStatus(status: AgentRunStatus) {
  return ["succeeded", "failed", "canceled", "timed_out"].includes(status);
}

export function isActiveAgentRunStatus(status: AgentRunStatus) {
  return ["queued", "provisioning", "running"].includes(status);
}
```

- [ ] **Step 6: Run the tests and lint**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/career-ops/runner/__tests__/status-machine.test.ts
npm run lint
```

Expected:

- Vitest PASS for `status-machine.test.ts`
- ESLint completes without new errors

- [ ] **Step 7: Commit**

```bash
git add career-ops-web/package.json career-ops-web/vitest.config.ts career-ops-web/test/setup.ts career-ops-web/lib/career-ops/runner/status-machine.ts career-ops-web/lib/career-ops/runner/__tests__/status-machine.test.ts
git commit -m "test: add run status machine coverage"
```

---

### Task 2: Extend Run Persistence For Queue, Events, Artifacts, And Seeded Metadata

**Files:**
- Create: `career-ops-web/lib/career-ops/run-seed.ts`
- Test: `career-ops-web/lib/db/queries/__tests__/run-seed.test.ts`
- Modify: `career-ops-web/lib/db/schema.ts`
- Modify: `career-ops-web/lib/db/queries/agent-runs.ts`
- Create: `career-ops-web/lib/db/queries/agent-run-events.ts`
- Create: `career-ops-web/lib/db/queries/agent-run-artifacts.ts`

- [ ] **Step 1: Write the failing test for deterministic run seed generation**

Create `career-ops-web/lib/db/queries/__tests__/run-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQueuedRunSeed } from "@/lib/career-ops/run-seed";

describe("buildQueuedRunSeed", () => {
  it("generates a deterministic workspace bundle hash", () => {
    const first = buildQueuedRunSeed({
      mode: "scan",
      promptBundle: "# bundle",
      repoRevision: "3792333",
    });
    const second = buildQueuedRunSeed({
      mode: "scan",
      promptBundle: "# bundle",
      repoRevision: "3792333",
    });

    expect(first.workspaceBundleHash).toBe(second.workspaceBundleHash);
    expect(first.workspaceBundleHash).toHaveLength(64);
  });

  it("falls back to a dev revision when no repo revision is provided", () => {
    const seed = buildQueuedRunSeed({
      mode: "apply",
      promptBundle: "# another bundle",
    });

    expect(seed.repoRevision).toBe("dev");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/db/queries/__tests__/run-seed.test.ts
```

Expected: FAIL with module-not-found for `run-seed.ts`.

- [ ] **Step 3: Write the seed helper**

Create `career-ops-web/lib/career-ops/run-seed.ts`:

```ts
import { createHash } from "node:crypto";

export function buildQueuedRunSeed(input: {
  mode: string;
  promptBundle: string;
  repoRevision?: string | null;
}) {
  return {
    mode: input.mode,
    repoRevision: input.repoRevision?.trim() || "dev",
    workspaceBundleHash: createHash("sha256")
      .update(input.promptBundle)
      .digest("hex"),
  };
}
```

- [ ] **Step 4: Expand the database schema for queued runs, events, and artifacts**

Update `career-ops-web/lib/db/schema.ts` by replacing the old run status enum and table definition with:

```ts
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "provisioning",
  "running",
  "waiting_for_user",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
]);

export const agentRunEventTypeEnum = pgEnum("agent_run_event_type", [
  "queued",
  "claimed",
  "status_changed",
  "log",
  "artifact",
  "review_required",
  "completed",
  "failed",
]);

export const agentRunArtifactKindEnum = pgEnum("agent_run_artifact_kind", [
  "log",
  "report_markdown",
  "screenshot",
  "pdf",
  "json",
]);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    mode: varchar("mode", { length: 64 }).notNull(),
    status: agentRunStatusEnum("status").default("queued").notNull(),
    cliLine: varchar("cli_line", { length: 128 }).notNull(),
    promptBundle: text("prompt_bundle").notNull(),
    subagentInstruction: text("subagent_instruction"),
    userNotes: text("user_notes"),
    repoRevision: varchar("repo_revision", { length: 64 }).default("dev").notNull(),
    workspaceBundleHash: varchar("workspace_bundle_hash", { length: 64 }).notNull(),
    runnerKind: varchar("runner_kind", { length: 32 }).default("fake").notNull(),
    sandboxId: varchar("sandbox_id", { length: 255 }),
    browserSessionId: varchar("browser_session_id", { length: 255 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    costUsd: decimal("cost_usd", { precision: 8, scale: 6 }).default("0").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_runs_user_created_idx").on(table.userId, table.createdAt),
    index("agent_runs_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .references(() => agentRuns.id, { onDelete: "cascade" })
      .notNull(),
    type: agentRunEventTypeEnum("type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_run_events_run_created_idx").on(table.runId, table.createdAt)],
);

export const agentRunArtifacts = pgTable(
  "agent_run_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .references(() => agentRuns.id, { onDelete: "cascade" })
      .notNull(),
    kind: agentRunArtifactKindEnum("kind").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }),
    externalUrl: varchar("external_url", { length: 1000 }),
    previewText: text("preview_text"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_run_artifacts_run_created_idx").on(table.runId, table.createdAt)],
);
```

Also add the new relations near the bottom of `schema.ts`:

```ts
export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  user: one(users, {
    fields: [agentRuns.userId],
    references: [users.id],
  }),
  events: many(agentRunEvents),
  artifacts: many(agentRunArtifacts),
}));

export const agentRunEventsRelations = relations(agentRunEvents, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentRunEvents.runId],
    references: [agentRuns.id],
  }),
}));

export const agentRunArtifactsRelations = relations(agentRunArtifacts, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentRunArtifacts.runId],
    references: [agentRuns.id],
  }),
}));
```

- [ ] **Step 5: Replace the old run query helper with queue-aware helpers**

Create `career-ops-web/lib/db/queries/agent-run-events.ts`:

```ts
import { db } from "@/lib/db";
import { agentRunEvents } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

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
```

Create `career-ops-web/lib/db/queries/agent-run-artifacts.ts`:

```ts
import { db } from "@/lib/db";
import { agentRunArtifacts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

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
```

Replace `career-ops-web/lib/db/queries/agent-runs.ts` with:

```ts
import { db } from "@/lib/db";
import { agentRuns } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { buildQueuedRunSeed } from "@/lib/career-ops/run-seed";
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
```

- [ ] **Step 6: Run the tests, schema push, and lint**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/db/queries/__tests__/run-seed.test.ts
npm run lint
npm run db:push
```

Expected:

- Vitest PASS for `run-seed.test.ts`
- ESLint PASS
- Drizzle/DB push applies the enum and table changes cleanly

- [ ] **Step 7: Commit**

```bash
git add career-ops-web/lib/career-ops/run-seed.ts career-ops-web/lib/db/schema.ts career-ops-web/lib/db/queries/agent-runs.ts career-ops-web/lib/db/queries/agent-run-events.ts career-ops-web/lib/db/queries/agent-run-artifacts.ts career-ops-web/lib/db/queries/__tests__/run-seed.test.ts
git commit -m "feat: add queued agent run persistence"
```

---

### Task 3: Add The Runner Contract, Fake Adapter, And Queue Poller

**Files:**
- Create: `career-ops-web/lib/career-ops/runner/types.ts`
- Create: `career-ops-web/lib/career-ops/runner/fake-adapter.ts`
- Create: `career-ops-web/lib/career-ops/runner/service.ts`
- Create: `career-ops-web/scripts/run-agent-queue.ts`
- Test: `career-ops-web/lib/career-ops/runner/__tests__/fake-adapter.test.ts`

- [ ] **Step 1: Write the failing test for the fake runner adapter**

Create `career-ops-web/lib/career-ops/runner/__tests__/fake-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runFakeAgentAdapter } from "@/lib/career-ops/runner/fake-adapter";

describe("runFakeAgentAdapter", () => {
  it("pauses apply runs for human review", async () => {
    const result = await runFakeAgentAdapter({
      id: "run-1",
      mode: "apply",
      promptBundle: "# prompt",
      userNotes: "resume for a job form",
    });

    expect(result.finalStatus).toBe("waiting_for_user");
    expect(result.events.at(-1)?.type).toBe("review_required");
  });

  it("marks scan runs as succeeded with a markdown artifact", async () => {
    const result = await runFakeAgentAdapter({
      id: "run-2",
      mode: "scan",
      promptBundle: "# prompt",
      userNotes: null,
    });

    expect(result.finalStatus).toBe("succeeded");
    expect(result.artifacts[0]?.kind).toBe("report_markdown");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/career-ops/runner/__tests__/fake-adapter.test.ts
```

Expected: FAIL with module-not-found for `fake-adapter.ts`.

- [ ] **Step 3: Define the runner contract and fake adapter**

Create `career-ops-web/lib/career-ops/runner/types.ts`:

```ts
import type { AgentRunStatus } from "./status-machine";

export interface AgentRunWorkItem {
  id: string;
  mode: string;
  promptBundle: string;
  userNotes: string | null;
}

export interface AgentRunExecutionEvent {
  type:
    | "log"
    | "artifact"
    | "review_required"
    | "completed";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunExecutionArtifact {
  kind: "log" | "report_markdown" | "screenshot" | "pdf" | "json";
  label: string;
  previewText?: string;
}

export interface AgentRunExecutionResult {
  finalStatus: Extract<
    AgentRunStatus,
    "running" | "waiting_for_user" | "succeeded" | "failed"
  >;
  events: AgentRunExecutionEvent[];
  artifacts: AgentRunExecutionArtifact[];
  errorMessage?: string;
}

export interface AgentRunnerAdapter {
  run(input: AgentRunWorkItem): Promise<AgentRunExecutionResult>;
}
```

Create `career-ops-web/lib/career-ops/runner/fake-adapter.ts`:

```ts
import type {
  AgentRunExecutionResult,
  AgentRunWorkItem,
} from "./types";

export async function runFakeAgentAdapter(
  input: AgentRunWorkItem,
): Promise<AgentRunExecutionResult> {
  if (input.mode === "apply") {
    return {
      finalStatus: "waiting_for_user",
      events: [
        { type: "log", message: "Loaded fake apply workflow" },
        {
          type: "review_required",
          message: "Human review required before continuing apply flow",
        },
      ],
      artifacts: [
        {
          kind: "json",
          label: "apply-review-summary.json",
          previewText: JSON.stringify(
            {
              fieldsPrepared: 3,
              filesPrepared: ["resume.pdf"],
              finalSubmitBlocked: true,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    finalStatus: "succeeded",
    events: [
      { type: "log", message: `Executed fake ${input.mode} run` },
      { type: "completed", message: `Fake ${input.mode} run completed` },
    ],
    artifacts: [
      {
        kind: "report_markdown",
        label: `${input.mode}-summary.md`,
        previewText: `# Fake ${input.mode} output\n\nThis is a fake runner artifact.`,
      },
    ],
  };
}
```

- [ ] **Step 4: Implement the runner service and queue poller**

Create `career-ops-web/lib/career-ops/runner/service.ts`:

```ts
import {
  claimNextQueuedAgentRun,
  updateAgentRunStatus,
} from "@/lib/db/queries/agent-runs";
import { appendAgentRunEvent } from "@/lib/db/queries/agent-run-events";
import { createAgentRunArtifact } from "@/lib/db/queries/agent-run-artifacts";
import type { AgentRunnerAdapter } from "./types";

export async function runNextQueuedAgentRun(adapter: AgentRunnerAdapter) {
  const claimed = await claimNextQueuedAgentRun();
  if (!claimed) return { kind: "idle" as const };

  await updateAgentRunStatus({
    runId: claimed.id,
    status: "running",
  });

  try {
    const result = await adapter.run({
      id: claimed.id,
      mode: claimed.mode,
      promptBundle: claimed.promptBundle,
      userNotes: claimed.userNotes,
    });

    for (const event of result.events) {
      await appendAgentRunEvent({
        runId: claimed.id,
        type: event.type === "completed" ? "completed" : event.type,
        message: event.message,
        metadata: event.metadata ?? null,
      });
    }

    for (const artifact of result.artifacts) {
      await createAgentRunArtifact({
        runId: claimed.id,
        kind: artifact.kind,
        label: artifact.label,
        previewText: artifact.previewText ?? null,
      });
    }

    await updateAgentRunStatus({
      runId: claimed.id,
      status: result.finalStatus,
      errorMessage: result.errorMessage ?? null,
    });

    return {
      kind: "processed" as const,
      runId: claimed.id,
      finalStatus: result.finalStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await updateAgentRunStatus({
      runId: claimed.id,
      status: "failed",
      errorMessage: message,
    });

    return {
      kind: "processed" as const,
      runId: claimed.id,
      finalStatus: "failed" as const,
    };
  }
}
```

Create `career-ops-web/scripts/run-agent-queue.ts`:

```ts
import "dotenv/config";
import { runFakeAgentAdapter } from "@/lib/career-ops/runner/fake-adapter";
import { runNextQueuedAgentRun } from "@/lib/career-ops/runner/service";

const POLL_MS = Number(process.env.CAREER_OPS_RUNNER_POLL_MS ?? 2000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.stdout.write("career-ops fake runner polling for queued runs\n");

  while (true) {
    const result = await runNextQueuedAgentRun({
      run: runFakeAgentAdapter,
    });

    if (result.kind === "idle") {
      await sleep(POLL_MS);
      continue;
    }

    process.stdout.write(
      `processed ${result.runId} -> ${result.finalStatus}\n`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Run the test and start the runner**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/career-ops/runner/__tests__/fake-adapter.test.ts
npm run runner
```

Expected:

- Vitest PASS for `fake-adapter.test.ts`
- Runner process prints `career-ops fake runner polling for queued runs`

- [ ] **Step 6: Commit**

```bash
git add career-ops-web/lib/career-ops/runner/types.ts career-ops-web/lib/career-ops/runner/fake-adapter.ts career-ops-web/lib/career-ops/runner/service.ts career-ops-web/lib/career-ops/runner/__tests__/fake-adapter.test.ts career-ops-web/scripts/run-agent-queue.ts
git commit -m "feat: add fake agent runner service"
```

---

### Task 4: Queue Runs From The API And Render Live Run State In Command Center

**Files:**
- Modify: `career-ops-web/app/api/career-ops/runs/route.ts`
- Modify: `career-ops-web/app/api/career-ops/runs/[id]/route.ts`
- Test: `career-ops-web/app/api/career-ops/runs/__tests__/route.test.ts`
- Create: `career-ops-web/components/command-center/agent-run-status-badge.tsx`
- Create: `career-ops-web/components/command-center/agent-run-timeline.tsx`
- Modify: `career-ops-web/components/command-center/command-center-client.tsx`
- Modify: `career-ops-web/app/(app)/command-center/page.tsx`

- [ ] **Step 1: Write the failing API contract test**

Create `career-ops-web/app/api/career-ops/runs/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const composeCareerOpsPrompt = vi.fn();
const createQueuedAgentRun = vi.fn();
const getAgentRunDetail = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession,
}));

vi.mock("@/lib/career-ops/compose-prompt", () => ({
  composeCareerOpsPrompt,
  CareerOpsRepoError: class CareerOpsRepoError extends Error {},
}));

vi.mock("@/lib/career-ops/modes", () => ({
  isCareerOpsModeId: (id: string) => id === "scan",
  getModeDefinition: () => ({
    id: "scan",
    label: "Scan",
    description: "Scan portals",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops scan",
  }),
}));

vi.mock("@/lib/db/queries/agent-runs", () => ({
  createQueuedAgentRun,
  listAgentRuns: vi.fn(),
  getAgentRunDetail,
}));

import { POST } from "@/app/api/career-ops/runs/route";

describe("POST /api/career-ops/runs", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ userId: "user-1" });
    composeCareerOpsPrompt.mockResolvedValue({
      cliLine: "/career-ops scan",
      promptBundle: "# prompt",
      subagentInstruction: "description: career-ops scan",
      root: "/tmp/career-ops",
    });
    createQueuedAgentRun.mockResolvedValue({
      id: "run-1",
      mode: "scan",
      status: "queued",
      promptBundle: "# prompt",
      cliLine: "/career-ops scan",
      subagentInstruction: "description: career-ops scan",
      userNotes: null,
    });
    getAgentRunDetail.mockResolvedValue({
      id: "run-1",
      mode: "scan",
      status: "queued",
      events: [],
      artifacts: [],
    });
  });

  it("queues the run and returns 202 Accepted", async () => {
    const request = new Request("http://localhost:3000/api/career-ops/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "scan" }),
    });

    const response = await POST(request as never);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.status).toBe("queued");
    expect(createQueuedAgentRun).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd career-ops-web
npm run test -- --run app/api/career-ops/runs/__tests__/route.test.ts
```

Expected: FAIL because the route still returns the old compose-and-dispatch behavior.

- [ ] **Step 3: Update the API routes to queue runs and return detailed run state**

Replace `career-ops-web/app/api/career-ops/runs/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  composeCareerOpsPrompt,
  CareerOpsRepoError,
} from "@/lib/career-ops/compose-prompt";
import { getModeDefinition, isCareerOpsModeId } from "@/lib/career-ops/modes";
import {
  createQueuedAgentRun,
  getAgentRunDetail,
  listAgentRuns,
} from "@/lib/db/queries/agent-runs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listAgentRuns(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const modeRaw = body?.mode;
  const userNotes =
    typeof body?.userNotes === "string" ? body.userNotes : undefined;

  if (typeof modeRaw !== "string" || !isCareerOpsModeId(modeRaw)) {
    return NextResponse.json(
      { error: "Invalid or missing mode" },
      { status: 400 },
    );
  }

  const def = getModeDefinition(modeRaw);
  if (!def) {
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  }

  try {
    const composed = await composeCareerOpsPrompt(def, userNotes);
    const row = await createQueuedAgentRun({
      userId: session.userId,
      mode: def.id,
      cliLine: composed.cliLine,
      promptBundle: composed.promptBundle,
      subagentInstruction: composed.subagentInstruction,
      userNotes: userNotes ?? null,
      repoRevision: process.env.CAREER_OPS_REPO_REVISION ?? "dev",
      runnerKind: process.env.CAREER_OPS_RUNNER_MODE ?? "fake",
    });

    const detail = (await getAgentRunDetail(session.userId, row.id)) ?? row;
    return NextResponse.json(detail, { status: 202 });
  } catch (error) {
    if (error instanceof CareerOpsRepoError) {
      return NextResponse.json(
        {
          error: error.message,
          hint:
            "Set CAREER_OPS_ROOT to your career-ops repository root (folder containing modes/_shared.md).",
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
```

Replace `career-ops-web/app/api/career-ops/runs/[id]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAgentRunDetail } from "@/lib/db/queries/agent-runs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await getAgentRunDetail(session.userId, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
```

- [ ] **Step 4: Add status badge, timeline component, and polling UI**

Create `career-ops-web/components/command-center/agent-run-status-badge.tsx`:

```tsx
const toneByStatus: Record<string, string> = {
  queued: "bg-neutral-100 text-neutral-700",
  provisioning: "bg-sky-50 text-sky-700",
  running: "bg-amber-50 text-amber-700",
  waiting_for_user: "bg-violet-50 text-violet-700",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  canceled: "bg-neutral-200 text-neutral-700",
  timed_out: "bg-orange-50 text-orange-700",
};

export function AgentRunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${toneByStatus[status] ?? toneByStatus.queued}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
```

Create `career-ops-web/components/command-center/agent-run-timeline.tsx`:

```tsx
type AgentRunEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type AgentRunArtifact = {
  id: string;
  kind: string;
  label: string;
  previewText: string | null;
};

export function AgentRunTimeline(props: {
  events: AgentRunEvent[];
  artifacts: AgentRunArtifact[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Timeline</h3>
        {props.events.length === 0 ? (
          <p className="text-sm text-neutral-500">No events yet.</p>
        ) : (
          props.events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <p className="text-sm text-neutral-800">{event.message}</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                {new Date(event.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Artifacts</h3>
        {props.artifacts.length === 0 ? (
          <p className="text-sm text-neutral-500">No artifacts yet.</p>
        ) : (
          props.artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <p className="text-sm font-medium text-neutral-800">
                {artifact.label}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-neutral-500 mt-1">
                {artifact.kind}
              </p>
              {artifact.previewText ? (
                <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 text-xs text-neutral-700">
                  {artifact.previewText}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Update the top of `career-ops-web/components/command-center/command-center-client.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAREER_OPS_MODES,
  type CareerOpsModeDefinition,
} from "@/lib/career-ops/modes";
import { Button } from "@/components/ui/button";
import {
  BoltIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { AgentRunStatusBadge } from "./agent-run-status-badge";
import { AgentRunTimeline } from "./agent-run-timeline";

type AgentRunEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type AgentRunArtifact = {
  id: string;
  kind: string;
  label: string;
  previewText: string | null;
};

type AgentRunRow = {
  id: string;
  mode: string;
  status: string;
  cliLine: string;
  promptBundle: string;
  subagentInstruction: string | null;
  userNotes: string | null;
  errorMessage: string | null;
  createdAt: string;
  events: AgentRunEvent[];
  artifacts: AgentRunArtifact[];
};
```

Add polling in `command-center-client.tsx`:

```tsx
useEffect(() => {
  if (!active) return;
  if (!["queued", "provisioning", "running"].includes(active.status)) return;

  const interval = window.setInterval(async () => {
    const res = await fetch(`/api/career-ops/runs/${active.id}`);
    if (!res.ok) return;
    const detail = (await res.json()) as AgentRunRow;
    setActive(detail);
    setRuns((prev) => [detail, ...prev.filter((row) => row.id !== detail.id)]);
  }, 2000);

  return () => window.clearInterval(interval);
}, [active]);
```

Change the main action button text:

```tsx
{loading ? "Queueing…" : "Compose and run"}
```

Render the status badge and timeline in the active run panel:

```tsx
<div className="flex flex-wrap gap-2 text-xs text-neutral-500">
  <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
    {active.mode}
  </span>
  <AgentRunStatusBadge status={active.status} />
  <span>{new Date(active.createdAt).toLocaleString()}</span>
</div>

<AgentRunTimeline events={active.events} artifacts={active.artifacts} />
```

Update `career-ops-web/app/(app)/command-center/page.tsx` so `initialRuns` includes timeline data:

```ts
const initialRuns = runs.map((r) => ({
  id: r.id,
  mode: r.mode,
  status: r.status,
  cliLine: r.cliLine,
  promptBundle: r.promptBundle,
  subagentInstruction: r.subagentInstruction,
  userNotes: r.userNotes,
  errorMessage: r.errorMessage,
  createdAt: r.createdAt.toISOString(),
  events: [],
  artifacts: [],
}));
```

- [ ] **Step 5: Run the tests, lint, build, and smoke test the full slice**

Run:

```bash
cd career-ops-web
npm run test -- --run app/api/career-ops/runs/__tests__/route.test.ts lib/career-ops/runner/__tests__/status-machine.test.ts lib/db/queries/__tests__/run-seed.test.ts lib/career-ops/runner/__tests__/fake-adapter.test.ts
npm run lint
npm run build
```

In two terminals, run:

```bash
cd career-ops-web
npm run runner
```

```bash
cd career-ops-web
npm run dev
```

Then:

1. Sign in to the app.
2. Open `/command-center`.
3. Create a `scan` run.
4. Confirm the run transitions `queued -> provisioning -> running -> succeeded`.
5. Create an `apply` run.
6. Confirm the run transitions `queued -> provisioning -> running -> waiting_for_user`.
7. Confirm timeline events and artifact previews appear in the active run panel.

Expected:

- all automated checks pass
- the queue-backed runner slice works end-to-end with the fake adapter

- [ ] **Step 6: Commit**

```bash
git add career-ops-web/app/api/career-ops/runs/route.ts career-ops-web/app/api/career-ops/runs/[id]/route.ts career-ops-web/app/api/career-ops/runs/__tests__/route.test.ts career-ops-web/components/command-center/agent-run-status-badge.tsx career-ops-web/components/command-center/agent-run-timeline.tsx career-ops-web/components/command-center/command-center-client.tsx career-ops-web/app/(app)/command-center/page.tsx
git commit -m "feat: queue and display agent run lifecycle"
```

---

### Task 5: Add Runner Configuration And Operator Docs

**Files:**
- Create: `career-ops-web/lib/career-ops/runner/config.ts`
- Test: `career-ops-web/lib/career-ops/runner/__tests__/config.test.ts`
- Modify: `career-ops-web/.env.local.example`
- Modify: `career-ops-web/README.md`

- [ ] **Step 1: Write the failing test for runner config defaults**

Create `career-ops-web/lib/career-ops/runner/__tests__/config.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getRunnerConfig } from "@/lib/career-ops/runner/config";

describe("getRunnerConfig", () => {
  it("returns fake mode defaults", () => {
    vi.stubEnv("CAREER_OPS_RUNNER_MODE", "");
    vi.stubEnv("CAREER_OPS_RUNNER_POLL_MS", "");
    vi.stubEnv("CAREER_OPS_REPO_REVISION", "");

    expect(getRunnerConfig()).toEqual({
      mode: "fake",
      pollMs: 2000,
      repoRevision: "dev",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd career-ops-web
npm run test -- --run lib/career-ops/runner/__tests__/config.test.ts
```

Expected: FAIL with module-not-found for `config.ts`.

- [ ] **Step 3: Implement the config helper**

Create `career-ops-web/lib/career-ops/runner/config.ts`:

```ts
export function getRunnerConfig() {
  return {
    mode: process.env.CAREER_OPS_RUNNER_MODE?.trim() || "fake",
    pollMs: Number(process.env.CAREER_OPS_RUNNER_POLL_MS ?? 2000),
    repoRevision: process.env.CAREER_OPS_REPO_REVISION?.trim() || "dev",
  };
}
```

Update `career-ops-web/scripts/run-agent-queue.ts` to use the config helper:

```ts
import "dotenv/config";
import { getRunnerConfig } from "@/lib/career-ops/runner/config";
import { runFakeAgentAdapter } from "@/lib/career-ops/runner/fake-adapter";
import { runNextQueuedAgentRun } from "@/lib/career-ops/runner/service";

const config = getRunnerConfig();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.stdout.write(
    `career-ops ${config.mode} runner polling every ${config.pollMs}ms\n`,
  );

  while (true) {
    const result = await runNextQueuedAgentRun({
      run: runFakeAgentAdapter,
    });

    if (result.kind === "idle") {
      await sleep(config.pollMs);
      continue;
    }

    process.stdout.write(
      `processed ${result.runId} -> ${result.finalStatus}\n`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Document the new runner environment and local operator flow**

Update `career-ops-web/.env.local.example`:

```dotenv
# Career-ops repo (so /command-center can load modes/_shared.md + modes/*.md).
# If the Next app is not inside the same git tree, set this to the career-ops root.
# CAREER_OPS_ROOT=/path/to/career-ops

# Queue runner
# Fake mode is the Phase 1 default. Later phases replace this with hermes/daytona.
CAREER_OPS_RUNNER_MODE=fake
CAREER_OPS_RUNNER_POLL_MS=2000
CAREER_OPS_REPO_REVISION=dev
```

Append to `career-ops-web/README.md`:

````md
## Cloud Agent Phase 1 Local Flow

Start the web app:

```bash
npm run dev
```

Start the queue runner in a second terminal:

```bash
npm run runner
```

Then open `/command-center`, queue a run, and watch the fake runner move it through the new lifecycle. `scan` should end in `succeeded`; `apply` should end in `waiting_for_user`.
````

- [ ] **Step 5: Run the final verification suite**

Run:

```bash
cd career-ops-web
npm run test -- --run app/api/career-ops/runs/__tests__/route.test.ts lib/career-ops/runner/__tests__/status-machine.test.ts lib/db/queries/__tests__/run-seed.test.ts lib/career-ops/runner/__tests__/fake-adapter.test.ts lib/career-ops/runner/__tests__/config.test.ts
npm run lint
npm run build
```

Expected:

- all tests PASS
- lint PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add career-ops-web/lib/career-ops/runner/config.ts career-ops-web/lib/career-ops/runner/__tests__/config.test.ts career-ops-web/.env.local.example career-ops-web/README.md career-ops-web/scripts/run-agent-queue.ts
git commit -m "docs: document cloud agent phase 1 runner flow"
```

---

## Exit Criteria

Phase 1 is complete when all of the following are true:

- `/command-center` queues runs instead of doing webhook dispatch
- `agent_runs` supports queue lifecycle metadata
- `agent_run_events` and `agent_run_artifacts` exist and are populated
- a separate runner process can claim queued work and write back lifecycle updates
- `scan` fake runs complete successfully
- `apply` fake runs pause in `waiting_for_user`
- the web UI renders live status, timeline, and artifact previews
- tests, lint, and build all pass

---

## Follow-On Plan Names

Create separate plans after this one for:

1. `career-ops-cloud-agent-phase2-workspace-bundle`
2. `career-ops-cloud-agent-phase3-hermes-daytona-runner`
3. `career-ops-cloud-agent-phase4-browser-parity-and-review-gates`
