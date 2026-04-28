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
