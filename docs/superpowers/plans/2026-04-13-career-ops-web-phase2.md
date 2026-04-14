# Career-Ops Web — Phase 2: Core Data (Applications, Pipeline, Reports)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three primary data pages — Applications (Kanban board with drag-and-drop), Pipeline (URL inbox with add/process), and Reports (list + reader with A-G block rendering) — along with their supporting API routes and typed query helpers.

**Architecture:** Server-rendered pages fetch data via Drizzle query helpers. Client components handle interactivity (drag-and-drop, forms, slide-overs). API routes provide CRUD operations consumed by client-side mutations via `fetch`. No external state management — React state + server revalidation via `router.refresh()`.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, @dnd-kit (drag-and-drop), react-markdown (report rendering), shadcn/ui components, Heroicons, Tailwind CSS 4.

**Design Cheatsheet (apply everywhere):**
- Typography: Inter, letter-spacing -0.31px
- Backgrounds: `#FFFFFF` (cards) and `#FCFCFC` (page bg)
- Colors: TailwindCSS Neutral. `neutral-500` muted, `neutral-800` emphasis
- Icons: Heroicons — outline for nav, solid for emphasis
- Borders: `neutral-200`, 1px solid, rounded 8-12px
- Spacing: 16-24px card padding, 12-16px gaps
- Custom CSS class `card-surface` provides white card with neutral-200 border and 10px radius

**Existing codebase context:**
- shadcn/ui v4 uses `@base-ui/react` (not Radix). DropdownMenuTrigger does NOT support `asChild` — render directly with className instead.
- Auth: `getSession()` returns `{ userId: string } | null`. `getCurrentUser()` returns full user with profile + subscription relations.
- Scoring utilities: `scoreColor(score)`, `scoreBgColor(score)`, `scoreLabel(score)`, `statusColor(status)` in `@/lib/utils/scoring`.
- Database: `applications`, `reports`, `pipelineEntries` tables in `@/lib/db/schema`. See Phase 1 schema.ts for all column names and types.
- The `(app)/layout.tsx` handles auth check and renders TopNav + CommandBar. All `(app)/*` pages can assume an authenticated user.

---

## File Structure

```
career-ops-web/
├── lib/
│   └── db/
│       └── queries/
│           ├── applications.ts     # CRUD + reorder queries for applications
│           ├── pipeline.ts         # CRUD queries for pipeline entries
│           └── reports.ts          # Read queries for reports
├── app/
│   ├── (app)/
│   │   ├── applications/
│   │   │   └── page.tsx            # Kanban board (server component wrapper)
│   │   ├── pipeline/
│   │   │   └── page.tsx            # Pipeline inbox (server component wrapper)
│   │   └── reports/
│   │       ├── page.tsx            # Report list + reader (server component)
│   │       └── [id]/
│   │           └── page.tsx        # Individual report page
│   └── api/
│       ├── applications/
│       │   ├── route.ts            # GET (list) / POST (create)
│       │   └── [id]/
│       │       ├── route.ts        # PATCH (update status/fields) / DELETE
│       │       └── reorder/
│       │           └── route.ts    # PATCH (drag-and-drop status change)
│       ├── pipeline/
│       │   ├── route.ts            # GET (list) / POST (add URLs)
│       │   └── [id]/
│       │       └── route.ts        # PATCH (update) / DELETE
│       └── reports/
│           ├── route.ts            # GET (list, paginated, filterable)
│           └── [id]/
│               └── route.ts        # GET (full report with all blocks)
├── components/
│   ├── applications/
│   │   ├── kanban-board.tsx        # DnD context + column layout
│   │   ├── kanban-column.tsx       # Single status column
│   │   ├── application-card.tsx    # Card within a column
│   │   └── application-detail.tsx  # Slide-over detail panel
│   ├── pipeline/
│   │   ├── url-list.tsx            # Pipeline entries table
│   │   ├── add-url-form.tsx        # Add URL input
│   │   └── pipeline-status-badge.tsx  # Status badge component
│   └── reports/
│       ├── report-list.tsx         # Searchable/filterable list
│       ├── report-reader.tsx       # Full A-G block rendering
│       └── block-renderer.tsx      # Individual block component
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `career-ops-web/package.json`

- [ ] **Step 1: Install @dnd-kit packages**

```bash
cd career-ops-web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify install succeeded**

