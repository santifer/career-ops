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
