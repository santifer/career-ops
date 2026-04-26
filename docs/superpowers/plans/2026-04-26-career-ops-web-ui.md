# Career-Ops Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only browser UI at `career-ops/ui/` that replaces CLI commands with a visual dashboard — view pipeline, track applications, read reports, trigger scans and batch runs, and see patterns.

**Architecture:** Single Express server (`server.mjs`) handles all file I/O and process spawning. Vite + React SPA handles all UI. In dev, Vite proxies `/api` to Express. In production, Express serves the Vite build as static files. No Next.js, no framework magic.

**Tech Stack:** Vite, React 18, TypeScript, React Router v6, Tailwind CSS, shadcn/ui, Recharts, react-markdown, cmdk (command palette), Jest + Testing Library, Express (server only)

---

## File Map

| File | Responsibility |
|------|---------------|
| `ui/server.mjs` | Express: reads/writes data files, spawns processes, SSE streaming |
| `ui/vite.config.ts` | Vite dev server on :3001, proxy `/api` → Express on :3002 |
| `ui/src/main.tsx` | React entry point |
| `ui/src/App.tsx` | React Router routes + Layout wrapper |
| `ui/src/lib/api.ts` | Typed fetch helpers for all Express endpoints |
| `ui/src/lib/parsers/pipeline.ts` | Pure fn: parse pipeline.md → PipelineEntry[] |
| `ui/src/lib/parsers/applications.ts` | Pure fn: parse applications.md → Application[] |
| `ui/src/lib/parsers/report.ts` | Pure fn: parse report .md → Report |
| `ui/src/lib/parsers/scan-history.ts` | Pure fn: parse scan-history.tsv → ScanEntry[] |
| `ui/src/components/Layout.tsx` | Sidebar + `<Outlet />` shell |
| `ui/src/components/Sidebar.tsx` | Nav links + ⌘K shortcut hint |
| `ui/src/components/ScoreBadge.tsx` | Color-coded score pill |
| `ui/src/components/KpiCard.tsx` | Single stat card |
| `ui/src/components/ScoreFunnel.tsx` | Horizontal score distribution bars |
| `ui/src/components/ActionConsole.tsx` | SSE stream display with Run/Stop |
| `ui/src/components/CommandPalette.tsx` | ⌘K modal using cmdk |
| `ui/src/components/charts/ScoreHistogram.tsx` | Recharts bar chart |
| `ui/src/components/charts/FunnelChart.tsx` | Application funnel bars |
| `ui/src/pages/Overview.tsx` | KPIs, score funnel, recent evaluations |
| `ui/src/pages/Pipeline.tsx` | Filterable pending jobs table |
| `ui/src/pages/Tracker.tsx` | Sortable applications table + status dropdown |
| `ui/src/pages/Reports.tsx` | Reports index list |
| `ui/src/pages/Report.tsx` | Single report: markdown + score sidebar |
| `ui/src/pages/Actions.tsx` | Run Scan / Batch / Merge with live output |
| `ui/src/pages/Patterns.tsx` | Charts + company breakdown table |

---

## Sprint 1 — Project Setup

### Task 1: Scaffold Vite + React + Express

**Files:**
- Create: `ui/package.json`
- Create: `ui/vite.config.ts`
- Create: `ui/tailwind.config.ts`
- Create: `ui/postcss.config.js`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/.env`

- [ ] **Step 1: Create the ui directory and package.json**

```bash
mkdir -p career-ops/ui && cd career-ops/ui
npm init -y
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install \
  react react-dom react-router-dom \
  recharts react-markdown remark-gfm \
  cmdk lucide-react clsx tailwind-merge \
  class-variance-authority \
  @radix-ui/react-slot @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu @radix-ui/react-select \
  express cors

npm install -D \
  vite @vitejs/plugin-react \
  typescript @types/react @types/react-dom @types/node @types/express @types/cors \
  tailwindcss postcss autoprefixer \
  concurrently \
  jest jest-environment-jsdom ts-jest \
  @testing-library/react @testing-library/jest-dom @types/jest
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 3001,
    proxy: { '/api': 'http://localhost:3002' },
  },
})
```

- [ ] **Step 5: Init Tailwind**

```bash
npx tailwindcss init -p --ts
```

Replace `tailwind.config.ts` content:
```ts
import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [typography],
} satisfies Config

// also install: npm install -D @tailwindcss/typography
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>career-ops</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 8: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply bg-stone-50 text-stone-900 antialiased; }
}
```

- [ ] **Step 9: Create `.env`**

```
CAREER_OPS_PATH=..
PORT=3002
```

- [ ] **Step 10: Set up `package.json` scripts**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"node server.mjs\"",
    "build": "vite build",
    "start": "NODE_ENV=production node server.mjs",
    "test": "jest --passWithNoTests",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 11: Create `jest.config.ts`**

```ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
}

export default config
```

- [ ] **Step 12: Create `jest.setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 13: Commit**

```bash
git add ui/ && git commit -m "feat(ui): scaffold Vite + React + Express project"
```

---

### Task 2: Express server — all API endpoints

**Files:**
- Create: `ui/server.mjs`

- [ ] **Step 1: Create `server.mjs`**

This is the entire backend. It reads/writes files and spawns processes — nothing else.

