#!/usr/bin/env node
/**
 * referral-check.mjs
 * Cross-references a company name against Rahil's LinkedIn connections.
 *
 * Usage:
 *   node referral-check.mjs "Company Name"
 *
 * Output: JSON with isReferral (bool) and matching connections
 * Exit code: 0 = referral found, 1 = no referral match
 *
 * Requires: data/connections.js (copy connections-db.js here)
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONNECTIONS_PATH = join(__dirname, 'data', 'connections.js')

function loadConnections() {
  if (!existsSync(CONNECTIONS_PATH)) {
    process.stderr.write(
      '[referral-check] connections.js not found at ' + CONNECTIONS_PATH + '\n' +
      '[referral-check] Copy connections-db.js to data/connections.js\n'
    )
    return []
  }
  const raw = readFileSync(CONNECTIONS_PATH, 'utf8')
  const match = raw.match(/const\s+\w+\s*=\s*(\[[\s\S]*\]);?\s*$/)
  if (!match) {
    process.stderr.write('[referral-check] Could not parse connections array\n')
    return []
  }
  try {
    return JSON.parse(match[1])
  } catch (e) {
    process.stderr.write('[referral-check] JSON parse failed: ' + e.message + '\n')
    return []
  }
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(inc|llc|corp|ltd|co|group|holdings|solutions|services|technologies|technology|consulting|global|north america|na)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function checkReferral(companyName) {
  const connections = loadConnections()
  const target = normalize(companyName)
  const targetWords = target.split(' ').filter(w => w.length > 2)

  const matches = connections.filter(c => {
    const conn = normalize(c.company)
    if (!conn) return false
    // Direct substring match
    if (conn.includes(target) || target.includes(conn)) return true
    // Word overlap match (2+ shared meaningful words)
    const connWords = conn.split(' ').filter(w => w.length > 2)
    const overlap = targetWords.filter(w => connWords.includes(w))
    return overlap.length >= Math.min(2, targetWords.length)
  })

  return {
    companyName,
    normalizedQuery: target,
    isReferral: matches.length > 0,
    matchCount: matches.length,
    matches: matches.map(m => ({
      name: m.name,
      position: m.position,
      company: m.company,
      linkedinUrl: m.linkedinUrl || null,
      email: m.email || null,
      connectedOn: m.connectedOn || null
    }))
  }
}

const company = process.argv[2]
if (!company) {
  process.stderr.write('Usage: node referral-check.mjs "Company Name"\n')
  process.exit(2)
}

const result = checkReferral(company)
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
process.exit(result.isReferral ? 0 : 1)