```bash
cd career-ops-web && node -e "require('@dnd-kit/core'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Install additional shadcn/ui components needed**

```bash
cd career-ops-web && npx shadcn@latest add sheet textarea scroll-area tabs
```

These are needed for: sheet (slide-over detail panel), textarea (notes editing), scroll-area (kanban columns), tabs (report reader sections).

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add package.json package-lock.json components/ui/
git commit -m "chore: add dnd-kit, sheet, textarea, scroll-area, tabs components"
```

---

## Task 2: Application Query Helpers

**Files:**
- Create: `career-ops-web/lib/db/queries/applications.ts`

- [ ] **Step 1: Create the applications query module**

Write file `career-ops-web/lib/db/queries/applications.ts`:

```typescript
import { db } from "@/lib/db";
import { applications, reports } from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationWithReport = ApplicationRow & {
  report: typeof reports.$inferSelect | null;
};

const CANONICAL_STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
export { CANONICAL_STATUSES };

export async function listApplications(userId: string): Promise<ApplicationWithReport[]> {
  const rows = await db.query.applications.findMany({
    where: eq(applications.userId, userId),
    with: { report: true },
    orderBy: [desc(applications.date), desc(applications.number)],
  });
  return rows as ApplicationWithReport[];
}

export async function getApplication(id: string, userId: string): Promise<ApplicationWithReport | undefined> {
  const row = await db.query.applications.findFirst({
    where: and(eq(applications.id, id), eq(applications.userId, userId)),
    with: { report: true },
  });
  return row as ApplicationWithReport | undefined;
}

export async function createApplication(
  userId: string,
  data: {
    company: string;
    role: string;
    url?: string;
    notes?: string;
    score?: string;
    status?: string;
  },
): Promise<ApplicationRow> {
  // Get next number
  const [maxRow] = await db
    .select({ maxNum: applications.number })
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.number))
    .limit(1);

  const nextNumber = (maxRow?.maxNum ?? 0) + 1;

  const [row] = await db
    .insert(applications)
    .values({
      userId,
      number: nextNumber,
      date: new Date().toISOString().split("T")[0],
      company: data.company,
      role: data.role,
      url: data.url,
      notes: data.notes,
      score: data.score,
      status: data.status ?? "Evaluated",
    })
    .returning();

  return row;
}

export async function updateApplication(
  id: string,
  userId: string,
  data: Partial<{
    company: string;
    role: string;
    status: string;
    score: string;
    notes: string;
    url: string;
    pdfUrl: string;
  }>,
): Promise<ApplicationRow | undefined> {
  const [row] = await db
    .update(applications)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning();

  return row;
}

export async function deleteApplication(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning({ id: applications.id });

  return result.length > 0;
}

export async function reorderApplication(
  id: string,
  userId: string,
  newStatus: string,
): Promise<ApplicationRow | undefined> {
  return updateApplication(id, userId, { status: newStatus });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add lib/db/queries/applications.ts
git commit -m "feat: application CRUD + reorder query helpers"
```

---

## Task 3: Pipeline Query Helpers

**Files:**
- Create: `career-ops-web/lib/db/queries/pipeline.ts`

- [ ] **Step 1: Create the pipeline query module**

Write file `career-ops-web/lib/db/queries/pipeline.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add lib/db/queries/pipeline.ts
git commit -m "feat: pipeline CRUD query helpers"
```

---

## Task 4: Reports Query Helpers

**Files:**
- Create: `career-ops-web/lib/db/queries/reports.ts`

- [ ] **Step 1: Create the reports query module**