```js
// ui/server.mjs
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3002
const ROOT = process.env.CAREER_OPS_PATH
  ? path.resolve(process.env.CAREER_OPS_PATH)
  : path.resolve(__dirname, '..')

app.use(cors())
app.use(express.json())

// Serve Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dataFile(name) { return path.join(ROOT, 'data', name) }
function reportsDir() { return path.join(ROOT, 'reports') }
function read(filePath) { return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '' }

// ── Read endpoints ────────────────────────────────────────────────────────────

app.get('/api/pipeline', (_req, res) => {
  res.json({ content: read(dataFile('pipeline.md')) })
})

app.get('/api/applications', (_req, res) => {
  res.json({ content: read(dataFile('applications.md')) })
})

app.get('/api/scan-history', (_req, res) => {
  res.json({ content: read(dataFile('scan-history.tsv')) })
})

app.get('/api/reports', (_req, res) => {
  const dir = reportsDir()
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
    : []
  res.json({ files })
})

app.get('/api/reports/:id', (req, res) => {
  const dir = reportsDir()
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'reports dir not found' })
  const file = fs.readdirSync(dir).find(f => f.startsWith(req.params.id))
  if (!file) return res.status(404).json({ error: 'report not found' })
  res.json({ content: fs.readFileSync(path.join(dir, file), 'utf-8'), filename: file })
})

app.get('/api/patterns', (_req, res) => {
  const content = read(dataFile('applications.md'))
  res.json({ content })
})

// ── Mutation endpoints ────────────────────────────────────────────────────────

app.patch('/api/applications/:number', (req, res) => {
  const rowNum = parseInt(req.params.number, 10)
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'status required' })

  const filePath = dataFile('applications.md')
  const lines = read(filePath).split('\n')
  let found = false

  const updated = lines.map(line => {
    const m = /^\|\s*(\d+)\s*\|/.exec(line)
    if (!m || parseInt(m[1], 10) !== rowNum) return line
    found = true
    const cells = line.split('|')
    cells[6] = ` ${status} `
    return cells.join('|')
  }).join('\n')

  if (!found) return res.status(404).json({ error: `Row ${rowNum} not found` })
  fs.writeFileSync(filePath, updated, 'utf-8')
  res.json({ ok: true })
})

app.patch('/api/pipeline', (req, res) => {
  const { url, action } = req.body
  if (!url || !['done', 'skip'].includes(action)) {
    return res.status(400).json({ error: 'url and action (done|skip) required' })
  }
  const marker = action === 'done' ? 'x' : '-'
  const filePath = dataFile('pipeline.md')
  const lines = read(filePath).split('\n')
  let found = false

  const updated = lines.map(line => {
    if (!line.includes(url) || !/^- \[[ x-]\]/.test(line.trim())) return line
    found = true
    return line.replace(/^(\s*- )\[[ x-]\]/, `$1[${marker}]`)
  }).join('\n')

  if (!found) return res.status(404).json({ error: 'URL not found in pipeline.md' })
  fs.writeFileSync(filePath, updated, 'utf-8')
  res.json({ ok: true })
})

// ── SSE streaming endpoints ───────────────────────────────────────────────────

function sseStream(res, command, args) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const child = spawn(command, args, { cwd: ROOT })

  const send = chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  }

  child.stdout.on('data', send)
  child.stderr.on('data', send)
  child.on('close', code => {
    res.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`)
    res.end()
  })

  res.on('close', () => child.kill('SIGTERM'))
}

app.get('/api/stream/scan', (_req, res) => {
  sseStream(res, 'node', ['scan.mjs'])
})

app.get('/api/stream/batch', (req, res) => {
  const { parallel = '2', startFrom = '0', minScore = '0' } = req.query
  const args = ['batch/batch-runner.sh', '--parallel', parallel, '--start-from', startFrom]
  if (parseFloat(minScore) > 0) args.push('--min-score', minScore)
  sseStream(res, 'bash', args)
})

