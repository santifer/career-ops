import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'

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

app.patch('/api/pipeline', (req, res) => {
  const { url, done } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  const file = path.join(ROOT, 'data', 'pipeline.md')
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'pipeline.md not found' })
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  let updated = false
  const newLines = lines.map(line => {
    if (!line.includes(url)) return line
    if (done && line.match(/^- \[ \]/)) { updated = true; return line.replace('- [ ]', '- [x]') }
    if (!done && line.match(/^- \[x\]/i)) { updated = true; return line.replace(/^- \[x\]/i, '- [ ]') }
    return line
  })
  if (!updated) return res.status(404).json({ error: 'Item not found' })
  fs.writeFileSync(file, newLines.join('\n'))
  res.json({ ok: true })
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

// --- Evaluate ---

const jobs = new Map() // jobId -> { lines: string[], done: bool, error: string|null, clients: Set<res> }

app.post('/api/evaluate', (req, res) => {
  const { url } = req.body
  if (!url || !/^https?:\/\/.+/.test(url)) return res.status(400).json({ error: 'Invalid URL' })

  const jobId = randomUUID()
  const job = { lines: [], done: false, error: null, clients: new Set() }
  jobs.set(jobId, job)

  // Headless mode: skip Playwright (no browser), use WebFetch fallback for verification.
  // Prompt is piped via stdin so claude -p doesn't wait for stdin data.
  const prompt = `HEADLESS MODE: You are running as a background worker spawned from the web UI. Playwright/browser is NOT available — use WebFetch for job posting verification and mark the report header with **Verification:** unconfirmed (batch mode). Do NOT open any browser windows or attempt interactive login.\n\nEvaluate this job posting: ${url}`
  const child = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions'], {
    cwd: ROOT,
    env: { ...process.env },
  })
  child.stdin.write(prompt)
  child.stdin.end()

  const push = (line) => {
    job.lines.push(line)
    for (const client of job.clients) {
      client.write(`data: ${JSON.stringify({ line })}\n\n`)
    }
  }

  const stripAnsi = s => s.replace(/\x1B\[[0-9;]*m/g, '')
  child.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => push(stripAnsi(l))))
  child.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => push(`⚠ ${stripAnsi(l)}`)))

  child.on('close', (code) => {
    job.done = true
    job.error = code !== 0 ? `Process exited with code ${code}` : null
    const msg = job.error ? `data: ${JSON.stringify({ done: true, error: job.error })}\n\n`
                           : `data: ${JSON.stringify({ done: true })}\n\n`
    for (const client of job.clients) { client.write(msg); client.end() }
    job.clients.clear()
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000)
  })

  res.json({ jobId })
})

app.get('/api/evaluate/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // replay buffered lines
  for (const line of job.lines) res.write(`data: ${JSON.stringify({ line })}\n\n`)

  if (job.done) {
    res.write(`data: ${JSON.stringify({ done: true, error: job.error })}\n\n`)
    return res.end()
  }

  job.clients.add(res)
  req.on('close', () => job.clients.delete(res))
})

app.listen(3099, () => console.log('career-ops API running on http://localhost:3099'))