Write file `career-ops-web/lib/db/queries/reports.ts`:

```typescript
import { db } from "@/lib/db";
import { reports, applications } from "@/lib/db/schema";
import { eq, and, desc, ilike, or, SQL } from "drizzle-orm";

export type ReportRow = typeof reports.$inferSelect;

export interface ReportListItem {
  id: string;
  number: number;
  companySlug: string;
  date: string;
  overallScore: string | null;
  legitimacyTier: string | null;
  applicationId: string | null;
  company: string | null;
  role: string | null;
}

export async function listReports(
  userId: string,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ reports: ReportListItem[]; total: number }> {
  const conditions: SQL[] = [eq(reports.userId, userId)];

  if (options?.search) {
    conditions.push(
      or(
        ilike(reports.companySlug, `%${options.search}%`),
        ilike(applications.company, `%${options.search}%`),
        ilike(applications.role, `%${options.search}%`),
      )!,
    );
  }

  const query = db
    .select({
      id: reports.id,
      number: reports.number,
      companySlug: reports.companySlug,
      date: reports.date,
      overallScore: reports.overallScore,
      legitimacyTier: reports.legitimacyTier,
      applicationId: reports.applicationId,
      company: applications.company,
      role: applications.role,
    })
    .from(reports)
    .leftJoin(applications, eq(reports.applicationId, applications.id))
    .where(and(...conditions))
    .orderBy(desc(reports.number));

  const allRows = await query;
  const total = allRows.length;
  const start = options?.offset ?? 0;
  const end = options?.limit ? start + options.limit : undefined;
  const sliced = allRows.slice(start, end);

  return { reports: sliced, total };
}

export async function getReport(
  id: string,
  userId: string,
): Promise<ReportRow | undefined> {
  return db.query.reports.findFirst({
    where: and(eq(reports.id, id), eq(reports.userId, userId)),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add lib/db/queries/reports.ts
git commit -m "feat: report list + read query helpers"
```

---

## Task 5: Applications API Routes

**Files:**
- Create: `career-ops-web/app/api/applications/route.ts`
- Create: `career-ops-web/app/api/applications/[id]/route.ts`
- Create: `career-ops-web/app/api/applications/[id]/reorder/route.ts`

- [ ] **Step 1: Create the list/create route**

Write file `career-ops-web/app/api/applications/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listApplications, createApplication } from "@/lib/db/queries/applications";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apps = await listApplications(session.userId);
  return NextResponse.json(apps);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { company, role, url, notes, score, status } = body;

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 },
    );
  }

  const app = await createApplication(session.userId, {
    company,
    role,
    url,
    notes,
    score,
    status,
  });

  return NextResponse.json(app, { status: 201 });
}
```

- [ ] **Step 2: Create the single-application route**

