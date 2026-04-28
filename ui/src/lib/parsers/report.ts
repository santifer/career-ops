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

// Matches "Evaluation:" (EN) and "Evaluación:" / "Evaluacion:" (ES)
const HEADING_RE = /^#\s+(?:Evaluaci[oó]n|Evaluation):\s+(.+?)\s+[—–]\s+(.+)$/im

function meta(content: string, ...keys: string[]): string {
  for (const key of keys) {
    const m = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, 'm').exec(content)
    if (m) return m[1].trim()
  }
  return ''
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
    date: meta(content, 'Date', 'Fecha'),
    archetype: meta(content, 'Archetype', 'Arquetipo'),
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    legitimacy: meta(content, 'Legitimacy'),
    jobUrl: meta(content, 'URL') || null,
    pdfPath: meta(content, 'PDF') || null,
    sections,
    rawContent: content,
  }
}
