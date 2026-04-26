# Career-Ops Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only Next.js 14 web UI at `career-ops/ui/` that replaces and extends the Go/Bubbletea TUI with 6 pages, live streaming of CLI operations, and a ⌘K command palette.

**Architecture:** Direct filesystem reads/writes via `CAREER_OPS_PATH` env var. Server Components for data fetching. SSE routes for streaming scan/batch output. Server Actions for mutations. No database.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Recharts, react-markdown, @hello-pangea/dnd (kanban drag), cmdk (command palette), Jest + Testing Library

---

## Sprint 1 — Foundation

### Task 1: Initialize Next.js project

**Files:**
- Create: `ui/` (Next.js app root)
- Create: `ui/.env.local`
- Create: `ui/vitest.config.ts`
- Create: `ui/vitest.setup.ts`

- [ ] **Step 1: Scaffold the app**

```bash
cd /path/to/career-ops
npx create-next-app@14 ui \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --use-npm
```

- [ ] **Step 2: Install additional dependencies**

```bash
cd ui
npm install \
  recharts \
  react-markdown \
  remark-gfm \
  @hello-pangea/dnd \
  cmdk \
  lucide-react \
  clsx \
  tailwind-merge \
  class-variance-authority \
  @radix-ui/react-slot \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-select

npm install -D \
  jest \
  jest-environment-jsdom \
  ts-jest \
  @types/jest \
  @testing-library/react \
  @testing-library/jest-dom \
  @types/node
```

- [ ] **Step 3: Install shadcn/ui base**

```bash
cd ui
npx shadcn-ui@latest init
# When prompted:
# Style: Default
# Base color: Stone
# CSS variables: yes
```

Then add components:
```bash
npx shadcn-ui@latest add button card badge table select dialog input separator scroll-area
```

- [ ] **Step 4: Create `.env.local`**

```bash
# ui/.env.local
CAREER_OPS_PATH=..
PORT=3001
```

- [ ] **Step 5: Create `jest.config.ts`**

```ts
// ui/jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default createJestConfig(config)
```

- [ ] **Step 6: Create `jest.setup.ts`**

```ts
// ui/jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 7: Add test script to `ui/package.json`**

```json
"scripts": {
  "dev": "next dev -p 3001",
  "build": "next build",
  "start": "next start -p 3001",
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
cd ui && npm run dev
# Expected: Ready on http://localhost:3001
```

- [ ] **Step 9: Commit**

```bash
cd ui && git add -A && cd .. && git add ui/ && git commit -m "feat(ui): scaffold Next.js 14 app with Tailwind + shadcn/ui"
```

---

### Task 2: Base layout — sidebar + page shell

**Files:**
- Create: `ui/app/globals.css` (extend default)
- Create: `ui/app/layout.tsx`
- Create: `ui/components/sidebar.tsx`

- [ ] **Step 1: Update `globals.css` with stone base tokens**

```css
/* ui/app/globals.css — replace entire file */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 98%;       /* stone-50 */
    --foreground: 20 14.3% 4.1%;  /* stone-950 */
    --card: 0 0% 100%;
    --card-foreground: 20 14.3% 4.1%;
    --border: 20 5.9% 90%;
    --input: 20 5.9% 90%;
    --ring: 20 14.3% 4.1%;
    --radius: 0.375rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-stone-50 text-stone-900 font-sans antialiased; }
}
```

- [ ] **Step 2: Create `components/sidebar.tsx`**

```tsx
// ui/components/sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import {
  LayoutDashboard, List, Kanban, FileText, Terminal, BarChart2,
} from 'lucide-react'

const NAV = [
  { href: '/',          label: 'Overview',  icon: LayoutDashboard },
  { href: '/pipeline',  label: 'Pipeline',  icon: List },
  { href: '/tracker',   label: 'Tracker',   icon: Kanban },
  { href: '/reports',   label: 'Reports',   icon: FileText },
  { href: '/actions',   label: 'Actions',   icon: Terminal },
  { href: '/patterns',  label: 'Patterns',  icon: BarChart2 },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-44 shrink-0 border-r border-stone-200 bg-white flex flex-col py-4 gap-1 px-2">
      <div className="px-2 mb-4">
        <span className="text-sm font-bold tracking-tight text-stone-900">career-ops</span>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors',
            pathname === href
              ? 'bg-stone-900 text-white'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
          )}
        >
          <Icon size={14} />
          {label}
        </Link>
      ))}
    </aside>
  )
}
```

- [ ] **Step 3: Create `app/layout.tsx`**

```tsx
// ui/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'career-ops',
  description: 'Job search command center',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Replace `app/page.tsx` with placeholder**

```tsx
// ui/app/page.tsx
export default function OverviewPage() {
  return <div className="text-stone-500 text-sm">Overview — coming in Sprint 4</div>
}
```

- [ ] **Step 5: Verify layout renders at localhost:3001**

```bash
npm run dev
# Open http://localhost:3001 — should see sidebar on left
```

- [ ] **Step 6: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add sidebar layout + stone theme"
```

---

### Task 3: ScoreBadge shared component

**Files:**
- Create: `ui/components/score-badge.tsx`
- Create: `ui/components/__tests__/score-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// ui/components/__tests__/score-badge.test.tsx
import { render, screen } from '@testing-library/react'
import { ScoreBadge } from '../score-badge'

test('renders green badge for score >= 4.0', () => {
  render(<ScoreBadge score={4.2} />)
  const badge = screen.getByText('4.2')
  expect(badge).toHaveClass('bg-emerald-100')
})

test('renders amber badge for 3.5-3.9', () => {
  render(<ScoreBadge score={3.7} />)
  expect(screen.getByText('3.7')).toHaveClass('bg-amber-100')
})

test('renders stone badge for score < 3.5', () => {
  render(<ScoreBadge score={3.0} />)
  expect(screen.getByText('3.0')).toHaveClass('bg-stone-100')
})