Write file `career-ops-web/app/api/applications/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getApplication,
  updateApplication,
  deleteApplication,
} from "@/lib/db/queries/applications";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const app = await getApplication(id, session.userId);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(app);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const app = await updateApplication(id, session.userId, body);

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(app);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = await deleteApplication(id, session.userId);

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create the reorder route**

Write file `career-ops-web/app/api/applications/[id]/reorder/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reorderApplication, CANONICAL_STATUSES } from "@/lib/db/queries/applications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!status || !CANONICAL_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${CANONICAL_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const app = await reorderApplication(id, session.userId, status);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(app);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add app/api/applications/
git commit -m "feat: applications API routes (list, create, update, delete, reorder)"
```

---

## Task 6: Pipeline API Routes

**Files:**
- Create: `career-ops-web/app/api/pipeline/route.ts`
- Create: `career-ops-web/app/api/pipeline/[id]/route.ts`

- [ ] **Step 1: Create the list/add route**

Write file `career-ops-web/app/api/pipeline/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listPipelineEntries, addPipelineUrls } from "@/lib/db/queries/pipeline";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await listPipelineEntries(session.userId);
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { urls } = body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: "urls array is required and must not be empty" },
      { status: 400 },
    );
  }

  // Basic URL validation
  const validUrls = urls.filter(
    (u: unknown) => typeof u === "string" && u.trim().startsWith("http"),
  );

  if (validUrls.length === 0) {
    return NextResponse.json(
      { error: "No valid URLs provided. Each URL must start with http" },
      { status: 400 },
    );
  }

  const entries = await addPipelineUrls(session.userId, validUrls);
  return NextResponse.json(entries, { status: 201 });
}
```

- [ ] **Step 2: Create the single-entry route**

Write file `career-ops-web/app/api/pipeline/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updatePipelineEntry, deletePipelineEntry } from "@/lib/db/queries/pipeline";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const entry = await updatePipelineEntry(id, session.userId, body);

  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = await deletePipelineEntry(id, session.userId);

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add app/api/pipeline/
git commit -m "feat: pipeline API routes (list, add URLs, update, delete)"
```

---

## Task 7: Reports API Routes

**Files:**
- Create: `career-ops-web/app/api/reports/route.ts`
- Create: `career-ops-web/app/api/reports/[id]/route.ts`

- [ ] **Step 1: Create the list route**

Write file `career-ops-web/app/api/reports/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listReports } from "@/lib/db/queries/reports";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;

  const result = await listReports(session.userId, { search, limit, offset });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Create the single-report route**

Write file `career-ops-web/app/api/reports/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getReport } from "@/lib/db/queries/reports";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await getReport(id, session.userId);

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add app/api/reports/
git commit -m "feat: reports API routes (list with search, single report)"
```

---

## Task 8: Application Card Component

**Files:**
- Create: `career-ops-web/components/applications/application-card.tsx`

- [ ] **Step 1: Create the application card**

Write file `career-ops-web/components/applications/application-card.tsx`:

```tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { scoreColor, scoreBgColor } from "@/lib/utils/scoring";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";

interface ApplicationCardProps {
  application: ApplicationWithReport;
  onClick: (app: ApplicationWithReport) => void;
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(application)}
      className={`card-surface cursor-grab active:cursor-grabbing p-4 hover:border-neutral-300 transition-colors ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">
            {application.company}
          </p>
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {application.role}
          </p>
        </div>
        {application.score && (
          <span
            className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(application.score)} ${scoreBgColor(application.score)}`}
          >
            {application.score}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>{application.date}</span>
        {application.report && (
          <span className="text-blue-500">Report #{application.report.number}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/applications/application-card.tsx
git commit -m "feat: draggable application card component"
```

---

## Task 9: Kanban Column Component

**Files:**
- Create: `career-ops-web/components/applications/kanban-column.tsx`

- [ ] **Step 1: Create the kanban column**

Write file `career-ops-web/components/applications/kanban-column.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ApplicationCard } from "./application-card";
import { statusColor } from "@/lib/utils/scoring";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";

interface KanbanColumnProps {
  status: string;
  applications: ApplicationWithReport[];
  onCardClick: (app: ApplicationWithReport) => void;
}

export function KanbanColumn({ status, applications, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className={`flex flex-col w-72 flex-shrink-0 rounded-lg ${
        isOver ? "bg-neutral-100" : "bg-neutral-50/50"
      } transition-colors`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusColor(status)}`}
        >
          {status}
        </span>
        <span className="text-xs text-neutral-400">{applications.length}</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-2 space-y-2 min-h-[200px] overflow-y-auto"
      >
        <SortableContext
          items={applications.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/applications/kanban-column.tsx
git commit -m "feat: kanban column component with droppable zone"
```

---

## Task 10: Application Detail Slide-over

**Files:**
- Create: `career-ops-web/components/applications/application-detail.tsx`

- [ ] **Step 1: Create the detail slide-over**

Write file `career-ops-web/components/applications/application-detail.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scoreColor, scoreBgColor, scoreLabel, statusColor } from "@/lib/utils/scoring";
import {
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";
import Link from "next/link";

interface ApplicationDetailProps {
  application: ApplicationWithReport | null;
  open: boolean;
  onClose: () => void;
}

export function ApplicationDetail({ application, open, onClose }: ApplicationDetailProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  if (!application) return null;

  async function handleDelete() {
    if (!application) return;
    if (!confirm(`Delete application for ${application.company} — ${application.role}?`)) return;

    setDeleting(true);
    await fetch(`/api/applications/${application.id}`, { method: "DELETE" });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold text-neutral-800">
            {application.company}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Role + Status */}
          <div>
            <p className="text-sm text-neutral-500">{application.role}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusColor(application.status)}`}
              >
                {application.status}
              </span>
              {application.score && (
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(application.score)} ${scoreBgColor(application.score)}`}
                >
                  {application.score}/5 — {scoreLabel(application.score)}
                </span>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Date</span>
              <span className="text-neutral-700">{application.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Number</span>
              <span className="text-neutral-700">#{application.number}</span>
            </div>
            {application.url && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">URL</span>
                <a
                  href={application.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                >
                  Open
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Notes */}
          {application.notes && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">
                Notes
              </h4>
              <p className="text-sm text-neutral-600 whitespace-pre-wrap">
                {application.notes}
              </p>
            </div>
          )}

          {/* Report link */}
          {application.report && (
            <Link
              href={`/reports/${application.report.id}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <DocumentTextIcon className="h-4 w-4" />
              View Report #{application.report.number}
            </Link>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-neutral-200">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              {deleting ? "Deleting..." : "Delete Application"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/applications/application-detail.tsx
git commit -m "feat: application detail slide-over panel"
```

---

## Task 11: Kanban Board Component

**Files:**
- Create: `career-ops-web/components/applications/kanban-board.tsx`

- [ ] **Step 1: Create the kanban board**

Write file `career-ops-web/components/applications/kanban-board.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { ApplicationCard } from "./application-card";
import { ApplicationDetail } from "./application-detail";
import {
  CANONICAL_STATUSES,
  type ApplicationWithReport,
} from "@/lib/db/queries/applications";

interface KanbanBoardProps {
  applications: ApplicationWithReport[];
}

export function KanbanBoard({ applications: initialApps }: KanbanBoardProps) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApps);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithReport | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Group applications by status
  const columns = CANONICAL_STATUSES.map((status) => ({
    status,
    applications: applications.filter((a) => a.status === status),
  }));

  const activeApp = activeId
    ? applications.find((a) => a.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const appId = active.id as string;

    // Determine which column we dropped over.
    // `over.id` is either a column status string or an application id.
    let newStatus: string;
    const isColumnId = CANONICAL_STATUSES.includes(over.id as typeof CANONICAL_STATUSES[number]);
    if (isColumnId) {
      newStatus = over.id as string;
    } else {
      // Dropped over another card — find that card's status
      const overApp = applications.find((a) => a.id === over.id);
      if (!overApp) return;
      newStatus = overApp.status;
    }

    const app = applications.find((a) => a.id === appId);
    if (!app || app.status === newStatus) return;

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)),
    );

    // Persist
    const res = await fetch(`/api/applications/${appId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) {
      // Revert on failure
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: app.status } : a)),
      );
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              applications={col.applications}
              onCardClick={setSelectedApp}
            />
          ))}
        </div>

        <DragOverlay>
          {activeApp ? (
            <div className="w-72">
              <ApplicationCard
                application={activeApp}
                onClick={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ApplicationDetail
        application={selectedApp}
        open={selectedApp !== null}
        onClose={() => setSelectedApp(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/applications/kanban-board.tsx
git commit -m "feat: kanban board with drag-and-drop between status columns"
```

---

## Task 12: Applications Page

**Files:**
- Modify: `career-ops-web/app/(app)/applications/page.tsx`

- [ ] **Step 1: Replace the placeholder with the full kanban page**

Write file `career-ops-web/app/(app)/applications/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/db/queries/applications";
import { KanbanBoard } from "@/components/applications/kanban-board";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const applications = await listApplications(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Applications</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {applications.length} application{applications.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
      </div>
      <KanbanBoard applications={applications} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add app/\(app\)/applications/page.tsx
git commit -m "feat: applications page with kanban board"
```

---

## Task 13: Pipeline Components

**Files:**
- Create: `career-ops-web/components/pipeline/pipeline-status-badge.tsx`
- Create: `career-ops-web/components/pipeline/add-url-form.tsx`
- Create: `career-ops-web/components/pipeline/url-list.tsx`

- [ ] **Step 1: Create the status badge**

Write file `career-ops-web/components/pipeline/pipeline-status-badge.tsx`:

```tsx
const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-600 border-red-200",
};

interface PipelineStatusBadgeProps {
  status: string;
}

export function PipelineStatusBadge({ status }: PipelineStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${
        statusStyles[status] ?? statusStyles.pending
      }`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Create the add URL form**

Write file `career-ops-web/components/pipeline/add-url-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@heroicons/react/24/outline";

export function AddUrlForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const urls = input
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http"));

    if (urls.length === 0) {
      setError("Please enter at least one valid URL (starting with http)");
      return;
    }

    setSubmitting(true);

    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add URLs");
      return;
    }

    setInput("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface">
      <label
        htmlFor="pipeline-urls"
        className="block text-sm font-medium text-neutral-800 mb-2"
      >
        Add URLs to pipeline
      </label>
      <div className="flex gap-2">
        <input
          id="pipeline-urls"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste one or more URLs (comma or newline separated)"
          className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-400"
        />
        <Button type="submit" disabled={submitting} size="sm">
          <PlusIcon className="h-4 w-4 mr-1" />
          {submitting ? "Adding..." : "Add"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Create the URL list**

Write file `career-ops-web/components/pipeline/url-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PipelineStatusBadge } from "./pipeline-status-badge";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { PipelineRow } from "@/lib/db/queries/pipeline";

interface UrlListProps {
  entries: PipelineRow[];
}

export function UrlList({ entries }: UrlListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
    setDeletingId(null);
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="card-surface text-center py-12">
        <p className="text-sm text-neutral-500">
          No URLs in pipeline. Paste a job URL above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              URL
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Company
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Added
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
            >
              <td className="px-4 py-2.5">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate block max-w-[300px]"
                >
                  {entry.url}
                </a>
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {entry.company ?? "—"}
              </td>
              <td className="px-4 py-2.5">
                <PipelineStatusBadge status={entry.status} />
              </td>
              <td className="px-4 py-2.5 text-neutral-400">
                {new Date(entry.addedAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add components/pipeline/
git commit -m "feat: pipeline components (status badge, add URL form, URL list)"
```

---

## Task 14: Pipeline Page

**Files:**
- Modify: `career-ops-web/app/(app)/pipeline/page.tsx`

- [ ] **Step 1: Replace the placeholder with the full pipeline page**

Write file `career-ops-web/app/(app)/pipeline/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listPipelineEntries } from "@/lib/db/queries/pipeline";
import { AddUrlForm } from "@/components/pipeline/add-url-form";
import { UrlList } from "@/components/pipeline/url-list";

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entries = await listPipelineEntries(user.id);

  const pending = entries.filter((e) => e.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Pipeline</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {entries.length} URL{entries.length !== 1 ? "s" : ""} total
          {pending > 0 && ` · ${pending} pending evaluation`}
        </p>
      </div>

      <AddUrlForm />
      <UrlList entries={entries} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add app/\(app\)/pipeline/page.tsx
git commit -m "feat: pipeline page with URL inbox and add form"
```

---

## Task 15: Report Block Renderer

**Files:**
- Create: `career-ops-web/components/reports/block-renderer.tsx`

- [ ] **Step 1: Create the block renderer**

This component renders a single A-G evaluation block from the JSONB data stored in reports.

Write file `career-ops-web/components/reports/block-renderer.tsx`:

```tsx
import ReactMarkdown from "react-markdown";

interface BlockRendererProps {
  label: string;
  blockKey: string;
  data: unknown;
}

export function BlockRenderer({ label, blockKey, data }: BlockRendererProps) {
  if (!data) return null;

  // The block data can be:
  // 1. A string (raw markdown)
  // 2. An object with structured fields (title, content, items, etc.)

  let content: string;

  if (typeof data === "string") {
    content = data;
  } else if (typeof data === "object" && data !== null) {
    // Try to extract meaningful content from the object
    const obj = data as Record<string, unknown>;
    if (typeof obj.content === "string") {
      content = obj.content;
    } else if (typeof obj.markdown === "string") {
      content = obj.markdown;
    } else {
      // Fallback: render as formatted JSON-ish markdown
      content = Object.entries(obj)
        .map(([key, value]) => {
          if (typeof value === "string") return `**${key}:** ${value}`;
          if (Array.isArray(value)) return `**${key}:**\n${value.map((v) => `- ${v}`).join("\n")}`;
          return `**${key}:** ${JSON.stringify(value)}`;
        })
        .join("\n\n");
    }
  } else {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-neutral-100 text-xs font-bold text-neutral-500">
          {blockKey.replace("block", "").toUpperCase()}
        </span>
        {label}
      </h3>
      <div className="prose prose-sm prose-neutral max-w-none text-neutral-600 [&_p]:mb-2 [&_li]:mb-1">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/reports/block-renderer.tsx
git commit -m "feat: report block renderer for A-G evaluation sections"
```

---

## Task 16: Report Reader Component

**Files:**
- Create: `career-ops-web/components/reports/report-reader.tsx`

- [ ] **Step 1: Create the report reader**

Write file `career-ops-web/components/reports/report-reader.tsx`:

```tsx
import { scoreColor, scoreBgColor, scoreLabel } from "@/lib/utils/scoring";
import { BlockRenderer } from "./block-renderer";
import type { ReportRow } from "@/lib/db/queries/reports";

const BLOCKS = [
  { key: "blockA", label: "Role Analysis" },
  { key: "blockB", label: "Company Assessment" },
  { key: "blockC", label: "CV Match & Keywords" },
  { key: "blockD", label: "Compensation Analysis" },
  { key: "blockE", label: "Red Flags & Deal Breakers" },
  { key: "blockF", label: "Interview Preparation" },
  { key: "blockG", label: "Posting Legitimacy" },
] as const;

interface ReportReaderProps {
  report: ReportRow;
}

export function ReportReader({ report }: ReportReaderProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">
              Report #{report.number} — {report.companySlug}
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">{report.date}</p>
            {report.jdUrl && (
              <a
                href={report.jdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-1 inline-block"
              >
                View original posting
              </a>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {report.overallScore && (
              <span
                className={`text-xl font-bold px-3 py-1 rounded-lg ${scoreColor(report.overallScore)} ${scoreBgColor(report.overallScore)}`}
              >
                {report.overallScore}/5
              </span>
            )}
            {report.overallScore && (
              <span className="text-xs text-neutral-500">
                {scoreLabel(report.overallScore)}
              </span>
            )}
            {report.legitimacyTier && (
              <span className="text-xs text-neutral-400">
                Legitimacy: {report.legitimacyTier}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="card-surface space-y-6">
        {BLOCKS.map(({ key, label }) => {
          const data = report[key as keyof ReportRow];
          return (
            <BlockRenderer
              key={key}
              blockKey={key}
              label={label}
              data={data}
            />
          );
        })}
      </div>

      {/* Full markdown fallback */}
      {report.fullMarkdown && !report.blockA && (
        <div className="card-surface">
          <h3 className="text-sm font-semibold text-neutral-800 mb-3">
            Full Report
          </h3>
          <div className="prose prose-sm prose-neutral max-w-none">
            <pre className="whitespace-pre-wrap text-xs text-neutral-600">
              {report.fullMarkdown}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/reports/report-reader.tsx
git commit -m "feat: report reader with score header and A-G block rendering"
```

---

## Task 17: Report List Component

**Files:**
- Create: `career-ops-web/components/reports/report-list.tsx`

- [ ] **Step 1: Create the report list**

Write file `career-ops-web/components/reports/report-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { scoreColor, scoreBgColor } from "@/lib/utils/scoring";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ReportListItem } from "@/lib/db/queries/reports";

interface ReportListProps {
  reports: ReportListItem[];
  activeId?: string;
}

export function ReportList({ reports, activeId }: ReportListProps) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? reports.filter(
        (r) =>
          r.companySlug.toLowerCase().includes(search.toLowerCase()) ||
          r.company?.toLowerCase().includes(search.toLowerCase()) ||
          r.role?.toLowerCase().includes(search.toLowerCase()),
      )
    : reports;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-400"
        />
      </div>

      {/* List */}
      <div className="space-y-1 overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">
            {search ? "No matching reports" : "No reports yet"}
          </p>
        ) : (
          filtered.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className={cn(
                "block px-3 py-2.5 rounded-lg transition-colors",
                report.id === activeId
                  ? "bg-neutral-100"
                  : "hover:bg-neutral-50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">
                    #{report.number} — {report.company ?? report.companySlug}
                  </p>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {report.role ?? "—"} · {report.date}
                  </p>
                </div>
                {report.overallScore && (
                  <span
                    className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(report.overallScore)} ${scoreBgColor(report.overallScore)}`}
                  >
                    {report.overallScore}
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add components/reports/report-list.tsx
git commit -m "feat: searchable report list component"
```

---

## Task 18: Reports Page (List + Reader)

**Files:**
- Modify: `career-ops-web/app/(app)/reports/page.tsx`
- Create: `career-ops-web/app/(app)/reports/[id]/page.tsx`

- [ ] **Step 1: Create the reports index page**

Write file `career-ops-web/app/(app)/reports/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listReports } from "@/lib/db/queries/reports";
import { ReportList } from "@/components/reports/report-list";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { reports } = await listReports(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {reports.length} evaluation report{reports.length !== 1 ? "s" : ""}
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="card-surface text-center py-12">
          <p className="text-sm text-neutral-500">
            No evaluation reports yet. Evaluate a job offer in Chat to create your
            first report.
          </p>
        </div>
      ) : (
        <div className="card-surface">
          <ReportList reports={reports} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the individual report page**

Write file `career-ops-web/app/(app)/reports/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getReport, listReports } from "@/lib/db/queries/reports";
import { ReportList } from "@/components/reports/report-list";
import { ReportReader } from "@/components/reports/report-reader";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const report = await getReport(id, user.id);
  if (!report) notFound();

  const { reports: allReports } = await listReports(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Viewing report #{report.number}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left: Report list */}
        <div className="hidden lg:block card-surface max-h-[calc(100vh-12rem)] overflow-hidden">
          <ReportList reports={allReports} activeId={id} />
        </div>

        {/* Right: Report reader */}
        <div>
          <ReportReader report={report} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add app/\(app\)/reports/
git commit -m "feat: reports page with list + reader layout"
```

---

## Task 19: Final Build Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd career-ops-web && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Verify all new files exist**

```bash
cd career-ops-web && find lib/db/queries components/applications components/pipeline components/reports app/api/applications app/api/pipeline app/api/reports -type f | sort
```

Expected: all 20+ files from this phase.

- [ ] **Step 3: Run git log to verify commit history**

```bash
cd career-ops-web && git log --oneline -20
```

Expected: clean commit history with all Phase 2 commits.

- [ ] **Step 4: Final commit if any unstaged changes remain**

```bash
cd career-ops-web && git status
```

If clean, no action needed. If files remain:

```bash
cd career-ops-web && git add -A && git commit -m "feat: Phase 2 complete — core data pages (applications, pipeline, reports)"
```
