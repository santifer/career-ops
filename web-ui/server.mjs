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


// --- Recruiter Find ---

const rfJobs = new Map() // jobId -> { lines, done, error, clients }

app.post('/api/recruiter-find', (req, res) => {
  const { scenario, input, context: ctx } = req.body
  if (!scenario || !input) return res.status(400).json({ error: 'scenario and input required' })

  const jobId = randomUUID()
  const job = { lines: [], done: false, error: null, clients: new Set() }
  rfJobs.set(jobId, job)

  const prompt = `HEADLESS MODE: You are running as a background worker from the career-ops web UI. Read modes/recruiter-find.md for the full workflow instructions.

The user has provided the following for recruiter outreach:

Scenario: ${scenario}
Input: ${input}
Additional context: ${ctx || 'None provided'}

Run the recruiter-find mode now. Output the connection note (with character count), follow-up message, and search queries (if Scenario B). Do not log anything to data/follow-ups.md — the UI will handle that after the user confirms they sent the message.`

  const child = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions'], {
    cwd: ROOT,
    env: { ...process.env },
  })
  child.stdin.write(prompt)
  child.stdin.end()

  const push = (line) => {
    job.lines.push(line)
    for (const client of job.clients) client.write(`data: ${JSON.stringify({ line })}

`)
  }

  const stripAnsi = s => s.replace(/\[[0-9;]*m/g, '')
  child.stdout.on('data', d => d.toString().split('
').filter(Boolean).forEach(l => push(stripAnsi(l))))
  child.stderr.on('data', d => d.toString().split('
').filter(Boolean).forEach(l => push(`⚠ ${stripAnsi(l)}`)))

  child.on('close', (code) => {
    job.done = true
    job.error = code !== 0 ? `Process exited with code ${code}` : null
    const msg = job.error ? `data: ${JSON.stringify({ done: true, error: job.error })}

`
                           : `data: ${JSON.stringify({ done: true })}

`
    for (const client of job.clients) { client.write(msg); client.end() }
    job.clients.clear()
    setTimeout(() => rfJobs.delete(jobId), 10 * 60 * 1000)
  })

  res.json({ jobId })
})

app.get('/api/recruiter-find/:jobId/stream', (req, res) => {
  const job = rfJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  for (const line of job.lines) res.write(`data: ${JSON.stringify({ line })}

`)

  if (job.done) {
    res.write(`data: ${JSON.stringify({ done: true, error: job.error })}

`)
    return res.end()
  }

  job.clients.add(res)
  req.on('close', () => job.clients.delete(res))
})

// --- New routes ---

// POST /api/pipeline — add a new URL to pipeline.md
app.post('/api/pipeline', (req, res) => {
  const { url, company = '', role = '' } = req.body
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Invalid URL' })
  const pipelineFile = path.join(ROOT, 'data', 'pipeline.md')
  let content = ''
  try { content = fs.readFileSync(pipelineFile, 'utf8') } catch { content = '# Pipeline\n\n## Pending\n\n' }
  const parts = [url, company, role].filter(Boolean)
  const line = `- [ ] ${parts.join(' | ')}\n`
  const sectionIdx = content.indexOf('\n## ')
  if (sectionIdx !== -1) {
    const afterHeader = content.indexOf('\n', sectionIdx + 1) + 1
    content = content.slice(0, afterHeader) + line + content.slice(afterHeader)
  } else {
    content += line
  }
  fs.writeFileSync(pipelineFile, content)
  res.json({ ok: true })
})

// DELETE /api/followups/:num — remove a follow-up row
app.delete('/api/followups/:num', (req, res) => {
  const num = parseInt(req.params.num, 10)
  const followupsFile = path.join(ROOT, 'data', 'follow-ups.md')
  if (!fs.existsSync(followupsFile)) return res.json({ ok: true })
  const lines = fs.readFileSync(followupsFile, 'utf8').split('\n')
  const filtered = lines.filter(line => {
    const cols = line.split('|').map(c => c.trim())
    if (cols.length < 3) return true
    return parseInt(cols[1], 10) !== num
  })
  fs.writeFileSync(followupsFile, filtered.join('\n'))
  res.json({ ok: true })
})

// POST /api/scan — trigger scan.mjs
const scanJobs = new Map()
app.post('/api/scan', (req, res) => {
  const { company } = req.body || {}
  const jobId = randomUUID()
  const args = ['scan.mjs', ...(company ? ['--company', company] : [])]
  const child = spawn('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  const job = { lines: [], done: false, error: null, clients: new Set() }
  scanJobs.set(jobId, job)
  function pushScanLine(line) {
    job.lines.push(line)
    const msg = `data: ${JSON.stringify({ line })}\n\n`
    for (const client of job.clients) client.write(msg)
  }
  child.stdout.on('data', d => String(d).split('\n').filter(Boolean).forEach(pushScanLine))
  child.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => pushScanLine(`⚠ ${l}`)))
  child.on('close', code => {
    job.done = true
    job.error = code !== 0 ? `Exited with code ${code}` : null
    const msg = `data: ${JSON.stringify({ done: true, error: job.error })}\n\n`
    for (const client of job.clients) { client.write(msg); client.end() }
    job.clients.clear()
    setTimeout(() => scanJobs.delete(jobId), 10 * 60 * 1000)
  })
  res.json({ jobId })
})

app.get('/api/scan/:jobId/stream', (req, res) => {
  const job = scanJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  for (const line of job.lines) res.write(`data: ${JSON.stringify({ line })}\n\n`)
  if (job.done) {
    res.write(`data: ${JSON.stringify({ done: true, error: job.error })}\n\n`)
    return res.end()
  }
  job.clients.add(res)
  req.on('close', () => job.clients.delete(res))
})

// GET /api/patterns — run analyze-patterns.mjs and return JSON
app.get('/api/patterns', (req, res) => {
  const child = spawn('node', ['analyze-patterns.mjs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', d => out += d)
  child.stderr.on('data', d => err += d)
  child.on('close', code => {
    if (code !== 0) return res.status(500).json({ error: err || `Exited ${code}` })
    try { res.json(JSON.parse(out)) }
    catch { res.status(500).json({ error: 'JSON parse failed', raw: out.slice(0, 500) }) }
  })
})

// POST /api/batch — spawn N parallel evaluate jobs
app.post('/api/batch', (req, res) => {
  const { urls } = req.body
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls required' })
  const jobIds = urls.map(url => {
    const jobId = randomUUID()
    const prompt = `Evaluate this job posting: ${url}\n\nFollow the full auto-pipeline: fetch the JD, run all evaluation blocks (A-G), save the report, generate the PDF if score >= 3.0, and update the tracker.`
    const args = ['-p', '--output-format', 'text', '--dangerously-skip-permissions']
    const child = spawn('claude', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.write(prompt)
    child.stdin.end()
    const job = { lines: [], done: false, error: null, clients: new Set() }
    jobs.set(jobId, job)
    function pushLine(line) {
      job.lines.push(line)
      const msg = `data: ${JSON.stringify({ line })}\n\n`
      for (const client of job.clients) client.write(msg)
    }
    child.stdout.on('data', d => String(d).split('\n').filter(Boolean).forEach(pushLine))
    child.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => pushLine(`⚠ ${l}`)))
    child.on('close', code => {
      job.done = true
      job.error = code !== 0 ? `Exited with code ${code}` : null
      const msg = `data: ${JSON.stringify({ done: true, error: job.error })}\n\n`
      for (const client of job.clients) { client.write(msg); client.end() }
      job.clients.clear()
      setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000)
    })
    return jobId
  })
  res.json({ jobIds })
})

// POST /api/pdf/:num — generate PDF for an application via claude pdf mode
const pdfJobs = new Map()
app.post('/api/pdf/:num', (req, res) => {
  const num = req.params.num
  const jobId = randomUUID()
  const prompt = `Generate a tailored PDF CV for report number ${num}. Read modes/pdf.md and follow it completely. Read the report matching number ${num} from the reports/ directory, read cv.md, then generate the PDF.`
  const args = ['-p', '--output-format', 'text', '--dangerously-skip-permissions']
  const child = spawn('claude', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin.write(prompt)
  child.stdin.end()
  const job = { lines: [], done: false, error: null, clients: new Set() }
  pdfJobs.set(jobId, job)
  function pushPdfLine(line) {
    job.lines.push(line)
    const msg = `data: ${JSON.stringify({ line })}\n\n`
    for (const client of job.clients) client.write(msg)
  }
  child.stdout.on('data', d => String(d).split('\n').filter(Boolean).forEach(pushPdfLine))
  child.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => pushPdfLine(`⚠ ${l}`)))
  child.on('close', code => {
    job.done = true
    job.error = code !== 0 ? `Exited with code ${code}` : null
    const msg = `data: ${JSON.stringify({ done: true, error: job.error })}\n\n`
    for (const client of job.clients) { client.write(msg); client.end() }
    job.clients.clear()
    setTimeout(() => pdfJobs.delete(jobId), 10 * 60 * 1000)
  })
  res.json({ jobId })
})

app.get('/api/pdf/:jobId/stream', (req, res) => {
  const job = pdfJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  for (const line of job.lines) res.write(`data: ${JSON.stringify({ line })}\n\n`)
  if (job.done) {
    res.write(`data: ${JSON.stringify({ done: true, error: job.error })}\n\n`)
    return res.end()
  }
  job.clients.add(res)
  req.on('close', () => job.clients.delete(res))
})

app.listen(3099, () => console.log('career-ops API running on http://localhost:3099'))