app.get('/api/stream/merge', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  }

  const merge = spawn('node', ['merge-tracker.mjs'], { cwd: ROOT })
  merge.stdout.on('data', send)
  merge.stderr.on('data', send)
  merge.on('close', code => {
    if (code !== 0) {
      res.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`)
      return res.end()
    }
    const verify = spawn('node', ['verify-pipeline.mjs'], { cwd: ROOT })
    verify.stdout.on('data', send)
    verify.stderr.on('data', send)
    verify.on('close', vCode => {
      res.write(`event: done\ndata: ${JSON.stringify({ code: vCode })}\n\n`)
      res.end()
    })
  })

  res.on('close', () => merge.kill('SIGTERM'))
})

// Fallback for SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

app.listen(PORT, () => console.log(`career-ops api ready on :${PORT}`))
```

- [ ] **Step 2: Verify server starts**

```bash
cd ui && node server.mjs
# Expected: career-ops api ready on :3002
# Test: curl http://localhost:3002/api/pipeline
```

- [ ] **Step 3: Commit**

```bash
git add ui/ && git commit -m "feat(ui): Express server with file I/O + SSE process streaming"
```

---

## Sprint 2 — Data Parsers

### Task 3: Pipeline + applications parsers

**Files:**
- Create: `ui/src/lib/parsers/pipeline.ts`
- Create: `ui/src/lib/parsers/applications.ts`
- Create: `ui/src/lib/parsers/__tests__/pipeline.test.ts`
- Create: `ui/src/lib/parsers/__tests__/applications.test.ts`

- [ ] **Step 1: Write failing pipeline test**

```ts
// ui/src/lib/parsers/__tests__/pipeline.test.ts
import { parsePipeline } from '../pipeline'

const SAMPLE = `# Pipeline\n\n## Pendientes\n\n- [ ] https://jobs.ashbyhq.com/langchain/abc | LangChain | Python OSS Engineer\n- [x] https://jobs.ashbyhq.com/acme/xyz | Acme | Senior Backend\n- [-] https://lever.co/foo/123 | Foo | Product Manager\n`

test('parses pending entry', () => {
  const entries = parsePipeline(SAMPLE)
  const e = entries.find(e => e.company === 'LangChain')!
  expect(e.done).toBe(false)
  expect(e.skipped).toBe(false)
  expect(e.url).toBe('https://jobs.ashbyhq.com/langchain/abc')
  expect(e.role).toBe('Python OSS Engineer')
})

test('parses [x] as done', () => {
  expect(parsePipeline(SAMPLE).find(e => e.company === 'Acme')!.done).toBe(true)
})

test('parses [-] as skipped', () => {
  expect(parsePipeline(SAMPLE).find(e => e.company === 'Foo')!.skipped).toBe(true)
})

test('infers source from URL', () => {
  const entries = parsePipeline(SAMPLE)
  expect(entries[0].source).toBe('ashby')
  expect(entries[2].source).toBe('lever')
})

test('returns empty array for empty content', () => {
  expect(parsePipeline('')).toEqual([])
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- pipeline
```

- [ ] **Step 3: Implement pipeline parser**

```ts
// ui/src/lib/parsers/pipeline.ts
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
  return content.split('\n').reduce<PipelineEntry[]>((acc, line) => {
    const m = LINE_RE.exec(line.trim())
    if (!m) return acc
    const [, state, url, company, role] = m
    acc.push({
      url: url.trim(), company: company.trim(), role: role.trim(),
      source: inferSource(url), done: state === 'x', skipped: state === '-',
    })
    return acc
  }, [])
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- pipeline
```

- [ ] **Step 5: Write failing applications test**

```ts
// ui/src/lib/parsers/__tests__/applications.test.ts
import { parseApplications } from '../applications'

const SAMPLE = `# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n| 1 | 2026-04-26 | LangChain | Python OSS Engineer | 4.2/5 | Evaluated | ✅ | [001](reports/001-langchain-2026-04-26.md) | Strong match |\n| 2 | 2026-04-27 | Acme | Backend | | Applied | ❌ | | |\n`

test('parses score as number', () => {
  expect(parseApplications(SAMPLE)[0].score).toBe(4.2)
})

test('parses null score for empty cell', () => {
  expect(parseApplications(SAMPLE)[1].score).toBeNull()
})

test('parses hasPDF', () => {
  const apps = parseApplications(SAMPLE)
  expect(apps[0].hasPDF).toBe(true)
  expect(apps[1].hasPDF).toBe(false)
})

test('parses reportPath and reportNumber', () => {
  const app = parseApplications(SAMPLE)[0]
  expect(app.reportPath).toBe('reports/001-langchain-2026-04-26.md')
  expect(app.reportNumber).toBe('001')
})

test('parses core fields', () => {
  const app = parseApplications(SAMPLE)[0]
  expect(app.number).toBe(1)
  expect(app.company).toBe('LangChain')
  expect(app.status).toBe('Evaluated')
  expect(app.date).toBe('2026-04-26')
})

test('returns empty for header-only content', () => {
  expect(parseApplications('# Applications\n\n| # |\n|---|')).toEqual([])
})
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npm test -- applications
```

- [ ] **Step 7: Implement applications parser**

```ts
// ui/src/lib/parsers/applications.ts
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
}

const REPORT_LINK_RE = /\[(\d{3})\]\(([^)]+)\)/

function parseScore(cell: string): number | null {
  const m = /^([\d.]+)\/5$/.exec(cell.trim())
  return m ? parseFloat(m[1]) : null
}

function parseReport(cell: string) {
  const m = REPORT_LINK_RE.exec(cell.trim())
  return m ? { path: m[2], number: m[1] } : { path: null, number: null }
}

function isDataRow(line: string) {
  return line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line) && !/^\|\s*#/.test(line)
}

export function parseApplications(content: string): Application[] {
  return content.split('\n')
    .filter(isDataRow)
    .map(line => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      const [num, date, company, role, score, status, pdf, report, ...noteParts] = cells
      const { path: reportPath, number: reportNumber } = parseReport(report ?? '')
      const number = parseInt(num, 10)
      if (isNaN(number)) return null
      return {
        number, date, company, role,
        score: parseScore(score ?? ''),
        status, hasPDF: pdf?.includes('✅') ?? false,
        reportPath, reportNumber,
        notes: noteParts.join('|').trim(),
      }
    })
    .filter((a): a is Application => a !== null)
}
```

- [ ] **Step 8: Run — expect PASS**

```bash
npm test -- applications
```

- [ ] **Step 9: Commit**

```bash
git add ui/ && git commit -m "feat(ui): pipeline + applications parsers with tests"
```

---

### Task 4: Report + scan-history parsers

**Files:**
- Create: `ui/src/lib/parsers/report.ts`
- Create: `ui/src/lib/parsers/scan-history.ts`
- Create: `ui/src/lib/parsers/__tests__/report.test.ts`
- Create: `ui/src/lib/parsers/__tests__/scan-history.test.ts`

- [ ] **Step 1: Write failing report test**

```ts
// ui/src/lib/parsers/__tests__/report.test.ts
import { parseReport } from '../report'

const SAMPLE = `# Evaluación: LangChain — Python OSS Engineer\n\n**Fecha:** 2026-04-26\n**Arquetipo:** AI Platform / LLMOps Engineer\n**Score:** 4.2/5\n**Legitimacy:** High Confidence\n**URL:** https://jobs.ashbyhq.com/langchain/abc\n**PDF:** output/001-langchain.pdf\n\n---\n\n## A) Resumen del Rol\n\nGreat role.\n\n## B) Match con CV\n\nStrong fit.\n`

test('parses company and role from heading', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.company).toBe('LangChain')
  expect(r.role).toBe('Python OSS Engineer')
})

test('parses score as number', () => {
  expect(parseReport('001', SAMPLE).score).toBe(4.2)
})

test('parses metadata', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.archetype).toBe('AI Platform / LLMOps Engineer')
  expect(r.legitimacy).toBe('High Confidence')
  expect(r.date).toBe('2026-04-26')
  expect(r.jobUrl).toBe('https://jobs.ashbyhq.com/langchain/abc')
})

test('extracts sections keyed by letter', () => {
  const r = parseReport('001', SAMPLE)
  expect(r.sections['A']).toContain('Great role.')
  expect(r.sections['B']).toContain('Strong fit.')
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- report.test
```

- [ ] **Step 3: Implement report parser**

```ts
// ui/src/lib/parsers/report.ts
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

function meta(content: string, key: string): string {
  const m = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, 'm').exec(content)
  return m ? m[1].trim() : ''
}

export function parseReport(number: string, content: string): Report {
  const h = HEADING_RE.exec(content)
  const scoreRaw = meta(content, 'Score')
  const scoreMatch = /^([\d.]+)\/5$/.exec(scoreRaw)

  const sections: Record<string, string> = {}
  content.split(/^##\s+/m).forEach(part => {
    const m = /^([A-G])\)/.exec(part)
    if (m) sections[m[1]] = part.replace(/^[A-G]\)[^\n]*\n/, '').trim()
  })

  return {
    number,
    company: h?.[1]?.trim() ?? '',
    role: h?.[2]?.trim() ?? '',
    date: meta(content, 'Fecha'),
    archetype: meta(content, 'Arquetipo'),
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    legitimacy: meta(content, 'Legitimacy'),
    jobUrl: meta(content, 'URL') || null,
    pdfPath: meta(content, 'PDF') || null,
    sections,
    rawContent: content,
  }
}
```

- [ ] **Step 4: Write failing scan-history test**

```ts
// ui/src/lib/parsers/__tests__/scan-history.test.ts
import { parseScanHistory } from '../scan-history'

