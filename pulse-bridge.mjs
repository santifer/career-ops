#!/usr/bin/env node
/**
 * pulse-bridge.mjs
 * Reads career-ops scan results and injects new job cards into
 * the Pulse Engine Kanban HTML (job-pulse-kanban.html).
 *
 * Reads:  reports/*.json (career-ops scan output)
 *         data/connections.js (for referral detection)
 * Writes: data/pending-cards.json (picked up by Kanban on next load)
 *
 * The Kanban checks for pending-cards.json on startup and merges
 * any new cards into the appropriate lane.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = join(__dirname, 'reports')
const OUTPUT_FILE = join(__dirname, 'data', 'pending-cards.json')
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function getRecentReports() {
  if (!existsSync(REPORTS_DIR)) return []
  const cutoff = Date.now() - TWO_HOURS_MS
  return readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(REPORTS_DIR, f))
    .filter(p => statSync(p).mtimeMs > cutoff)
}

function gradeToLane(grade) {
  switch (grade) {
    case 'A': return 'identified'
    case 'B': return 'identified'
    case 'C': return 'identified'
    default:  return 'archive'
  }
}

function buildCard(job, isReferral) {
  const now = new Date().toISOString().split('T')[0]
  return {
    id: `bridge-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    title: job.title || 'Untitled Role',
    company: job.company || 'Unknown',
    url: job.url || '',
    grade: job.grade || 'C',
    lane: isReferral ? 'referral' : gradeToLane(job.grade),
    isReferral,
    source: 'auto-scan',
    addedDate: now,
    referralContacts: job.referralContacts || []
  }
}

async function main() {
  const reports = getRecentReports()
  console.log(`[pulse-bridge] Found ${reports.length} recent report(s)`)

  if (reports.length === 0) {
    console.log('[pulse-bridge] Nothing to bridge.')
    return
  }

  const cards = []

  for (const reportPath of reports) {
    let data
    try {
      data = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch (e) {
      console.error('[pulse-bridge] Failed to parse', reportPath, e.message)
      continue
    }

    // Normalize: report may be single job or array
    const jobs = Array.isArray(data) ? data : [data]

    for (const job of jobs) {
      if (!job.company || !job.title) continue

      // Check referral via referral-check.mjs output (already run in pipeline)
      const isReferral = job.lane === 'referral' || job.isReferral || false
      const card = buildCard(job, isReferral)
      cards.push(card)
      console.log(`[pulse-bridge] Queued: [${card.grade}${isReferral ? ' REFERRAL' : ''}] ${card.title} @ ${card.company}`)
    }
  }

  // Write pending cards for Kanban to pick up
  const existing = existsSync(OUTPUT_FILE)
    ? JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'))
    : []

  const merged = [...existing, ...cards]
  writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2))
  console.log(`[pulse-bridge] Wrote ${cards.length} card(s) to pending-cards.json (${merged.length} total pending)`)
}

main().catch(e => {
  console.error('[pulse-bridge] Fatal:', e.message)
  process.exit(1)
})