test('renders dash for null score', () => {
  render(<ScoreBadge score={null} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd ui && npm test -- score-badge
# Expected: FAIL — module not found
```

- [ ] **Step 3: Implement `components/score-badge.tsx`**

```tsx
// ui/components/score-badge.tsx
import { clsx } from 'clsx'

interface Props { score: number | null }

export function ScoreBadge({ score }: Props) {
  if (score === null) {
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-400">—</span>
  }
  const formatted = score.toFixed(1)
  return (
    <span className={clsx(
      'inline-block px-1.5 py-0.5 rounded text-xs font-semibold',
      score >= 4.0 ? 'bg-emerald-100 text-emerald-800' :
      score >= 3.5 ? 'bg-amber-100 text-amber-800' :
                     'bg-stone-100 text-stone-600',
    )}>
      {formatted}
    </span>
  )
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- score-badge
# Expected: 4 tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add ScoreBadge component"
```

---

## Sprint 2 — Data Parsers

### Task 4: `lib/paths.ts` + pipeline parser

**Files:**
- Create: `ui/lib/paths.ts`
- Create: `ui/lib/parsers/pipeline.ts`
- Create: `ui/lib/parsers/__tests__/pipeline.test.ts`

- [ ] **Step 1: Create `lib/paths.ts`**

```ts
// ui/lib/paths.ts
import path from 'path'

export function getCareerOpsPath(): string {
  const envPath = process.env.CAREER_OPS_PATH
  return envPath ? path.resolve(envPath) : path.resolve(process.cwd(), '..')
}

export function dataPath(filename: string): string {
  return path.join(getCareerOpsPath(), 'data', filename)
}

export function reportsPath(): string {
  return path.join(getCareerOpsPath(), 'reports')
}

export function batchPath(filename: string): string {
  return path.join(getCareerOpsPath(), 'batch', filename)
}
```

- [ ] **Step 2: Write failing test for pipeline parser**

```ts
// ui/lib/parsers/__tests__/pipeline.test.ts
import { parsePipeline } from '../pipeline'

const SAMPLE = `# Pipeline — Pending Evaluations

## Pendientes

- [ ] https://jobs.ashbyhq.com/langchain/abc | LangChain | Python OSS Engineer
- [x] https://jobs.ashbyhq.com/acme/xyz | Acme | Senior Backend Engineer
- [-] https://jobs.ashbyhq.com/foo/123 | Foo Inc | Product Manager
`

test('parses pending entries as done=false, skipped=false', () => {
  const entries = parsePipeline(SAMPLE)
  const pending = entries.find(e => e.company === 'LangChain')!
  expect(pending.done).toBe(false)
  expect(pending.skipped).toBe(false)
  expect(pending.url).toBe('https://jobs.ashbyhq.com/langchain/abc')
  expect(pending.role).toBe('Python OSS Engineer')
})

test('parses [x] entries as done=true', () => {
  const entries = parsePipeline(SAMPLE)
  const done = entries.find(e => e.company === 'Acme')!
  expect(done.done).toBe(true)
})

test('parses [-] entries as skipped=true', () => {
  const entries = parsePipeline(SAMPLE)
  const skipped = entries.find(e => e.company === 'Foo Inc')!
  expect(skipped.skipped).toBe(true)
})

test('returns empty array for empty content', () => {
  expect(parsePipeline('')).toEqual([])
})

test('infers source from URL domain', () => {
  const entries = parsePipeline(SAMPLE)
  expect(entries[0].source).toBe('ashby')
})
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npm test -- pipeline.test
# Expected: FAIL — module not found
```

- [ ] **Step 4: Implement `lib/parsers/pipeline.ts`**

```ts
// ui/lib/parsers/pipeline.ts
export interface PipelineEntry {
  url: string
  company: string
  role: string
  source: string
  done: boolean
  skipped: boolean
}

const LINE_RE = /^- \[( |x|-)\] (https?:\/\/\S+) \| ([^|]+) \| (.+)$/

function inferSource(url: string): string {
  if (url.includes('ashbyhq.com')) return 'ashby'
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) return 'greenhouse'
  if (url.includes('lever.co')) return 'lever'
  if (url.includes('linkedin.com')) return 'linkedin'
  return 'other'
}

export function parsePipeline(content: string): PipelineEntry[] {
  const entries: PipelineEntry[] = []
  for (const line of content.split('\n')) {
    const m = LINE_RE.exec(line.trim())
    if (!m) continue
    const [, state, url, company, role] = m
    entries.push({
      url: url.trim(),
      company: company.trim(),
      role: role.trim(),
      source: inferSource(url),
      done: state === 'x',
      skipped: state === '-',
    })
  }
  return entries
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
npm test -- pipeline.test
# Expected: 5 tests PASS
```

- [ ] **Step 6: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add paths + pipeline parser"
```

---

### Task 5: Applications parser

**Files:**
- Create: `ui/lib/parsers/applications.ts`
- Create: `ui/lib/parsers/__tests__/applications.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// ui/lib/parsers/__tests__/applications.test.ts
import { parseApplications } from '../applications'

const SAMPLE = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-04-26 | LangChain | Python OSS Engineer | 4.2/5 | Evaluated | ✅ | [001](reports/001-langchain-2026-04-26.md) | Strong match |
| 2 | 2026-04-27 | Acme | Backend Engineer | | Applied | ❌ | | |
`

test('parses score correctly', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[0].score).toBe(4.2)
})

test('parses null score for empty cell', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[1].score).toBeNull()
})

test('parses hasPDF from checkmark', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[0].hasPDF).toBe(true)
  expect(apps[1].hasPDF).toBe(false)
})

test('parses reportPath and reportNumber from markdown link', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[0].reportPath).toBe('reports/001-langchain-2026-04-26.md')
  expect(apps[0].reportNumber).toBe('001')
})

test('returns empty array for header-only content', () => {
  const headerOnly = `# Applications Tracker\n\n| # | Date | Company |\n|---|------|---------|`
  expect(parseApplications(headerOnly)).toEqual([])
})

test('parses all core fields', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[0].number).toBe(1)
  expect(apps[0].company).toBe('LangChain')
  expect(apps[0].role).toBe('Python OSS Engineer')
  expect(apps[0].status).toBe('Evaluated')
  expect(apps[0].date).toBe('2026-04-26')
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- applications.test
```

- [ ] **Step 3: Implement `lib/parsers/applications.ts`**

```ts
// ui/lib/parsers/applications.ts
export interface Application {
  number: number
  date: string
  company: string
  role: string
  score: number | null
  status: string
  hasPDF: boolean
  reportPath: string | null
  reportNumber: string | null
  notes: string
  jobUrl: string | null
}

const REPORT_LINK_RE = /\[(\d{3})\]\(([^)]+)\)/
const SCORE_RE = /^([\d.]+)\/5$/

function parseScore(cell: string): number | null {
  const m = SCORE_RE.exec(cell.trim())
  return m ? parseFloat(m[1]) : null
}

function parseReport(cell: string): { path: string | null; number: string | null } {
  const m = REPORT_LINK_RE.exec(cell.trim())
  if (!m) return { path: null, number: null }
  return { path: m[2], number: m[1] }
}

function isTableRow(line: string): boolean {
  return line.startsWith('|') && !line.match(/^[\s|:-]+$/)
}

function splitRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(c => c.trim())
}

export function parseApplications(content: string): Application[] {
  const lines = content.split('\n').filter(isTableRow)
  // First matching line is the header row — skip it and the separator
  const dataLines = lines.filter(l => !l.includes('---') && !/^\|\s*#/.test(l))
  return dataLines.map(line => {
    const [num, date, company, role, score, status, pdf, report, ...noteParts] = splitRow(line)
    const { path: reportPath, number: reportNumber } = parseReport(report ?? '')
    return {
      number: parseInt(num, 10),
      date,
      company,
      role,
      score: parseScore(score ?? ''),
      status,
      hasPDF: pdf?.includes('✅') ?? false,
      reportPath,
      reportNumber,
      notes: noteParts.join('|').trim(),
      jobUrl: null,
    }
  }).filter(a => !isNaN(a.number))
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- applications.test
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add applications parser"
```

---

### Task 6: Report parser

**Files:**
- Create: `ui/lib/parsers/report.ts`
- Create: `ui/lib/parsers/__tests__/report.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// ui/lib/parsers/__tests__/report.test.ts
import { parseReport } from '../report'

const SAMPLE = `# Evaluación: LangChain — Python OSS Engineer

**Fecha:** 2026-04-26
**Arquetipo:** AI Platform / LLMOps Engineer
**Score:** 4.2/5
**Legitimacy:** High Confidence
**URL:** https://jobs.ashbyhq.com/langchain/abc
**PDF:** output/001-langchain.pdf

---

## A) Resumen del Rol

Great role for an OSS engineer.

## B) Match con CV

Strong fit on Python and LangChain experience.
`

test('parses company and role from heading', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.company).toBe('LangChain')
  expect(r.role).toBe('Python OSS Engineer')
})

test('parses score as number', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.score).toBe(4.2)
})

test('parses metadata fields', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.archetype).toBe('AI Platform / LLMOps Engineer')
  expect(r.legitimacy).toBe('High Confidence')
  expect(r.date).toBe('2026-04-26')
  expect(r.jobUrl).toBe('https://jobs.ashbyhq.com/langchain/abc')
})

test('extracts section blocks keyed by letter', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.sections['A']).toContain('Great role for an OSS engineer.')
  expect(r.sections['B']).toContain('Strong fit on Python')
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- report.test
```

- [ ] **Step 3: Implement `lib/parsers/report.ts`**

```ts
// ui/lib/parsers/report.ts
export interface Report {
  number: string
  company: string
  role: string
  date: string
  archetype: string
  score: number | null
  legitimacy: string
  jobUrl: string | null
  pdfPath: string | null
  sections: Record<string, string>
  rawContent: string
}

