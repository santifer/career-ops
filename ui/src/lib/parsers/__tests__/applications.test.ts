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
