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
