# Career-Ops SaaS Web App — Design Spec
**Date:** 2026-04-20  
**Status:** Approved  

---

## 1. Overview

A multi-tenant SaaS web application that brings the career-ops CLI pipeline into a browser. Any user can sign in with Google, complete a guided onboarding, then use AI-powered job evaluation, an applications tracker, and a pipeline inbox — all from the web.

The system calls the Anthropic API (Claude 3.5 Sonnet) directly for evaluations. Playwright-based portal scanning is deferred to a future worker; for MVP users paste JD URLs or text manually.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 14 (App Router) | Full-stack, server components, API routes |
| Auth | NextAuth.js v5 | Google OAuth, session management |
| Database | Supabase (PostgreSQL) | Free tier, Row Level Security, managed |
| ORM | Prisma | Type-safe queries, migrations |
| File storage | Supabase Storage | CV markdown, portals.yml per user |
| AI | Anthropic SDK + Vercel AI SDK | Streaming evaluations via Claude 3.5 Sonnet |
| UI | Tailwind CSS + shadcn/ui | Minimalist, professional, accessible |
| Forms | React Hook Form + Zod | Validation, type safety |
| Data fetching | TanStack Query | Caching, optimistic updates |
| Icons | Lucide React | Consistent icon set |
| Markdown | react-markdown + remark-gfm | Report rendering |
| YAML | js-yaml | portals.yml parsing/validation |
| Deployment | Vercel | Zero-config, Git-connected |

---

## 3. Database Schema (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())
  profile   Profile?
  applications Application[]
  reports   Report[]
  sessions  Session[]
}

model Profile {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName     String
  location     String
  targetRoles  String   // comma-separated
  seniority    String
  salaryMin    Int
  salaryMax    Int
  currency     String   @default("USD")
  superpower   String
  cvMarkdown   String   @db.Text
  portalsYaml  String   @db.Text
  includeKw    String   // comma-separated
  excludeKw    String   @default("")
  onboardedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Application {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  num       Int
  date      DateTime @default(now())
  company   String
  role      String
  score     Float?
  status    String   @default("Evaluated")
  pdfUrl    String?
  notes     String?
  report    Report?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Report {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  applicationId String?     @unique
  application   Application? @relation(fields: [applicationId], references: [id])
  url           String?
  content       String      @db.Text
  legitimacy    String?
  createdAt     DateTime    @default(now())
}

// NextAuth required models
model Session { ... }
model Account { ... }
model VerificationToken { ... }
```

---

## 4. Pages & Routes

### Public
- `/` — Landing page with sign-in CTA and feature overview
- `/api/auth/[...nextauth]` — NextAuth handler

### Onboarding (auth required, redirect if already onboarded)
- `/onboarding` — 4-step wizard
  - Step 1: Profile (name, location, roles, seniority, salary, superpower)
  - Step 2: CV (paste markdown, upload file, or LinkedIn URL)
  - Step 3: Portals config (keywords, select template or upload YAML)
  - Step 4: Success screen

### App (auth + onboarded required)
- `/dashboard` — Metric cards + recent applications table
- `/applications` — Full sortable/filterable applications tracker
- `/pipeline` — Pending URL inbox; process individually or in bulk
- `/evaluate` — Paste JD URL or text → streaming AI evaluation → auto-saved report
- `/reports/[id]` — Markdown report viewer with score badge
- `/settings` — Edit profile, CV, portals.yml, regenerate API context

---

## 5. Onboarding Flow

4-step wizard with a shared top stepper (step dots + progress fill bar).

**Validation rules (enforced before advancing):**
- Step 1: fullName, location, targetRoles, seniority, salaryMin, salaryMax, superpower — all required. Inline red field highlight + error banner on failed submit attempt. Errors clear as user types.
- Step 2: CV content required (textarea or upload). Upload zone turns red if empty on advance.
- Step 3: includeKw required (at least one keyword). Default template pre-fills the field.
- Step 4: Success screen, no validation needed.

Users may not navigate forward by any means (URL, browser back/forward) without completing the current step's required fields.

---

## 6. Evaluate JD — AI Streaming

1. User pastes URL or JD text into `/evaluate`
2. POST to `/api/evaluate` with `{ url?, jdText, userId }`
3. API route:
   - Fetches URL content if provided (WebFetch)
   - Loads user's profile + CV from DB
   - Builds prompt from `modes/oferta.md` logic (adapted for API)
   - Streams response via Vercel AI SDK (`streamText`)
4. Frontend renders each block (A–G) progressively as tokens arrive
5. On stream complete: parse score + legitimacy → save Application + Report to DB → redirect to `/reports/[id]`

---

## 7. Applications Tracker (`/applications`)

- Full table: #, Date, Company, Role, Score, Status, PDF, Report link, Notes
- Sortable by any column
- Filterable by status (multi-select chips) and score range (slider)
- Inline status edit (click cell → dropdown of canonical statuses from `templates/states.yml`)
- CSV export button
- Canonical statuses: Evaluated · Applied · Responded · Interview · Offer · Rejected · Discarded · SKIP

---

## 8. Pipeline Inbox (`/pipeline`)

- Add URLs one at a time or paste a bulk list
- Each URL shown as a card: URL, Company (auto-detected), status badge
- "Evaluate" button per card → triggers `/api/evaluate` → redirects to report
- "Process all" button → queues them sequentially
- Marks items as done after evaluation

---

## 9. Settings (`/settings`)

Three tabs:
- **Profile** — edit all profile fields from onboarding Step 1
- **CV** — edit CV markdown in a code editor (Monaco or CodeMirror)
- **Portals** — edit portals.yml in a code editor with YAML validation

Changes saved via PUT `/api/profile`.

---

## 10. Auth & Data Isolation

- NextAuth v5 with Google provider
- Supabase Row Level Security: all tables scoped to `auth.uid()` = `userId`
- Middleware protects all `/dashboard`, `/applications`, `/pipeline`, `/evaluate`, `/reports`, `/settings` routes
- Unauthenticated → redirect to `/`
- Authenticated but not onboarded → redirect to `/onboarding`
- Authenticated and onboarded → allow through

---

## 11. Environment Variables

```
NEXTAUTH_SECRET
NEXTAUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DATABASE_URL           # Supabase connection string
DIRECT_URL             # Supabase direct URL (for Prisma migrations)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
```

---

## 12. Deployment

1. Push to GitHub repo (`career-ops-web`)
2. Connect to Vercel → auto-deploy on push to `main`
3. Set all env vars in Vercel dashboard
4. Run `prisma migrate deploy` via Vercel build command or manual migration step
5. Live at `https://career-ops-web.vercel.app` (or custom domain)

---

## 13. Out of Scope (MVP)

- Portal scanning with Playwright (deferred — needs a separate cron worker)
- PDF generation from the web app (deferred)
- LaTeX CV export (deferred)
- Billing / usage limits (deferred)
- Team/shared workspaces (deferred)