const SAMPLE = `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\nhttps://jobs.ashbyhq.com/abc\t2026-04-26\tashby-api\tPython OSS Engineer\tLangChain\tadded\n`

test('parses all fields', () => {
  const [e] = parseScanHistory(SAMPLE)
  expect(e.url).toBe('https://jobs.ashbyhq.com/abc')
  expect(e.firstSeen).toBe('2026-04-26')
  expect(e.company).toBe('LangChain')
  expect(e.status).toBe('added')
})

test('skips header row', () => {
  expect(parseScanHistory(SAMPLE)).toHaveLength(1)
})

test('returns empty for header-only', () => {
  expect(parseScanHistory('url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n')).toEqual([])
})
```

- [ ] **Step 5: Implement scan-history parser**

```ts
// ui/src/lib/parsers/scan-history.ts
export interface ScanEntry {
  url: string
  firstSeen: string
  portal: string
  title: string
  company: string
  status: string
}

export function parseScanHistory(content: string): ScanEntry[] {
  return content.trim().split('\n').slice(1).filter(Boolean).map(line => {
    const [url, firstSeen, portal, title, company, status] = line.split('\t')
    return { url, firstSeen, portal, title, company, status }
  })
}
```

- [ ] **Step 6: Run all parsers — expect PASS**

```bash
npm test
# Expected: 12 tests pass
```

- [ ] **Step 7: Commit**

```bash
git add ui/ && git commit -m "feat(ui): report + scan-history parsers with tests"
```

---

## Sprint 3 — App Shell

### Task 5: API client + routing + layout

**Files:**
- Create: `ui/src/lib/api.ts`
- Create: `ui/src/App.tsx`
- Create: `ui/src/components/Layout.tsx`
- Create: `ui/src/components/Sidebar.tsx`
- Create: `ui/src/components/ScoreBadge.tsx`

- [ ] **Step 1: Create `src/lib/api.ts`**

All server calls go through this file so pages never construct URLs manually.

```ts
// ui/src/lib/api.ts
const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function patch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
}

export const api = {
  pipeline:        () => get<{ content: string }>('/pipeline'),
  applications:    () => get<{ content: string }>('/applications'),
  scanHistory:     () => get<{ content: string }>('/scan-history'),
  reports:         () => get<{ files: string[] }>('/reports'),
  report:          (id: string) => get<{ content: string; filename: string }>(`/reports/${id}`),
  patterns:        () => get<{ content: string }>('/patterns'),
  updateStatus:    (number: number, status: string) => patch(`/applications/${number}`, { status }),
  markPipeline:    (url: string, action: 'done' | 'skip') => patch('/pipeline', { url, action }),
}
```

- [ ] **Step 2: Create `src/components/ScoreBadge.tsx`**

```tsx
// ui/src/components/ScoreBadge.tsx
import { clsx } from 'clsx'

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-400">—</span>
  return (
    <span className={clsx('inline-block px-1.5 py-0.5 rounded text-xs font-semibold',
      score >= 4.0 ? 'bg-emerald-100 text-emerald-800' :
      score >= 3.5 ? 'bg-amber-100 text-amber-800' :
                     'bg-stone-100 text-stone-600')}>
      {score.toFixed(1)}
    </span>
  )
}
```

- [ ] **Step 3: Create `src/components/Sidebar.tsx`**

```tsx
// ui/src/components/Sidebar.tsx
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Kanban, FileText, Terminal, BarChart2 } from 'lucide-react'
import { clsx } from 'clsx'

const NAV = [
  { to: '/',         label: 'Overview', icon: LayoutDashboard },
  { to: '/pipeline', label: 'Pipeline', icon: List },
  { to: '/tracker',  label: 'Tracker',  icon: Kanban },
  { to: '/reports',  label: 'Reports',  icon: FileText },
  { to: '/actions',  label: 'Actions',  icon: Terminal },
  { to: '/patterns', label: 'Patterns', icon: BarChart2 },
]

export function Sidebar() {
  return (
    <aside className="w-44 shrink-0 border-r border-stone-200 bg-white flex flex-col py-4 gap-1 px-2">
      <div className="px-2 mb-4">
        <span className="text-sm font-bold tracking-tight text-stone-900">career-ops</span>
      </div>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}
          className={({ isActive }) => clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors',
            isActive ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
          )}>
          <Icon size={14} />{label}
        </NavLink>
      ))}
    </aside>
  )
}
```

- [ ] **Step 4: Create `src/components/Layout.tsx`**

```tsx
// ui/src/components/Layout.tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/App.tsx`**

```tsx
// ui/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Overview } from './pages/Overview'
import { Pipeline } from './pages/Pipeline'
import { Tracker } from './pages/Tracker'
import { Reports } from './pages/Reports'
import { Report } from './pages/Report'
import { Actions } from './pages/Actions'
import { Patterns } from './pages/Patterns'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="tracker" element={<Tracker />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<Report />} />
          <Route path="actions" element={<Actions />} />
          <Route path="patterns" element={<Patterns />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 6: Create placeholder pages so the app compiles**

Create each file with a stub:
```tsx
// ui/src/pages/Overview.tsx
export function Overview() { return <div className="text-stone-400 text-sm">Overview — Sprint 4</div> }

// ui/src/pages/Pipeline.tsx
export function Pipeline() { return <div className="text-stone-400 text-sm">Pipeline — Sprint 5</div> }

// ui/src/pages/Tracker.tsx
export function Tracker() { return <div className="text-stone-400 text-sm">Tracker — Sprint 6</div> }

// ui/src/pages/Reports.tsx
export function Reports() { return <div className="text-stone-400 text-sm">Reports — Sprint 7</div> }

// ui/src/pages/Report.tsx
export function Report() { return <div className="text-stone-400 text-sm">Report — Sprint 7</div> }

