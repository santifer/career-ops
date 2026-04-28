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
