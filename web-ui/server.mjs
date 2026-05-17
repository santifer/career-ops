import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const app = express()
app.use(cors())
app.use(express.json())

// --- Parsers ---

function parseApplications() {
  const file = path.join(ROOT, 'data', 'applications.md')
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const apps = []
  for (const line of lines) {
    if (!line.startsWith('|')) continue
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0)
    if (cols.length < 9) continue
    if (cols[0] === '#' || cols[0].startsWith('-')) continue
    const num = parseInt(cols[0])
    if (isNaN(num)) continue
    const scoreMatch = cols[4].match(/(\d+\.?\d*)\/5/)
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0
    const reportMatch = cols[7].match(/\[(\d+)\]\(([^)]+)\)/)
    apps.push({
      number: num,
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score,
      scoreRaw: cols[4],
      status: cols[5].toLowerCase(),
      hasPDF: cols[6].includes('✅'),
      reportNumber: reportMatch ? reportMatch[1] : null,
      reportPath: reportMatch ? reportMatch[2] : null,
      notes: cols[8] || '',
    })
  }
  return apps.reverse()
}

function enrichFromReport(app) {
  if (!app.reportPath) return app
  const reportFile = path.join(ROOT, app.reportPath)
  if (!fs.existsSync(reportFile)) return app
  const head = fs.readFileSync(reportFile, 'utf8').slice(0, 2000)
  const urlMatch = head.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/)
  const tldrMatch = head.match(/\*\*TL;DR:\*\*\s*(.+)/)
  const remoteMatch = head.match(/\*\*Remote:\*\*\s*(.+)/)
  const compMatch = head.match(/\*\*Comp:\*\*\s*(.+)/)
  const recMatch = head.match(/\*\*Recommendation:\*\*\s*(.+)/)
  return {
    ...app,
    jobURL: urlMatch ? urlMatch[1].trim() : null,
    tldr: tldrMatch ? tldrMatch[1].trim() : null,
    remote: remoteMatch ? remoteMatch[1].trim() : null,
    compEstimate: compMatch ? compMatch[1].trim() : null,
    recommendation: recMatch ? recMatch[1].replace(/\*\*/g, '').trim() : null,
  }
}

function parsePipeline() {
  const file = path.join(ROOT, 'data', 'pipeline.md')
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const items = []
  let section = 'General'
  for (const line of lines) {
    if (line.startsWith('## ')) { section = line.replace('## ', '').trim(); continue }
    if (line.startsWith('### ')) { section = line.replace('### ', '').trim(); continue }
    const unchecked = line.match(/^- \[ \]\s+(.+)/)
    const checked = line.match(/^- \[x\]\s+(.+)/i)
    if (unchecked || checked) {
      const content = (unchecked || checked)[1]
      const parts = content.split('|').map(p => p.trim())
      items.push({
        url: parts[0] || '',
        company: parts[1] || '',
        role: parts[2] || '',
        section,
        done: !!checked,
        raw: line,
      })
    }
  }
  return items
}

function parseFollowUps() {
  const file = path.join(ROOT, 'data', 'follow-ups.md')
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '# Follow-ups\n\n| # | Company | Role | Applied Date | Last Contact | Next Action | Due Date | Notes |\n|---|---------|------|--------------|--------------|-------------|----------|-------|\n')
    return []
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const items = []
  for (const line of lines) {
    if (!line.startsWith('|')) continue
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0)
    if (cols.length < 8) continue
    if (cols[0] === '#' || cols[0].startsWith('-')) continue
    const num = parseInt(cols[0])
    if (isNaN(num)) continue
    items.push({
      number: num,
      company: cols[1],
      role: cols[2],
      appliedDate: cols[3],
      lastContact: cols[4],
      nextAction: cols[5],
      dueDate: cols[6],
      notes: cols[7] || '',
    })
  }
  return items
}

// --- Routes ---

app.get('/api/applications', (req, res) => {
  const apps = parseApplications().map(enrichFromReport)
  res.json(apps)
})

app.get('/api/pipeline', (req, res) => {
  res.json(parsePipeline())
})

app.get('/api/followups', (req, res) => {
  res.json(parseFollowUps())
})

app.get('/api/report/:num', (req, res) => {
  const num = req.params.num.padStart(3, '0')
  const dir = path.join(ROOT, 'reports')
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No reports directory' })
  const files = fs.readdirSync(dir)
  const match = files.find(f => f.startsWith(num + '-'))
  if (!match) return res.status(404).json({ error: 'Report not found' })
  const content = fs.readFileSync(path.join(dir, match), 'utf8')
  res.json({ content, filename: match })
})

app.get('/api/profile', (req, res) => {
  const file = path.join(ROOT, 'config', 'profile.yml')
  if (!fs.existsSync(file)) return res.json({})
  try {
    const data = yaml.load(fs.readFileSync(file, 'utf8'))
    res.json(data)
  } catch {
    res.json({})
  }
})

app.get('/api/storybank', (req, res) => {
  const file = path.join(ROOT, 'interview-prep', 'story-bank.md')
  if (!fs.existsSync(file)) return res.json({ content: '# Story Bank\n\nNo stories yet. Run a job evaluation to populate this.' })
  res.json({ content: fs.readFileSync(file, 'utf8') })
})

app.get('/api/interview-files', (req, res) => {
  const dir = path.join(ROOT, 'interview-prep')
  if (!fs.existsSync(dir)) return res.json([])
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'story-bank.md')
  res.json(files)
})

app.get('/api/interview-file/:name', (req, res) => {
  const file = path.join(ROOT, 'interview-prep', req.params.name)
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' })
  res.json({ content: fs.readFileSync(file, 'utf8') })
})

app.patch('/api/applications/:num', (req, res) => {
  const num = parseInt(req.params.num)
  const { status, notes } = req.body
  const file = path.join(ROOT, 'data', 'applications.md')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  let updated = false
  const newLines = lines.map(line => {
    if (!line.startsWith('|')) return line
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0)
    if (cols.length < 9) return line
    if (parseInt(cols[0]) !== num) return line
    if (status !== undefined) cols[5] = status.charAt(0).toUpperCase() + status.slice(1)
    if (notes !== undefined) cols[8] = notes
    updated = true
    return '| ' + cols.join(' | ') + ' |'
  })
  if (!updated) return res.status(404).json({ error: 'Application not found' })
  fs.writeFileSync(file, newLines.join('\n'))
  res.json({ ok: true })
})

app.post('/api/followups', (req, res) => {
  const { company, role, appliedDate, nextAction, dueDate, notes } = req.body
  const file = path.join(ROOT, 'data', 'follow-ups.md')
  const existing = parseFollowUps()
  const num = existing.length + 1
  const today = new Date().toISOString().slice(0, 10)
  const row = `| ${num} | ${company} | ${role} | ${appliedDate || today} | ${today} | ${nextAction || 'Follow up'} | ${dueDate || ''} | ${notes || ''} |`
  fs.appendFileSync(file, row + '\n')
  res.json({ ok: true })
})

app.listen(3099, () => console.log('career-ops API running on http://localhost:3099'))
