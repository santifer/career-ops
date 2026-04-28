import { parseReport } from '../report'

const SAMPLE = `# Evaluation: LangChain — Python OSS Engineer\n\n**Date:** 2026-04-26\n**Archetype:** AI Platform / LLMOps Engineer\n**Score:** 4.2/5\n**Legitimacy:** High Confidence\n**URL:** https://jobs.ashbyhq.com/langchain/abc\n**PDF:** output/001-langchain.pdf\n\n---\n\n## A) Role Summary\n\nGreat role.\n\n## B) Match with CV\n\nStrong fit.\n`

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