const HEADING_RE = /^#\s+Evaluaci[oó]n:\s+(.+?)\s+[—–]\s+(.+)$/m
const META_RE = (key: string) => new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, 'm')
const SECTION_RE = /^##\s+([A-G])\)/m

function extractMeta(content: string, key: string): string {
  const m = META_RE(key).exec(content)
  return m ? m[1].trim() : ''
}

export function parseReport(number: string, content: string): Report {
  const headingMatch = HEADING_RE.exec(content)
  const company = headingMatch?.[1]?.trim() ?? ''
  const role = headingMatch?.[2]?.trim() ?? ''

  const scoreRaw = extractMeta(content, 'Score')
  const scoreMatch = /^([\d.]+)\/5$/.exec(scoreRaw)

  // Split into sections by ## A), ## B), etc.
  const sections: Record<string, string> = {}
  const parts = content.split(/^##\s+/m)
  for (const part of parts) {
    const m = /^([A-G])\)/.exec(part)
    if (m) sections[m[1]] = part.replace(/^[A-G]\)[^\n]*\n/, '').trim()
  }

  return {
    number,
    company,
    role,
    date: extractMeta(content, 'Fecha'),
    archetype: extractMeta(content, 'Arquetipo'),
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    legitimacy: extractMeta(content, 'Legitimacy'),
    jobUrl: extractMeta(content, 'URL') || null,
    pdfPath: extractMeta(content, 'PDF') || null,
    sections,
    rawContent: content,
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- report.test
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add report parser"
```

---

### Task 7: Scan-history parser

**Files:**
- Create: `ui/lib/parsers/scan-history.ts`
- Create: `ui/lib/parsers/__tests__/scan-history.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// ui/lib/parsers/__tests__/scan-history.test.ts
import { parseScanHistory } from '../scan-history'

const SAMPLE = `url\tfirst_seen\tportal\ttitle\tcompany\tstatus
https://jobs.ashbyhq.com/langchain/abc\t2026-04-26\tashby-api\tPython OSS Engineer\tLangChain\tadded
https://jobs.ashbyhq.com/acme/xyz\t2026-04-27\tashby-api\tSenior Backend\tAcme\tskipped_title
`

test('parses TSV rows into ScanEntry objects', () => {
  const entries = parseScanHistory(SAMPLE)
  expect(entries).toHaveLength(2)
})

test('parses all fields correctly', () => {
  const [first] = parseScanHistory(SAMPLE)
  expect(first.url).toBe('https://jobs.ashbyhq.com/langchain/abc')
  expect(first.firstSeen).toBe('2026-04-26')
  expect(first.portal).toBe('ashby-api')
  expect(first.title).toBe('Python OSS Engineer')
  expect(first.company).toBe('LangChain')
  expect(first.status).toBe('added')
})

test('returns empty array for header-only content', () => {
  const headerOnly = `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n`
  expect(parseScanHistory(headerOnly)).toEqual([])
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- scan-history.test
```

- [ ] **Step 3: Implement `lib/parsers/scan-history.ts`**

```ts
// ui/lib/parsers/scan-history.ts
export interface ScanEntry {
  url: string
  firstSeen: string
  portal: string
  title: string
  company: string
  status: 'added' | 'skipped_title' | 'skipped_dup' | string
}

export function parseScanHistory(content: string): ScanEntry[] {
  const lines = content.trim().split('\n')
  // Skip header line
  return lines.slice(1).filter(Boolean).map(line => {
    const [url, firstSeen, portal, title, company, status] = line.split('\t')
    return { url, firstSeen, portal, title, company, status }
  })
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- scan-history.test
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add scan-history parser"
```

---

## Sprint 3 — Mutations

### Task 8: Status mutation

**Files:**
- Create: `ui/lib/mutations/status.ts`
- Create: `ui/lib/mutations/__tests__/status.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// ui/lib/mutations/__tests__/status.test.ts
import { updateApplicationStatus } from '../status'

const SAMPLE_MD = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-04-26 | LangChain | Python OSS Engineer | 4.2/5 | Evaluated | ✅ | [001](reports/001-langchain-2026-04-26.md) | |
| 2 | 2026-04-27 | Acme | Backend | 3.8/5 | Evaluated | ❌ | | |
`

test('updates status for matching row number', () => {
  const result = updateApplicationStatus(SAMPLE_MD, 1, 'Applied')
  expect(result).toContain('| Applied |')
  expect(result).not.toContain('| Evaluated |')
})

test('leaves other rows unchanged', () => {
  const result = updateApplicationStatus(SAMPLE_MD, 1, 'Applied')
  const lines = result.split('\n')
  const row2 = lines.find(l => l.includes('| 2 |'))
  expect(row2).toContain('Evaluated')
})

test('throws if row number not found', () => {
  expect(() => updateApplicationStatus(SAMPLE_MD, 99, 'Applied')).toThrow()
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- status.test
```

- [ ] **Step 3: Implement `lib/mutations/status.ts`**

```ts
// ui/lib/mutations/status.ts
import fs from 'fs'
import { dataPath } from '@/lib/paths'

export function updateApplicationStatus(content: string, rowNumber: number, newStatus: string): string {
  const lines = content.split('\n')
  let found = false
  const updated = lines.map(line => {
    // Match table rows starting with | {number} |
    const rowMatch = /^\|\s*(\d+)\s*\|/.exec(line)
    if (!rowMatch || parseInt(rowMatch[1], 10) !== rowNumber) return line
    found = true
    // Replace the Status column (6th pipe-delimited cell)
    const cells = line.split('|')
    // cells[0] = '', cells[1] = #, cells[2] = date, cells[3] = company,
    // cells[4] = role, cells[5] = score, cells[6] = status, cells[7] = pdf, ...
    cells[6] = ` ${newStatus} `
    return cells.join('|')
  })
  if (!found) throw new Error(`Row ${rowNumber} not found in applications.md`)
  return updated.join('\n')
}

export async function writeApplicationStatus(rowNumber: number, newStatus: string): Promise<void> {
  const filePath = dataPath('applications.md')
  const content = fs.readFileSync(filePath, 'utf-8')
  const updated = updateApplicationStatus(content, rowNumber, newStatus)
  fs.writeFileSync(filePath, updated, 'utf-8')
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- status.test
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add status mutation"
```

---

### Task 9: Pipeline mutation + process spawner

**Files:**
- Create: `ui/lib/mutations/pipeline.ts`
- Create: `ui/lib/mutations/process.ts`
- Create: `ui/lib/mutations/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write failing test for pipeline mutation**

```ts
// ui/lib/mutations/__tests__/pipeline.test.ts
import { markPipelineEntry } from '../pipeline'

const SAMPLE = `# Pipeline\n\n## Pendientes\n\n- [ ] https://jobs.ashbyhq.com/langchain/abc | LangChain | Python OSS Engineer\n- [ ] https://jobs.ashbyhq.com/acme/xyz | Acme | Backend\n`

test('marks entry as done with [x]', () => {
  const result = markPipelineEntry(SAMPLE, 'https://jobs.ashbyhq.com/langchain/abc', 'done')
  expect(result).toContain('- [x] https://jobs.ashbyhq.com/langchain/abc')
})

test('marks entry as skipped with [-]', () => {
  const result = markPipelineEntry(SAMPLE, 'https://jobs.ashbyhq.com/langchain/abc', 'skip')
  expect(result).toContain('- [-] https://jobs.ashbyhq.com/langchain/abc')
})

test('leaves other entries unchanged', () => {
  const result = markPipelineEntry(SAMPLE, 'https://jobs.ashbyhq.com/langchain/abc', 'done')
  expect(result).toContain('- [ ] https://jobs.ashbyhq.com/acme/xyz')
})

test('throws if URL not found', () => {
  expect(() => markPipelineEntry(SAMPLE, 'https://missing.com', 'done')).toThrow()
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- pipeline.test
```

- [ ] **Step 3: Implement `lib/mutations/pipeline.ts`**

```ts
// ui/lib/mutations/pipeline.ts
import fs from 'fs'
import { dataPath } from '@/lib/paths'

export function markPipelineEntry(content: string, url: string, action: 'done' | 'skip'): string {
  const marker = action === 'done' ? 'x' : '-'
  let found = false
  const updated = content.split('\n').map(line => {
    if (!line.includes(url)) return line
    if (!/^- \[[ x-]\]/.test(line.trim())) return line
    found = true
    return line.replace(/^(\s*- )\[[ x-]\]/, `$1[${marker}]`)
  }).join('\n')
  if (!found) throw new Error(`URL not found in pipeline.md: ${url}`)
  return updated
}

export async function writePipelineEntry(url: string, action: 'done' | 'skip'): Promise<void> {
  const filePath = dataPath('pipeline.md')
  const content = fs.readFileSync(filePath, 'utf-8')
  const updated = markPipelineEntry(content, url, action)
  fs.writeFileSync(filePath, updated, 'utf-8')
}
```

- [ ] **Step 4: Implement `lib/mutations/process.ts`**

```ts
// ui/lib/mutations/process.ts
import { spawn, ChildProcess } from 'child_process'
import { getCareerOpsPath } from '@/lib/paths'

export interface SpawnResult {
  process: ChildProcess
  kill: () => void
}

export function spawnCareerOpsCommand(
  command: string,
  args: string[],
  onData: (line: string) => void,
  onDone: (code: number | null) => void,
): SpawnResult {
  const cwd = getCareerOpsPath()
  const child = spawn(command, args, { cwd, shell: false })

  const handleData = (chunk: Buffer) => {
    chunk.toString().split('\n').filter(Boolean).forEach(onData)
  }

  child.stdout.on('data', handleData)
  child.stderr.on('data', handleData)
  child.on('close', onDone)

  return {
    process: child,
    kill: () => child.kill('SIGTERM'),
  }
}
```

- [ ] **Step 5: Run pipeline tests — expect PASS**

```bash
npm test -- pipeline.test
```

- [ ] **Step 6: Commit**

```bash
git add ui/ && git commit -m "feat(ui): add pipeline mutation + process spawner"
```

---

## Sprint 4 — Overview Page

### Task 10: Overview page data + KPI cards

**Files:**
- Create: `ui/components/kpi-card.tsx`
- Create: `ui/components/score-funnel.tsx`
- Modify: `ui/app/page.tsx`

- [ ] **Step 1: Create `components/kpi-card.tsx`**

```tsx
// ui/components/kpi-card.tsx
interface Props {
  label: string
  value: number | string
  description?: string
}

export function KpiCard({ label, value, description }: Props) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold text-stone-900">{value}</div>
      {description && <div className="text-xs text-stone-400 mt-1">{description}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/score-funnel.tsx`**

```tsx
// ui/components/score-funnel.tsx
interface Props {
  high: number   // >= 4.0
  mid: number    // 3.5-3.9
  low: number    // < 3.5
}

export function ScoreFunnel({ high, mid, low }: Props) {
  const total = high + mid + low || 1
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">Score distribution</div>
      <div className="space-y-2">
        {[
          { label: '≥ 4.0', count: high, color: 'bg-emerald-500' },
          { label: '3.5–3.9', count: mid, color: 'bg-amber-400' },
          { label: '< 3.5', count: low, color: 'bg-stone-300' },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-16 text-xs text-stone-500 text-right">{label}</div>
            <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${(count / total) * 100}%` }} />
            </div>
            <div className="w-8 text-xs text-stone-500">{count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build the Overview page**

```tsx
// ui/app/page.tsx
import fs from 'fs'
import Link from 'next/link'
import { dataPath } from '@/lib/paths'
import { parseApplications } from '@/lib/parsers/applications'
import { parsePipeline } from '@/lib/parsers/pipeline'
import { KpiCard } from '@/components/kpi-card'
import { ScoreFunnel } from '@/components/score-funnel'
import { ScoreBadge } from '@/components/score-badge'

export const dynamic = 'force-dynamic'

export default function OverviewPage() {
  const appsContent = fs.existsSync(dataPath('applications.md'))
    ? fs.readFileSync(dataPath('applications.md'), 'utf-8')
    : ''
  const pipelineContent = fs.existsSync(dataPath('pipeline.md'))
    ? fs.readFileSync(dataPath('pipeline.md'), 'utf-8')
    : ''

  const apps = parseApplications(appsContent)
  const pipeline = parsePipeline(pipelineContent)

  const pending = pipeline.filter(e => !e.done && !e.skipped).length
  const evaluated = apps.length
  const applied = apps.filter(a => ['Applied','Interview','Offer','Responded'].includes(a.status)).length
  const interviews = apps.filter(a => ['Interview','Offer'].includes(a.status)).length

  const high = apps.filter(a => a.score !== null && a.score >= 4.0).length
  const mid = apps.filter(a => a.score !== null && a.score >= 3.5 && a.score < 4.0).length
  const low = apps.filter(a => a.score !== null && a.score < 3.5).length

  const recent = [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Overview</h1>
        <p className="text-sm text-stone-400 mt-0.5">Job search at a glance</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Pipeline" value={pending} description="pending evaluation" />
        <KpiCard label="Evaluated" value={evaluated} description="reports written" />
        <KpiCard label="Applied" value={applied} description="applications sent" />
        <KpiCard label="Interviews" value={interviews} description="active processes" />
      </div>

      {evaluated > 0 && <ScoreFunnel high={high} mid={mid} low={low} />}

      <div className="bg-white border border-stone-200 rounded-lg">
        <div className="px-4 py-3 border-b border-stone-100">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Recent evaluations</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">No evaluations yet — run a batch to get started.</div>
        ) : (
          <div className="divide-y divide-stone-50">
            {recent.map(app => (
              <div key={app.number} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-stone-300 w-8">{String(app.number).padStart(3,'0')}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-stone-800">{app.company}</span>
                  <span className="text-xs text-stone-400 ml-2">{app.role}</span>
                </div>
                <ScoreBadge score={app.score} />
                <span className="text-xs text-stone-300">{app.date}</span>
                {app.reportNumber && (
                  <Link href={`/reports/${app.reportNumber}`} className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2">
                    report
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Link href="/actions" className="px-3 py-1.5 bg-stone-900 text-white text-xs font-medium rounded hover:bg-stone-700 transition-colors">
          Run Scan
        </Link>
        <Link href="/actions" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50 transition-colors">
          Start Batch Eval
        </Link>
        <Link href="/pipeline" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50 transition-colors">
          View Pipeline
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify overview page loads**

```bash
npm run dev
# Open http://localhost:3001 — KPI cards, funnel, recent table visible
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): overview page with KPIs + score funnel"
```

---

## Sprint 5 — Pipeline Page

### Task 11: Pipeline page with filter + bulk actions

**Files:**
- Create: `ui/app/pipeline/page.tsx`
- Create: `ui/components/pipeline-table.tsx`
- Create: `ui/app/api/pipeline/route.ts` (PATCH for mark done/skip)

- [ ] **Step 1: Create PATCH API route**

```ts
// ui/app/api/pipeline/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { dataPath } from '@/lib/paths'
import { markPipelineEntry } from '@/lib/mutations/pipeline'

export async function PATCH(req: NextRequest) {
  const { url, action } = await req.json() as { url: string; action: 'done' | 'skip' }
  if (!url || !['done', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  try {
    const filePath = dataPath('pipeline.md')
    const content = fs.readFileSync(filePath, 'utf-8')
    const updated = markPipelineEntry(content, url, action)
    fs.writeFileSync(filePath, updated, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `components/pipeline-table.tsx` (client component)**

```tsx
// ui/components/pipeline-table.tsx
'use client'
import { useState, useTransition } from 'react'
import type { PipelineEntry } from '@/lib/parsers/pipeline'

interface Props { entries: PipelineEntry[] }

export function PipelineTable({ entries }: Props) {
  const [filter, setFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localState, setLocalState] = useState<Record<string, 'done' | 'skip'>>({})
  const [, startTransition] = useTransition()

  const sources = ['all', ...Array.from(new Set(entries.map(e => e.source))).sort()]

  const visible = entries.filter(e => {
    if (localState[e.url]) return false
    if (e.done || e.skipped) return false
    if (filter && !`${e.company} ${e.role}`.toLowerCase().includes(filter.toLowerCase())) return false
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
    return true
  })

  async function markEntry(url: string, action: 'done' | 'skip') {
    setLocalState(s => ({ ...s, [url]: action }))
    await fetch('/api/pipeline', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, action }) })
  }

  async function bulkAction(action: 'done' | 'skip') {
    const urls = Array.from(selected)
    setSelected(new Set())
    await Promise.all(urls.map(url => markEntry(url, action)))
  }

  function toggleSelect(url: string) {
    setSelected(s => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Filter company or role…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-stone-400"
        />
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm focus:outline-none"
        >
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-stone-400">{visible.length} jobs</span>
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2 items-center py-2 px-3 bg-stone-900 text-white rounded text-xs">
          <span>{selected.size} selected</span>
          <button onClick={() => bulkAction('skip')} className="ml-auto px-2 py-1 bg-white/10 rounded hover:bg-white/20">Skip all</button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">Clear</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(visible.map(e => e.url)) : new Set())} /></th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Company</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Role</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Source</th>
              <th className="w-32 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {visible.map(entry => (
              <tr key={entry.url} className="hover:bg-stone-50/50">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(entry.url)} onChange={() => toggleSelect(entry.url)} />
                </td>
                <td className="px-3 py-2 font-medium text-stone-800">{entry.company}</td>
                <td className="px-3 py-2 text-stone-600">
                  <a href={entry.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{entry.role}</a>
                </td>
                <td className="px-3 py-2 text-xs text-stone-400">{entry.source}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => markEntry(entry.url, 'skip')} className="px-2 py-1 text-xs border border-stone-200 rounded hover:bg-stone-50">Skip</button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-stone-400">No pending jobs match your filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create pipeline page**

```tsx
// ui/app/pipeline/page.tsx
import fs from 'fs'
import { dataPath } from '@/lib/paths'
import { parsePipeline } from '@/lib/parsers/pipeline'
import { PipelineTable } from '@/components/pipeline-table'

export const dynamic = 'force-dynamic'

export default function PipelinePage() {
  const content = fs.existsSync(dataPath('pipeline.md'))
    ? fs.readFileSync(dataPath('pipeline.md'), 'utf-8')
    : ''
  const entries = parsePipeline(content)

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Pipeline</h1>
        <p className="text-sm text-stone-400 mt-0.5">Pending evaluations</p>
      </div>
      <PipelineTable entries={entries} />
    </div>
  )
}
```

- [ ] **Step 4: Verify pipeline page at `localhost:3001/pipeline`**

```bash
npm run dev
# Open http://localhost:3001/pipeline — table with 302 jobs visible and filterable
```

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): pipeline page with filter + skip action"
```

---

## Sprint 6 — Tracker Page

### Task 12: Tracker table view

**Files:**
- Create: `ui/app/tracker/page.tsx`
- Create: `ui/components/tracker-table.tsx`
- Create: `ui/app/api/applications/route.ts`

- [ ] **Step 1: Create status PATCH API**

```ts
// ui/app/api/applications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { dataPath } from '@/lib/paths'
import { updateApplicationStatus } from '@/lib/mutations/status'

export async function PATCH(req: NextRequest) {
  const { number, status } = await req.json() as { number: number; status: string }
  if (!number || !status) {
    return NextResponse.json({ error: 'number and status required' }, { status: 400 })
  }
  try {
    const filePath = dataPath('applications.md')
    const content = fs.readFileSync(filePath, 'utf-8')
    const updated = updateApplicationStatus(content, number, status)
    fs.writeFileSync(filePath, updated, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `components/tracker-table.tsx`**

```tsx
// ui/components/tracker-table.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Application } from '@/lib/parsers/applications'
import { ScoreBadge } from './score-badge'

const STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP']

interface Props { apps: Application[] }

export function TrackerTable({ apps }: Props) {
  const [localStatus, setLocalStatus] = useState<Record<number, string>>({})
  const [sortKey, setSortKey] = useState<'date' | 'score' | 'company'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...apps].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date') cmp = a.date.localeCompare(b.date)
    else if (sortKey === 'score') cmp = (a.score ?? 0) - (b.score ?? 0)
    else if (sortKey === 'company') cmp = a.company.localeCompare(b.company)
    return sortDir === 'asc' ? cmp : -cmp
  })

  async function handleStatusChange(app: Application, newStatus: string) {
    setLocalStatus(s => ({ ...s, [app.number]: newStatus }))
    await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: app.number, status: newStatus }),
    })
  }

  const Th = ({ label, sortable, k }: { label: string; sortable?: boolean; k?: typeof sortKey }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide ${sortable ? 'cursor-pointer hover:text-stone-800 select-none' : ''}`}
      onClick={() => sortable && k && toggleSort(k)}
    >
      {label}{sortable && k && sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <Th label="#" />
            <Th label="Date" sortable k="date" />
            <Th label="Company" sortable k="company" />
            <Th label="Role" />
            <Th label="Score" sortable k="score" />
            <Th label="Status" />
            <Th label="Report" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {sorted.map(app => {
            const status = localStatus[app.number] ?? app.status
            return (
              <tr key={app.number} className="hover:bg-stone-50/50">
                <td className="px-3 py-2 text-xs text-stone-300">{String(app.number).padStart(3,'0')}</td>
                <td className="px-3 py-2 text-xs text-stone-400">{app.date}</td>
                <td className="px-3 py-2 font-medium text-stone-800">{app.company}</td>
                <td className="px-3 py-2 text-stone-600 max-w-xs truncate">{app.role}</td>
                <td className="px-3 py-2"><ScoreBadge score={app.score} /></td>
                <td className="px-3 py-2">
                  <select
                    value={status}
                    onChange={e => handleStatusChange(app, e.target.value)}
                    className="text-xs border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {app.reportNumber
                    ? <Link href={`/reports/${app.reportNumber}`} className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2">#{app.reportNumber}</Link>
                    : <span className="text-xs text-stone-300">—</span>
                  }
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-stone-400">No applications yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/tracker/page.tsx`**

```tsx
// ui/app/tracker/page.tsx
import fs from 'fs'
import { dataPath } from '@/lib/paths'
import { parseApplications } from '@/lib/parsers/applications'
import { TrackerTable } from '@/components/tracker-table'

export const dynamic = 'force-dynamic'

export default function TrackerPage() {
  const content = fs.existsSync(dataPath('applications.md'))
    ? fs.readFileSync(dataPath('applications.md'), 'utf-8')
    : ''
  const apps = parseApplications(content)

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Tracker</h1>
        <p className="text-sm text-stone-400 mt-0.5">{apps.length} applications</p>
      </div>
      <TrackerTable apps={apps} />
    </div>
  )
}
```

- [ ] **Step 4: Verify tracker at `localhost:3001/tracker`**

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): tracker table with inline status updates"
```

---

## Sprint 7 — Report Viewer

### Task 13: Report viewer page

**Files:**
- Create: `ui/app/reports/page.tsx`
- Create: `ui/app/reports/[id]/page.tsx`
- Create: `ui/components/report-viewer.tsx`

- [ ] **Step 1: Create reports index**

```tsx
// ui/app/reports/page.tsx
import fs from 'fs'
import Link from 'next/link'
import { reportsPath } from '@/lib/paths'
import { ScoreBadge } from '@/components/score-badge'
import { parseReport } from '@/lib/parsers/report'

export const dynamic = 'force-dynamic'

export default function ReportsIndexPage() {
  const dir = reportsPath()
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
    : []

  const reports = files.map(filename => {
    const num = filename.split('-')[0]
    const content = fs.readFileSync(`${dir}/${filename}`, 'utf-8')
    const r = parseReport(num, content)
    return { ...r, filename }
  })

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Reports</h1>
        <p className="text-sm text-stone-400">{reports.length} evaluation reports</p>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-50">
        {reports.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-stone-400">No reports yet. Run a batch evaluation to generate reports.</div>
        )}
        {reports.map(r => (
          <Link key={r.number} href={`/reports/${r.number}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
            <span className="text-xs text-stone-300 w-8">#{r.number}</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-stone-800">{r.company}</span>
              <span className="text-stone-400 ml-2 text-sm">{r.role}</span>
            </div>
            <ScoreBadge score={r.score} />
            <span className="text-xs text-stone-300">{r.date}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/report-viewer.tsx`**

```tsx
// ui/components/report-viewer.tsx
'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Report } from '@/lib/parsers/report'
import { ScoreBadge } from './score-badge'

const BLOCK_LABELS: Record<string, string> = {
  A: 'Role Summary', B: 'CV Match', C: 'Proof Points',
  D: 'Questions', E: 'Flags', F: 'Recommendation', G: 'Legitimacy',
}

interface Props {
  report: Report
  prevId?: string
  nextId?: string
  onMarkApplied?: () => void
}

export function ReportViewer({ report, prevId, nextId, onMarkApplied }: Props) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">{report.company}</h1>
              <p className="text-stone-500 mt-0.5">{report.role}</p>
            </div>
            <ScoreBadge score={report.score} />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-stone-400">
            <span>{report.date}</span>
            {report.archetype && <span>{report.archetype}</span>}
            {report.legitimacy && <span className="capitalize">{report.legitimacy}</span>}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex gap-2 mb-6">
          {report.jobUrl && (
            <a href={report.jobUrl} target="_blank" rel="noopener noreferrer"
               className="px-3 py-1.5 text-xs border border-stone-200 rounded hover:bg-stone-50">
              Open Job URL ↗
            </a>
          )}
          {report.pdfPath && (
            <a href={`file://${report.pdfPath}`}
               className="px-3 py-1.5 text-xs border border-stone-200 rounded hover:bg-stone-50">
              Open PDF
            </a>
          )}
          {onMarkApplied && (
            <button onClick={onMarkApplied}
                    className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded hover:bg-stone-700">
              Mark Applied
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between text-xs text-stone-400 mb-6">
          {prevId ? <a href={`/reports/${prevId}`} className="hover:text-stone-700">← #{prevId}</a> : <span />}
          {nextId ? <a href={`/reports/${nextId}`} className="hover:text-stone-700">#{nextId} →</a> : <span />}
        </div>

        {/* Markdown content */}
        <div className="prose prose-stone prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.rawContent}</ReactMarkdown>
        </div>
      </div>

      {/* Score sidebar */}
      <div className="w-44 shrink-0 space-y-2">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Score breakdown</div>
        {Object.entries(BLOCK_LABELS).map(([key, label]) => (
          report.sections[key] ? (
            <div key={key} className="bg-white border border-stone-200 rounded p-2">
              <div className="text-xs font-semibold text-stone-700">{key}</div>
              <div className="text-xs text-stone-400 mt-0.5">{label}</div>
            </div>
          ) : null
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/reports/[id]/page.tsx`**

```tsx
// ui/app/reports/[id]/page.tsx
import fs from 'fs'
import { notFound } from 'next/navigation'
import { reportsPath } from '@/lib/paths'
import { parseReport } from '@/lib/parsers/report'
import { ReportViewer } from '@/components/report-viewer'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export default function ReportPage({ params }: Props) {
  const dir = reportsPath()
  if (!fs.existsSync(dir)) notFound()

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
  const filename = files.find(f => f.startsWith(params.id))
  if (!filename) notFound()

  const content = fs.readFileSync(`${dir}/${filename}`, 'utf-8')
  const report = parseReport(params.id, content)

  const idx = files.indexOf(filename)
  const prevFile = files[idx - 1]
  const nextFile = files[idx + 1]
  const prevId = prevFile?.split('-')[0]
  const nextId = nextFile?.split('-')[0]

  return (
    <div className="max-w-5xl">
      <ReportViewer report={report} prevId={prevId} nextId={nextId} />
    </div>
  )
}
```

- [ ] **Step 4: Add `@tailwindcss/typography` for prose styles**

```bash
cd ui && npm install -D @tailwindcss/typography
```

Add to `tailwind.config.ts`:
```ts
plugins: [require('@tailwindcss/typography')],
```

- [ ] **Step 5: Verify report pages at `localhost:3001/reports`**

- [ ] **Step 6: Commit**

```bash
git add ui/ && git commit -m "feat(ui): report viewer with markdown render + score sidebar"
```

---

## Sprint 8 — Actions Console

### Task 14: SSE routes for scan, batch, merge

**Files:**
- Create: `ui/app/api/stream/scan/route.ts`
- Create: `ui/app/api/stream/batch/route.ts`
- Create: `ui/app/api/stream/merge/route.ts`

- [ ] **Step 1: Create scan SSE route**

```ts
// ui/app/api/stream/scan/route.ts
import { spawnCareerOpsCommand } from '@/lib/mutations/process'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(line: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`))
      }

      const { kill } = spawnCareerOpsCommand(
        'node',
        ['scan.mjs'],
        send,
        (code) => {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ code })}\n\n`))
          controller.close()
        },
      )

      // Clean up if client disconnects
      return () => kill()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Create batch SSE route**

```ts
// ui/app/api/stream/batch/route.ts
import { NextRequest } from 'next/server'
import { spawnCareerOpsCommand } from '@/lib/mutations/process'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parallel = searchParams.get('parallel') ?? '2'
  const startFrom = searchParams.get('startFrom') ?? '0'
  const minScore = searchParams.get('minScore') ?? '0'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(line: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`))
      }

      const args = ['batch/batch-runner.sh', '--parallel', parallel, '--start-from', startFrom]
      if (parseFloat(minScore) > 0) args.push('--min-score', minScore)

      const { kill } = spawnCareerOpsCommand('bash', args, send, (code) => {
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ code })}\n\n`))
        controller.close()
      })

      return () => kill()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 3: Create merge SSE route**

```ts
// ui/app/api/stream/merge/route.ts
import { spawnCareerOpsCommand } from '@/lib/mutations/process'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(line: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`))
      }

      const { kill } = spawnCareerOpsCommand('node', ['merge-tracker.mjs'], send, (mergeCode) => {
        if (mergeCode !== 0) {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ code: mergeCode })}\n\n`))
          controller.close()
          return
        }
        spawnCareerOpsCommand('node', ['verify-pipeline.mjs'], send, (verifyCode) => {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ code: verifyCode })}\n\n`))
          controller.close()
        })
      })

      return () => kill()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): SSE routes for scan/batch/merge streaming"
```

---

### Task 15: Actions console page

**Files:**
- Create: `ui/components/action-console.tsx`
- Create: `ui/app/actions/page.tsx`

- [ ] **Step 1: Create `components/action-console.tsx`**

```tsx
// ui/components/action-console.tsx
'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  title: string
  description: string
  endpoint: string
  params?: Record<string, string>
  children?: React.ReactNode
}

export function ActionConsole({ title, description, endpoint, params = {}, children }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function start() {
    setLines([])
    setDone(null)
    setRunning(true)

    const qs = new URLSearchParams(params).toString()
    const url = qs ? `${endpoint}?${qs}` : endpoint
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      const { line } = JSON.parse(e.data)
      setLines(prev => [...prev, line])
    }
    es.addEventListener('done', (e) => {
      const { code } = JSON.parse((e as MessageEvent).data)
      setDone(code)
      setRunning(false)
      es.close()
    })
    es.onerror = () => {
      setRunning(false)
      es.close()
    }
  }

  function stop() {
    esRef.current?.close()
    setRunning(false)
  }

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <div className="font-semibold text-stone-800 text-sm">{title}</div>
          <div className="text-xs text-stone-400">{description}</div>
        </div>
        <div className="flex gap-2">
          {running
            ? <button onClick={stop} className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Stop</button>
            : <button onClick={start} className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded hover:bg-stone-700">Run</button>
          }
        </div>
      </div>

      {children && <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">{children}</div>}

      <div className="bg-stone-950 font-mono text-xs text-stone-300 h-40 overflow-y-auto p-3">
        {lines.length === 0 && !running && (
          <span className="text-stone-600">Ready — press Run to start</span>
        )}
        {lines.map((line, i) => <div key={i}>{line}</div>)}
        {done !== null && (
          <div className={`mt-2 ${done === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Process exited with code {done}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/actions/page.tsx`**

```tsx
// ui/app/actions/page.tsx
'use client'
import { useState } from 'react'
import { ActionConsole } from '@/components/action-console'

export default function ActionsPage() {
  const [parallel, setParallel] = useState('2')
  const [startFrom, setStartFrom] = useState('0')
  const [minScore, setMinScore] = useState('0')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Actions</h1>
        <p className="text-sm text-stone-400 mt-0.5">Trigger CLI operations and watch live output</p>
      </div>

      <ActionConsole
        title="Run Scan"
        description="Scan all configured portals for new job listings"
        endpoint="/api/stream/scan"
      />

      <ActionConsole
        title="Batch Evaluation"
        description="Evaluate pending pipeline jobs with AI"
        endpoint="/api/stream/batch"
        params={{ parallel, startFrom, minScore }}
      >
        <div className="flex gap-4 text-xs">
          <label className="flex items-center gap-1.5 text-stone-600">
            Workers
            <select value={parallel} onChange={e => setParallel(e.target.value)}
                    className="border border-stone-200 rounded px-1.5 py-0.5">
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-stone-600">
            Start from ID
            <input type="number" value={startFrom} onChange={e => setStartFrom(e.target.value)}
                   className="border border-stone-200 rounded px-1.5 py-0.5 w-16" />
          </label>
          <label className="flex items-center gap-1.5 text-stone-600">
            Min score
            <input type="number" step="0.1" value={minScore} onChange={e => setMinScore(e.target.value)}
                   className="border border-stone-200 rounded px-1.5 py-0.5 w-16" />
          </label>
        </div>
      </ActionConsole>

      <ActionConsole
        title="Merge Tracker"
        description="Merge tracker additions from batch output, then verify pipeline"
        endpoint="/api/stream/merge"
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify actions page at `localhost:3001/actions`**

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): actions console with SSE streaming"
```

---

## Sprint 9 — Patterns + Command Palette

### Task 16: Patterns page with charts

**Files:**
- Create: `ui/app/patterns/page.tsx`
- Create: `ui/components/charts/score-histogram.tsx`
- Create: `ui/components/charts/funnel-chart.tsx`

- [ ] **Step 1: Create score histogram chart**

```tsx
// ui/components/charts/score-histogram.tsx
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props { apps: { score: number | null }[] }

export function ScoreHistogram({ apps }: Props) {
  const buckets = [
    { range: '1.0–1.4', min: 1.0, max: 1.5 },
    { range: '1.5–1.9', min: 1.5, max: 2.0 },
    { range: '2.0–2.4', min: 2.0, max: 2.5 },
    { range: '2.5–2.9', min: 2.5, max: 3.0 },
    { range: '3.0–3.4', min: 3.0, max: 3.5 },
    { range: '3.5–3.9', min: 3.5, max: 4.0 },
    { range: '4.0–4.4', min: 4.0, max: 4.5 },
    { range: '4.5–5.0', min: 4.5, max: 5.01 },
  ]

  const data = buckets.map(b => ({
    range: b.range,
    count: apps.filter(a => a.score !== null && a.score >= b.min && a.score < b.max).length,
    color: b.min >= 4.0 ? '#10b981' : b.min >= 3.5 ? '#f59e0b' : '#a8a29e',
  }))

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Score distribution</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="range" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <Tooltip formatter={(v: number) => [`${v} jobs`, 'Count']} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Create funnel chart**

```tsx
// ui/components/charts/funnel-chart.tsx
interface Props {
  evaluated: number
  applied: number
  responded: number
  interview: number
  offer: number
}

export function FunnelChart({ evaluated, applied, responded, interview, offer }: Props) {
  const stages = [
    { label: 'Evaluated', count: evaluated, color: 'bg-stone-200' },
    { label: 'Applied', count: applied, color: 'bg-stone-400' },
    { label: 'Responded', count: responded, color: 'bg-amber-400' },
    { label: 'Interview', count: interview, color: 'bg-emerald-400' },
    { label: 'Offer', count: offer, color: 'bg-emerald-600' },
  ]
  const max = evaluated || 1
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Application funnel</div>
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-20 text-xs text-stone-500 text-right">{s.label}</div>
            <div className="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
              <div className={`h-full ${s.color} rounded`} style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <div className="w-6 text-xs text-stone-500">{s.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create patterns page**

```tsx
// ui/app/patterns/page.tsx
import fs from 'fs'
import { dataPath } from '@/lib/paths'
import { parseApplications } from '@/lib/parsers/applications'
import { ScoreHistogram } from '@/components/charts/score-histogram'
import { FunnelChart } from '@/components/charts/funnel-chart'

export const dynamic = 'force-dynamic'

export default function PatternsPage() {
  const content = fs.existsSync(dataPath('applications.md'))
    ? fs.readFileSync(dataPath('applications.md'), 'utf-8')
    : ''
  const apps = parseApplications(content)

  const byStatus = (statuses: string[]) => apps.filter(a => statuses.includes(a.status)).length

  // Company breakdown
  const companyMap: Record<string, { count: number; scores: number[] }> = {}
  for (const app of apps) {
    if (!companyMap[app.company]) companyMap[app.company] = { count: 0, scores: [] }
    companyMap[app.company].count++
    if (app.score !== null) companyMap[app.company].scores.push(app.score)
  }
  const companies = Object.entries(companyMap)
    .map(([name, { count, scores }]) => ({
      name, count,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Patterns</h1>
        <p className="text-sm text-stone-400 mt-0.5">Analysis across {apps.length} evaluations</p>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg px-4 py-8 text-center text-sm text-stone-400">
          No evaluations yet — charts will appear after running batch.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ScoreHistogram apps={apps} />
            <FunnelChart
              evaluated={apps.length}
              applied={byStatus(['Applied','Responded','Interview','Offer'])}
              responded={byStatus(['Responded','Interview','Offer'])}
              interview={byStatus(['Interview','Offer'])}
              offer={byStatus(['Offer'])}
            />
          </div>

          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Top companies by evaluations</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-stone-500 font-semibold uppercase tracking-wide">Company</th>
                  <th className="px-4 py-2 text-right text-xs text-stone-500 font-semibold uppercase tracking-wide">Evaluations</th>
                  <th className="px-4 py-2 text-right text-xs text-stone-500 font-semibold uppercase tracking-wide">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {companies.map(c => (
                  <tr key={c.name} className="hover:bg-stone-50">
                    <td className="px-4 py-2 font-medium text-stone-800">{c.name}</td>
                    <td className="px-4 py-2 text-right text-stone-500">{c.count}</td>
                    <td className="px-4 py-2 text-right">
                      {c.avgScore !== null
                        ? <span className={`text-xs font-semibold ${c.avgScore >= 4 ? 'text-emerald-600' : c.avgScore >= 3.5 ? 'text-amber-600' : 'text-stone-400'}`}>{c.avgScore.toFixed(1)}</span>
                        : <span className="text-stone-300 text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify patterns page at `localhost:3001/patterns`**

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): patterns page with score histogram + funnel + company table"
```

---

### Task 17: ⌘K Command Palette

**Files:**
- Create: `ui/components/command-palette.tsx`
- Modify: `ui/app/layout.tsx` (add CommandPalette provider)

- [ ] **Step 1: Create `components/command-palette.tsx`**

```tsx
// ui/components/command-palette.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'

const STATIC_COMMANDS = [
  { id: 'nav-overview', label: 'Go to Overview', group: 'Navigate', action: '/' },
  { id: 'nav-pipeline', label: 'Go to Pipeline', group: 'Navigate', action: '/pipeline' },
  { id: 'nav-tracker', label: 'Go to Tracker', group: 'Navigate', action: '/tracker' },
  { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', action: '/reports' },
  { id: 'nav-actions', label: 'Go to Actions', group: 'Navigate', action: '/actions' },
  { id: 'nav-patterns', label: 'Go to Patterns', group: 'Navigate', action: '/patterns' },
  { id: 'action-scan', label: 'Run Scan', group: 'Actions', action: '/actions?run=scan' },
  { id: 'action-batch', label: 'Start Batch Eval', group: 'Actions', action: '/actions?run=batch' },
  { id: 'action-merge', label: 'Merge Tracker', group: 'Actions', action: '/actions?run=merge' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  function runCommand(action: string) {
    setOpen(false)
    router.push(action)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/20" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white border border-stone-200 rounded-xl shadow-2xl overflow-hidden">
        <Command>
          <Command.Input
            placeholder="Type a command or search…"
            className="w-full px-4 py-3 text-sm border-b border-stone-100 focus:outline-none"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-stone-400">No results.</Command.Empty>
            {['Navigate', 'Actions'].map(group => (
              <Command.Group key={group} heading={group}
                className="px-2"
                // headingClassName not available in all versions — add via CSS
              >
                {STATIC_COMMANDS.filter(c => c.group === group).map(cmd => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={() => runCommand(cmd.action)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-stone-700 cursor-pointer data-[selected=true]:bg-stone-100"
                  >
                    {cmd.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire ⌘K hint into sidebar + add CommandPalette to layout**

Update `components/sidebar.tsx` — add ⌘K hint at bottom:
```tsx
// Inside Sidebar, after the nav links:
<div className="mt-auto px-2 pb-2">
  <button
    onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
    className="w-full text-left px-2 py-1.5 text-xs text-stone-400 border border-stone-100 rounded hover:bg-stone-50 flex items-center gap-2"
  >
    <span className="font-mono bg-stone-100 px-1 rounded text-xs">⌘K</span>
    <span>Command</span>
  </button>
</div>
```

Update `app/layout.tsx` — add CommandPalette after Sidebar:
```tsx
import { CommandPalette } from '@/components/command-palette'
// Inside RootLayout body:
<div className="flex h-screen overflow-hidden">
  <Sidebar />
  <CommandPalette />   {/* add this line */}
  <main className="flex-1 overflow-y-auto p-6">
    {children}
  </main>
</div>
```

- [ ] **Step 3: Verify ⌘K opens command palette**

```bash
npm run dev
# Open http://localhost:3001, press Cmd+K — palette opens with navigate/action commands
```

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): ⌘K command palette with navigation + action commands"
```

---

## Sprint 10 — Polish & Ship

### Task 18: TypeScript + build verification

**Files:** All existing files

- [ ] **Step 1: Run full test suite**

```bash
cd ui && npm test
# Expected: all parser + component tests PASS
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd ui && npx tsc --noEmit
# Fix any type errors before proceeding
```

- [ ] **Step 3: Run production build**

```bash
cd ui && npm run build
# Expected: build succeeds with no errors
```

- [ ] **Step 4: Verify all 6 pages load at production port**

```bash
npm start
# Visit: /, /pipeline, /tracker, /reports, /actions, /patterns
```

- [ ] **Step 5: Update root README (add UI section)**

In `career-ops/README.md`, add:
```markdown
## Web UI

The web UI lives at `ui/`. See [ui/README.md](ui/README.md) for setup.

```bash
cd ui && npm install && npm run dev
# Opens at http://localhost:3001
```
```

- [ ] **Step 6: Final commit**

```bash
git add . && git commit -m "feat(ui): career-ops web UI complete — 6 pages, ⌘K palette, SSE streaming"
```

---

## File Map

| File | Responsibility |
|------|----------------|
| `ui/lib/paths.ts` | Resolve CAREER_OPS_PATH, return absolute paths |
| `ui/lib/parsers/pipeline.ts` | Parse pipeline.md → PipelineEntry[] |
| `ui/lib/parsers/applications.ts` | Parse applications.md → Application[] |
| `ui/lib/parsers/report.ts` | Parse report .md → Report |
| `ui/lib/parsers/scan-history.ts` | Parse scan-history.tsv → ScanEntry[] |
| `ui/lib/mutations/status.ts` | updateApplicationStatus (pure) + writeApplicationStatus (fs) |
| `ui/lib/mutations/pipeline.ts` | markPipelineEntry (pure) + writePipelineEntry (fs) |
| `ui/lib/mutations/process.ts` | spawnCareerOpsCommand — child_process wrapper |
| `ui/app/layout.tsx` | Root layout: sidebar + command palette |
| `ui/app/page.tsx` | Overview: KPIs, funnel, recent activity |
| `ui/app/pipeline/page.tsx` | Pipeline: filterable table, skip action |
| `ui/app/tracker/page.tsx` | Tracker: sortable table, inline status |
| `ui/app/reports/page.tsx` | Reports index |
| `ui/app/reports/[id]/page.tsx` | Report detail with prev/next |
| `ui/app/actions/page.tsx` | Actions: SSE-backed run console |
| `ui/app/patterns/page.tsx` | Patterns: histogram, funnel, company table |
| `ui/app/api/pipeline/route.ts` | PATCH: mark pipeline entry done/skip |
| `ui/app/api/applications/route.ts` | PATCH: update application status |
| `ui/app/api/stream/scan/route.ts` | GET SSE: stream `node scan.mjs` |
| `ui/app/api/stream/batch/route.ts` | GET SSE: stream `bash batch-runner.sh` |
| `ui/app/api/stream/merge/route.ts` | GET SSE: stream merge + verify |
| `ui/components/sidebar.tsx` | Sidebar nav + ⌘K shortcut button |
| `ui/components/command-palette.tsx` | ⌘K modal (cmdk) |
| `ui/components/score-badge.tsx` | Color-coded score pill |
| `ui/components/kpi-card.tsx` | Single stat card |
| `ui/components/score-funnel.tsx` | Horizontal score distribution bars |
| `ui/components/pipeline-table.tsx` | Client-side filterable pipeline table |
| `ui/components/tracker-table.tsx` | Sortable tracker table with status dropdown |
| `ui/components/report-viewer.tsx` | Markdown report + score sidebar |
| `ui/components/action-console.tsx` | SSE stream display with start/stop |
| `ui/components/charts/score-histogram.tsx` | Recharts bar chart for score buckets |
| `ui/components/charts/funnel-chart.tsx` | Application stage funnel bars |