// ui/src/pages/Actions.tsx
export function Actions() { return <div className="text-stone-400 text-sm">Actions — Sprint 8</div> }

// ui/src/pages/Patterns.tsx
export function Patterns() { return <div className="text-stone-400 text-sm">Patterns — Sprint 9</div> }
```

- [ ] **Step 7: Verify app shell loads**

```bash
npm run dev
# Open http://localhost:3001 — sidebar visible, nav links work, stub pages render
```

- [ ] **Step 8: Commit**

```bash
git add ui/ && git commit -m "feat(ui): app shell — routing, layout, sidebar, ScoreBadge"
```

---

## Sprint 4 — Overview Page

### Task 6: Overview page

**Files:**
- Create: `ui/src/components/KpiCard.tsx`
- Create: `ui/src/components/ScoreFunnel.tsx`
- Modify: `ui/src/pages/Overview.tsx`

- [ ] **Step 1: Create `KpiCard.tsx`**

```tsx
// ui/src/components/KpiCard.tsx
export function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold text-stone-900">{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Create `ScoreFunnel.tsx`**

```tsx
// ui/src/components/ScoreFunnel.tsx
export function ScoreFunnel({ high, mid, low }: { high: number; mid: number; low: number }) {
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
              <div className={`h-full ${color} rounded-full`} style={{ width: `${(count / total) * 100}%` }} />
            </div>
            <div className="w-6 text-xs text-stone-500">{count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build Overview page**

```tsx
// ui/src/pages/Overview.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parsePipeline } from '@/lib/parsers/pipeline'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { KpiCard } from '@/components/KpiCard'
import { ScoreFunnel } from '@/components/ScoreFunnel'
import { ScoreBadge } from '@/components/ScoreBadge'

