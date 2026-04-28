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
