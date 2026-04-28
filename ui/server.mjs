import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3002
const ROOT = process.env.CAREER_OPS_PATH
  ? path.resolve(process.env.CAREER_OPS_PATH)
  : path.resolve(__dirname, '..')

app.use(cors())
app.use(express.json())

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dataFile(name) { return path.join(ROOT, 'data', name) }
function reportsDir() { return path.join(ROOT, 'reports') }
function read(filePath) { return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '' }

// ── Read endpoints ────────────────────────────────────────────────────────────

app.get('/api/pipeline', (_req, res) => {
  res.json({ content: read(dataFile('pipeline.md')) })
})

app.get('/api/applications', (_req, res) => {
  res.json({ content: read(dataFile('applications.md')) })
})

app.get('/api/scan-history', (_req, res) => {
  res.json({ content: read(dataFile('scan-history.tsv')) })
})

app.get('/api/reports', (_req, res) => {
  const dir = reportsDir()
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
    : []
  res.json({ files })
})

app.get('/api/reports/:id', (req, res) => {
  const dir = reportsDir()
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'reports dir not found' })
  const file = fs.readdirSync(dir).find(f => f.startsWith(req.params.id))
  if (!file) return res.status(404).json({ error: 'report not found' })
  res.json({ content: fs.readFileSync(path.join(dir, file), 'utf-8'), filename: file })
})

app.get('/api/patterns', (_req, res) => {
  const content = read(dataFile('applications.md'))
  res.json({ content })
})

// ── Mutation endpoints ────────────────────────────────────────────────────────

app.patch('/api/applications/:number', (req, res) => {
  const rowNum = parseInt(req.params.number, 10)
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'status required' })

  const filePath = dataFile('applications.md')
  const lines = read(filePath).split('\n')
  let found = false

  const updated = lines.map(line => {
    const m = /^\|\s*(\d+)\s*\|/.exec(line)
    if (!m || parseInt(m[1], 10) !== rowNum) return line
    found = true
    const cells = line.split('|')
    cells[6] = ` ${status} `
    return cells.join('|')
  }).join('\n')

  if (!found) return res.status(404).json({ error: `Row ${rowNum} not found` })
  fs.writeFileSync(filePath, updated, 'utf-8')
  res.json({ ok: true })
})

app.patch('/api/pipeline', (req, res) => {
  const { url, action } = req.body
  if (!url || !['done', 'skip'].includes(action)) {
    return res.status(400).json({ error: 'url and action (done|skip) required' })
  }
  const marker = action === 'done' ? 'x' : '-'
  const filePath = dataFile('pipeline.md')
  const lines = read(filePath).split('\n')
  let found = false

  const updated = lines.map(line => {
    if (!line.includes(url) || !/^- \[[ x-]\]/.test(line.trim())) return line
    found = true
    return line.replace(/^(\s*- )\[[ x-]\]/, `$1[${marker}]`)
  }).join('\n')

  if (!found) return res.status(404).json({ error: 'URL not found in pipeline.md' })
  fs.writeFileSync(filePath, updated, 'utf-8')
  res.json({ ok: true })
})

// ── SSE streaming endpoints ───────────────────────────────────────────────────

function sseStream(res, command, args) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const child = spawn(command, args, { cwd: ROOT })

  const send = chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  }

  child.stdout.on('data', send)
  child.stderr.on('data', send)
  child.on('close', code => {
    res.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`)
    res.end()
  })

  res.on('close', () => child.kill('SIGTERM'))
}

app.get('/api/stream/scan', (_req, res) => {
  sseStream(res, 'node', ['scan.mjs'])
})

app.get('/api/stream/batch', (req, res) => {
  const { parallel = '2', startFrom = '0', minScore = '0' } = req.query
  const args = ['batch/batch-runner.sh', '--parallel', parallel, '--start-from', startFrom]
  if (parseFloat(minScore) > 0) args.push('--min-score', minScore)
  sseStream(res, 'bash', args)
})

app.get('/api/stream/merge', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  }

  const merge = spawn('node', ['merge-tracker.mjs'], { cwd: ROOT })
  merge.stdout.on('data', send)
  merge.stderr.on('data', send)
  merge.on('close', code => {
    if (code !== 0) {
      res.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`)
      return res.end()
    }
    const verify = spawn('node', ['verify-pipeline.mjs'], { cwd: ROOT })
    verify.stdout.on('data', send)
    verify.stderr.on('data', send)
    verify.on('close', vCode => {
      res.write(`event: done\ndata: ${JSON.stringify({ code: vCode })}\n\n`)
      res.end()
    })
  })

  res.on('close', () => merge.kill('SIGTERM'))
})

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

app.listen(PORT, () => console.log(`career-ops api ready on :${PORT}`))