export function Overview() {
  const [apps, setApps] = useState<Application[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    api.applications().then(({ content }) => setApps(parseApplications(content)))
    api.pipeline().then(({ content }) => {
      const entries = parsePipeline(content)
      setPendingCount(entries.filter(e => !e.done && !e.skipped).length)
    })
  }, [])

  const applied = apps.filter(a => ['Applied','Interview','Offer','Responded'].includes(a.status)).length
  const interviews = apps.filter(a => ['Interview','Offer'].includes(a.status)).length
  const high = apps.filter(a => a.score !== null && a.score >= 4.0).length
  const mid = apps.filter(a => a.score !== null && a.score >= 3.5 && a.score < 4.0).length
  const low = apps.filter(a => a.score !== null && (a.score ?? 0) < 3.5).length
  const recent = [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Overview</h1>
        <p className="text-sm text-stone-400 mt-0.5">Job search at a glance</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Pipeline" value={pendingCount} sub="pending evaluation" />
        <KpiCard label="Evaluated" value={apps.length} sub="reports written" />
        <KpiCard label="Applied" value={applied} sub="applications sent" />
        <KpiCard label="Interviews" value={interviews} sub="active processes" />
      </div>

      {apps.length > 0 && <ScoreFunnel high={high} mid={mid} low={low} />}

      <div className="bg-white border border-stone-200 rounded-lg">
        <div className="px-4 py-3 border-b border-stone-100">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Recent evaluations</span>
        </div>
        {recent.length === 0
          ? <div className="px-4 py-8 text-center text-sm text-stone-400">No evaluations yet.</div>
          : <div className="divide-y divide-stone-50">
              {recent.map(app => (
                <div key={app.number} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-stone-300 w-8">{String(app.number).padStart(3,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-stone-800">{app.company}</span>
                    <span className="text-xs text-stone-400 ml-2 truncate">{app.role}</span>
                  </div>
                  <ScoreBadge score={app.score} />
                  <span className="text-xs text-stone-300">{app.date}</span>
                  {app.reportNumber && (
                    <Link to={`/reports/${app.reportNumber}`} className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2">
                      report
                    </Link>
                  )}
                </div>
              ))}
            </div>
        }
      </div>

      <div className="flex gap-2">
        <Link to="/actions" className="px-3 py-1.5 bg-stone-900 text-white text-xs font-medium rounded hover:bg-stone-700">Run Scan</Link>
        <Link to="/actions" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50">Start Batch</Link>
        <Link to="/pipeline" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50">View Pipeline</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify at localhost:3001**

- [ ] **Step 5: Commit**

```bash
git add ui/ && git commit -m "feat(ui): overview page — KPIs, funnel, recent evaluations"
```

---

## Sprint 5 — Pipeline Page

### Task 7: Pipeline page

**Files:**
- Modify: `ui/src/pages/Pipeline.tsx`

- [ ] **Step 1: Build Pipeline page**

```tsx
// ui/src/pages/Pipeline.tsx
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { parsePipeline, type PipelineEntry } from '@/lib/parsers/pipeline'

const STATUSES = ['all', 'pending', 'done', 'skipped']

export function Pipeline() {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.pipeline().then(({ content }) => setEntries(parsePipeline(content)))
  }, [])

  const sources = ['all', ...Array.from(new Set(entries.map(e => e.source))).sort()]

  const visible = entries.filter(e => {
    if (hidden.has(e.url)) return false
    if (e.done || e.skipped) return false
    if (filter && !`${e.company} ${e.role}`.toLowerCase().includes(filter.toLowerCase())) return false
    if (source !== 'all' && e.source !== source) return false
    return true
  })

  async function mark(url: string, action: 'done' | 'skip') {
    setHidden(h => new Set([...h, url]))
    await api.markPipeline(url, action)
  }

  async function bulkSkip() {
    const urls = Array.from(selected)
    setSelected(new Set())
    await Promise.all(urls.map(url => mark(url, 'skip')))
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visible.map(e => e.url)) : new Set())
  }

  const pending = entries.filter(e => !e.done && !e.skipped && !hidden.has(e.url)).length

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Pipeline</h1>
        <p className="text-sm text-stone-400 mt-0.5">{pending} pending evaluations</p>
      </div>

      <div className="flex gap-2">
        <input type="text" placeholder="Filter by company or role…" value={filter}
          onChange={e => setFilter(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-stone-400" />
        <select value={source} onChange={e => setSource(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm focus:outline-none">
          {sources.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-stone-900 text-white rounded text-xs">
          <span>{selected.size} selected</span>
          <button onClick={bulkSkip} className="ml-auto px-2 py-1 bg-white/10 rounded hover:bg-white/20">Skip selected</button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">Clear</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="w-8 px-3 py-2 text-left">
                <input type="checkbox" onChange={e => toggleAll(e.target.checked)} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Company</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Role</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Source</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {visible.map(e => (
              <tr key={e.url} className="hover:bg-stone-50/50">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(e.url)} onChange={() => {
                    setSelected(s => { const n = new Set(s); n.has(e.url) ? n.delete(e.url) : n.add(e.url); return n })
                  }} />
                </td>
                <td className="px-3 py-2 font-medium text-stone-800">{e.company}</td>
                <td className="px-3 py-2 text-stone-600">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.role}</a>
                </td>
                <td className="px-3 py-2 text-xs text-stone-400">{e.source}</td>
                <td className="px-3 py-2">
                  <button onClick={() => mark(e.url, 'skip')}
                    className="px-2 py-1 text-xs border border-stone-200 rounded hover:bg-stone-50">
                    Skip
                  </button>
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

- [ ] **Step 2: Verify at localhost:3001/pipeline**

- [ ] **Step 3: Commit**

```bash
git add ui/ && git commit -m "feat(ui): pipeline page with filter + bulk skip"
```

---

## Sprint 6 — Tracker Page

### Task 8: Tracker page

**Files:**
- Modify: `ui/src/pages/Tracker.tsx`

- [ ] **Step 1: Build Tracker page**

```tsx
// ui/src/pages/Tracker.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { ScoreBadge } from '@/components/ScoreBadge'

const STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP']

type SortKey = 'date' | 'score' | 'company'

export function Tracker() {
  const [apps, setApps] = useState<Application[]>([])
  const [localStatus, setLocalStatus] = useState<Record<number, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    api.applications().then(({ content }) => setApps(parseApplications(content)))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...apps].sort((a, b) => {
    const cmp =
      sortKey === 'date' ? a.date.localeCompare(b.date) :
      sortKey === 'score' ? (a.score ?? 0) - (b.score ?? 0) :
      a.company.localeCompare(b.company)
    return sortDir === 'asc' ? cmp : -cmp
  })

  async function handleStatus(app: Application, status: string) {
    setLocalStatus(s => ({ ...s, [app.number]: status }))
    await api.updateStatus(app.number, status)
  }

  const Th = ({ label, k }: { label: string; k?: SortKey }) => (
    <th onClick={() => k && toggleSort(k)}
        className={`px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide ${k ? 'cursor-pointer hover:text-stone-800 select-none' : ''}`}>
      {label}{k && sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Tracker</h1>
        <p className="text-sm text-stone-400 mt-0.5">{apps.length} applications</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <Th label="#" />
              <Th label="Date" k="date" />
              <Th label="Company" k="company" />
              <Th label="Role" />
              <Th label="Score" k="score" />
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
                    <select value={status} onChange={e => handleStatus(app, e.target.value)}
                            className="text-xs border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {app.reportNumber
                      ? <Link to={`/reports/${app.reportNumber}`} className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2">#{app.reportNumber}</Link>
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
    </div>
  )
}
```

- [ ] **Step 2: Verify at localhost:3001/tracker**

- [ ] **Step 3: Commit**

```bash
git add ui/ && git commit -m "feat(ui): tracker page with sortable table + inline status"
```

---

## Sprint 7 — Reports

### Task 9: Reports index + report viewer

**Files:**
- Modify: `ui/src/pages/Reports.tsx`
- Modify: `ui/src/pages/Report.tsx`

- [ ] **Step 1: Build Reports index**

```tsx
// ui/src/pages/Reports.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parseReport } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

export function Reports() {
  const [reports, setReports] = useState<Array<{ id: string; company: string; role: string; score: number | null; date: string }>>([])

  useEffect(() => {
    api.reports().then(async ({ files }) => {
      const parsed = await Promise.all(files.map(async filename => {
        const id = filename.split('-')[0]
        const { content } = await api.report(id)
        const r = parseReport(id, content)
        return { id, company: r.company, role: r.role, score: r.score, date: r.date }
      }))
      setReports(parsed)
    })
  }, [])

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Reports</h1>
        <p className="text-sm text-stone-400">{reports.length} evaluation reports</p>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-50">
        {reports.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-stone-400">No reports yet.</div>
        )}
        {reports.map(r => (
          <Link key={r.id} to={`/reports/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
            <span className="text-xs text-stone-300 w-8">#{r.id}</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-stone-800">{r.company}</span>
              <span className="text-stone-400 ml-2 text-sm truncate">{r.role}</span>
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

- [ ] **Step 2: Build Report detail page**

```tsx
// ui/src/pages/Report.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/lib/api'
import { parseReport, type Report as ReportType } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

const BLOCK_LABELS: Record<string, string> = {
  A: 'Role Summary', B: 'CV Match', C: 'Proof Points',
  D: 'Questions', E: 'Flags', F: 'Recommendation', G: 'Legitimacy',
}

export function Report() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ReportType | null>(null)
  const [allIds, setAllIds] = useState<string[]>([])

  useEffect(() => {
    if (!id) return
    api.report(id).then(({ content }) => setReport(parseReport(id, content)))
    api.reports().then(({ files }) => setAllIds(files.map(f => f.split('-')[0]).reverse()))
  }, [id])

  if (!report) return <div className="text-stone-400 text-sm">Loading…</div>

  const idx = allIds.indexOf(id!)
  const prevId = allIds[idx + 1]
  const nextId = allIds[idx - 1]

  return (
    <div className="max-w-5xl flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{report.company}</h1>
            <p className="text-stone-500 mt-0.5">{report.role}</p>
            <div className="flex gap-3 mt-2 text-xs text-stone-400">
              <span>{report.date}</span>
              {report.archetype && <span>{report.archetype}</span>}
              {report.legitimacy && <span>{report.legitimacy}</span>}
            </div>
          </div>
          <ScoreBadge score={report.score} />
        </div>

        <div className="flex gap-2 mb-4">
          {report.jobUrl && (
            <a href={report.jobUrl} target="_blank" rel="noopener noreferrer"
               className="px-3 py-1.5 text-xs border border-stone-200 rounded hover:bg-stone-50">
              Open Job URL ↗
            </a>
          )}
        </div>

        <div className="flex justify-between text-xs text-stone-400 mb-6">
          {prevId ? <Link to={`/reports/${prevId}`} className="hover:text-stone-700">← #{prevId}</Link> : <span />}
          {nextId ? <Link to={`/reports/${nextId}`} className="hover:text-stone-700">#{nextId} →</Link> : <span />}
        </div>

        <div className="prose prose-stone prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.rawContent}</ReactMarkdown>
        </div>
      </div>

      <div className="w-40 shrink-0">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Sections</div>
        <div className="space-y-1.5">
          {Object.entries(BLOCK_LABELS).map(([key, label]) =>
            report.sections[key] ? (
              <div key={key} className="bg-white border border-stone-200 rounded p-2">
                <div className="text-xs font-semibold text-stone-700">{key}</div>
                <div className="text-xs text-stone-400 mt-0.5">{label}</div>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify both pages at localhost:3001/reports**

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): reports index + single report viewer"
```

---

## Sprint 8 — Actions Console

### Task 10: Actions page with live SSE output

**Files:**
- Create: `ui/src/components/ActionConsole.tsx`
- Modify: `ui/src/pages/Actions.tsx`

- [ ] **Step 1: Create `ActionConsole.tsx`**

```tsx
// ui/src/components/ActionConsole.tsx
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
  const [exitCode, setExitCode] = useState<number | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  function start() {
    setLines([]); setExitCode(null); setRunning(true)
    const qs = new URLSearchParams(params).toString()
    const es = new EventSource(qs ? `${endpoint}?${qs}` : endpoint)
    esRef.current = es
    es.onmessage = e => { const { line } = JSON.parse(e.data); setLines(p => [...p, line]) }
    es.addEventListener('done', e => {
      setExitCode(JSON.parse((e as MessageEvent).data).code)
      setRunning(false); es.close()
    })
    es.onerror = () => { setRunning(false); es.close() }
  }

  function stop() { esRef.current?.close(); setRunning(false) }

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <div className="font-semibold text-stone-800 text-sm">{title}</div>
          <div className="text-xs text-stone-400">{description}</div>
        </div>
        {running
          ? <button onClick={stop} className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Stop</button>
          : <button onClick={start} className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded hover:bg-stone-700">Run</button>
        }
      </div>
      {children && <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">{children}</div>}
      <div className="bg-stone-950 font-mono text-xs text-stone-300 h-40 overflow-y-auto p-3">
        {lines.length === 0 && !running && <span className="text-stone-600">Ready — press Run</span>}
        {lines.map((l, i) => <div key={i}>{l}</div>)}
        {exitCode !== null && (
          <div className={`mt-2 ${exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Exited {exitCode}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build Actions page**

```tsx
// ui/src/pages/Actions.tsx
import { useState } from 'react'
import { ActionConsole } from '@/components/ActionConsole'

export function Actions() {
  const [parallel, setParallel] = useState('2')
  const [startFrom, setStartFrom] = useState('0')
  const [minScore, setMinScore] = useState('0')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Actions</h1>
        <p className="text-sm text-stone-400 mt-0.5">Trigger CLI operations and watch live output</p>
      </div>

      <ActionConsole title="Run Scan" description="Scan all configured portals for new job listings" endpoint="/api/stream/scan" />

      <ActionConsole title="Batch Evaluation" description="Evaluate pending jobs with AI workers"
        endpoint="/api/stream/batch" params={{ parallel, startFrom, minScore }}>
        <div className="flex gap-4 text-xs">
          {[
            { label: 'Workers', val: parallel, set: setParallel, type: 'select', opts: ['1','2','3','4','5'] },
            { label: 'Start from', val: startFrom, set: setStartFrom, type: 'number' },
            { label: 'Min score', val: minScore, set: setMinScore, type: 'number', step: '0.1' },
          ].map(({ label, val, set, type, opts, step }) => (
            <label key={label} className="flex items-center gap-1.5 text-stone-600">
              {label}
              {type === 'select'
                ? <select value={val} onChange={e => set(e.target.value)} className="border border-stone-200 rounded px-1.5 py-0.5">
                    {opts!.map(o => <option key={o}>{o}</option>)}
                  </select>
                : <input type="number" step={step} value={val} onChange={e => set(e.target.value)}
                         className="border border-stone-200 rounded px-1.5 py-0.5 w-16" />
              }
            </label>
          ))}
        </div>
      </ActionConsole>

      <ActionConsole title="Merge Tracker" description="Merge batch additions into applications.md, then verify" endpoint="/api/stream/merge" />
    </div>
  )
}
```

- [ ] **Step 3: Verify at localhost:3001/actions — Run Scan streams output**

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): actions console with SSE streaming"
```

---

## Sprint 9 — Patterns + Command Palette

### Task 11: Patterns page

**Files:**
- Create: `ui/src/components/charts/ScoreHistogram.tsx`
- Create: `ui/src/components/charts/FunnelChart.tsx`
- Modify: `ui/src/pages/Patterns.tsx`

- [ ] **Step 1: Create `ScoreHistogram.tsx`**

```tsx
// ui/src/components/charts/ScoreHistogram.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Application } from '@/lib/parsers/applications'

const BUCKETS = [
  { range: '1.0–1.9', min: 1.0, max: 2.0, color: '#a8a29e' },
  { range: '2.0–2.9', min: 2.0, max: 3.0, color: '#a8a29e' },
  { range: '3.0–3.4', min: 3.0, max: 3.5, color: '#a8a29e' },
  { range: '3.5–3.9', min: 3.5, max: 4.0, color: '#f59e0b' },
  { range: '4.0–4.4', min: 4.0, max: 4.5, color: '#10b981' },
  { range: '4.5–5.0', min: 4.5, max: 5.01, color: '#059669' },
]

export function ScoreHistogram({ apps }: { apps: Application[] }) {
  const data = BUCKETS.map(b => ({
    range: b.range, color: b.color,
    count: apps.filter(a => a.score !== null && a.score >= b.min && a.score < b.max).length,
  }))

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Score distribution</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="range" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <Tooltip formatter={(v: number) => [v, 'Jobs']} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Create `FunnelChart.tsx`**

```tsx
// ui/src/components/charts/FunnelChart.tsx
export function FunnelChart({ evaluated, applied, responded, interview, offer }: {
  evaluated: number; applied: number; responded: number; interview: number; offer: number
}) {
  const max = evaluated || 1
  const stages = [
    { label: 'Evaluated', count: evaluated, color: 'bg-stone-200' },
    { label: 'Applied',   count: applied,   color: 'bg-stone-400' },
    { label: 'Responded', count: responded,  color: 'bg-amber-400' },
    { label: 'Interview', count: interview,  color: 'bg-emerald-400' },
    { label: 'Offer',     count: offer,      color: 'bg-emerald-600' },
  ]
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

- [ ] **Step 3: Build Patterns page**

```tsx
// ui/src/pages/Patterns.tsx
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { ScoreHistogram } from '@/components/charts/ScoreHistogram'
import { FunnelChart } from '@/components/charts/FunnelChart'

export function Patterns() {
  const [apps, setApps] = useState<Application[]>([])

  useEffect(() => {
    api.patterns().then(({ content }) => setApps(parseApplications(content)))
  }, [])

  const by = (...statuses: string[]) => apps.filter(a => statuses.includes(a.status)).length

  const companies = Object.entries(
    apps.reduce<Record<string, number[]>>((acc, a) => {
      acc[a.company] = [...(acc[a.company] ?? []), ...(a.score !== null ? [a.score] : [])]
      return acc
    }, {})
  ).map(([name, scores]) => ({
    name, count: apps.filter(a => a.company === name).length,
    avg: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null,
  })).sort((a, b) => b.count - a.count).slice(0, 15)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Patterns</h1>
        <p className="text-sm text-stone-400">{apps.length} evaluations</p>
      </div>

      {apps.length === 0
        ? <div className="bg-white border border-stone-200 rounded-lg px-4 py-8 text-center text-sm text-stone-400">No evaluations yet.</div>
        : <>
            <div className="grid grid-cols-2 gap-4">
              <ScoreHistogram apps={apps} />
              <FunnelChart evaluated={apps.length}
                applied={by('Applied','Responded','Interview','Offer')}
                responded={by('Responded','Interview','Offer')}
                interview={by('Interview','Offer')}
                offer={by('Offer')} />
            </div>

            <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Top companies</span>
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
                      <td className="px-4 py-2 text-right text-xs font-semibold">
                        {c.avg !== null
                          ? <span className={c.avg >= 4 ? 'text-emerald-600' : c.avg >= 3.5 ? 'text-amber-600' : 'text-stone-400'}>{c.avg.toFixed(1)}</span>
                          : <span className="text-stone-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
      }
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): patterns page — histogram, funnel, company table"
```

---

### Task 12: ⌘K Command Palette

**Files:**
- Create: `ui/src/components/CommandPalette.tsx`
- Modify: `ui/src/components/Layout.tsx`

- [ ] **Step 1: Create `CommandPalette.tsx`**

```tsx
// ui/src/components/CommandPalette.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'

const COMMANDS = [
  { id: 'nav-overview',  label: 'Go to Overview',     group: 'Navigate', to: '/' },
  { id: 'nav-pipeline',  label: 'Go to Pipeline',     group: 'Navigate', to: '/pipeline' },
  { id: 'nav-tracker',   label: 'Go to Tracker',      group: 'Navigate', to: '/tracker' },
  { id: 'nav-reports',   label: 'Go to Reports',      group: 'Navigate', to: '/reports' },
  { id: 'nav-actions',   label: 'Go to Actions',      group: 'Navigate', to: '/actions' },
  { id: 'nav-patterns',  label: 'Go to Patterns',     group: 'Navigate', to: '/patterns' },
  { id: 'run-scan',      label: 'Run Scan',            group: 'Actions',  to: '/actions' },
  { id: 'run-batch',     label: 'Start Batch Eval',   group: 'Actions',  to: '/actions' },
  { id: 'run-merge',     label: 'Merge Tracker',      group: 'Actions',  to: '/actions' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/20" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white border border-stone-200 rounded-xl shadow-2xl overflow-hidden">
        <Command>
          <Command.Input placeholder="Search or run a command…"
            className="w-full px-4 py-3 text-sm border-b border-stone-100 focus:outline-none" autoFocus />
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-stone-400">No results.</Command.Empty>
            {['Navigate', 'Actions'].map(group => (
              <Command.Group key={group}>
                <div className="px-3 py-1 text-xs font-semibold text-stone-400 uppercase tracking-wide">{group}</div>
                {COMMANDS.filter(c => c.group === group).map(cmd => (
                  <Command.Item key={cmd.id} value={cmd.label}
                    onSelect={() => { setOpen(false); navigate(cmd.to) }}
                    className="flex items-center px-3 py-2 text-sm text-stone-700 cursor-pointer rounded mx-1 data-[selected=true]:bg-stone-100">
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

- [ ] **Step 2: Add CommandPalette to Layout**

```tsx
// ui/src/components/Layout.tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <CommandPalette />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Verify ⌘K opens palette**

- [ ] **Step 4: Commit**

```bash
git add ui/ && git commit -m "feat(ui): ⌘K command palette"
```

---

## Sprint 10 — Polish & Ship

### Task 13: Build verification + README

**Files:** All

- [ ] **Step 1: Run all tests**

```bash
cd ui && npm test
# All parser tests PASS
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
# Fix any type errors before proceeding
```

- [ ] **Step 3: Production build**

```bash
npm run build && npm start
# Visit http://localhost:3002 — all pages load without a separate Vite dev server
```

- [ ] **Step 4: Final commit**

```bash
git add . && git commit -m "feat(ui): career-ops web UI complete"
```

---

## How to run

```bash
# Development (hot reload)
cd ui && npm install && npm run dev
# → Vite on http://localhost:3001
# → Express on http://localhost:3002

# Production
cd ui && npm run build && npm start
# → Everything served from http://localhost:3002
```
