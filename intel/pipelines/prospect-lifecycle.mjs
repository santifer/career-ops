// Prospect lifecycle manager for career-ops intelligence engine.
// Parses prospects.md sections, expires stale entries, compacts old ones, serializes back.

const SECTION_RE = /^##\s+(.+)$/;
const TABLE_ROW_RE = /^\|\s*(.+?)\s*\|$/;
const HEADER_SEP_RE = /^\|[\s-:|]+\|$/;

const SECTIONS_ORDER = ['New', 'Reviewed', 'Dismissed', 'Expired'];

/**
 * Parse a single table row into a prospect object.
 * Expected columns: num | found | company | role | why | angle | source | url
 */
function parseRow(line) {
  const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
  if (cells.length < 8) return null;
  return {
    num: cells[0],
    found: cells[1],
    company: cells[2],
    role: cells[3],
    why: cells[4],
    angle: cells[5],
    source: cells[6],
    url: cells[7],
  };
}

/**
 * Parse prospects markdown into sections with arrays of prospect objects.
 * Returns { New: [...], Reviewed: [...], Dismissed: [...], Expired: [...] }
 */
export function parseProspects(markdown) {
  const sections = {};
  for (const s of SECTIONS_ORDER) sections[s] = [];

  if (!markdown) return sections;

  let currentSection = null;
  let headerSeen = false;

  for (const line of markdown.split('\n')) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      if (SECTIONS_ORDER.includes(name)) {
        currentSection = name;
        headerSeen = false;
      }
      continue;
    }

    if (!currentSection) continue;

    // Skip table header row and separator
    if (HEADER_SEP_RE.test(line)) {
      headerSeen = true;
      continue;
    }

    if (!headerSeen && TABLE_ROW_RE.test(line)) {
      // This is the header row (column names), skip
      headerSeen = false; // will be set by separator
      continue;
    }

    if (headerSeen && TABLE_ROW_RE.test(line)) {
      const prospect = parseRow(line);
      if (prospect) {
        sections[currentSection].push(prospect);
      }
    }
  }

  return sections;
}

/**
 * Move prospects older than cutoffDays from 'New' to 'Expired'.
 * Compares found date to now.
 */
export function expireProspects(sections, cutoffDays = 30, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - cutoffDays);

  const stillNew = [];
  for (const p of sections.New) {
    const foundDate = new Date(p.found);
    if (foundDate < cutoff) {
      sections.Expired.push(p);
    } else {
      stillNew.push(p);
    }
  }
  sections.New = stillNew;
  return sections;
}

/**
 * Remove expired entries older than retentionDays (default 90).
 */
export function compactProspects(sections, retentionDays = 90, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - retentionDays);

  sections.Expired = sections.Expired.filter(p => {
    const foundDate = new Date(p.found);
    return foundDate >= cutoff;
  });
  return sections;
}

/**
 * Serialize sections back to markdown.
 */
export function serializeProspects(sections) {
  const header = '| # | Found | Company | Role | Why | Angle | Source | URL |';
  const sep = '|---|-------|---------|------|-----|-------|--------|-----|';

  const parts = ['# Prospects\n'];
  for (const section of SECTIONS_ORDER) {
    parts.push(`## ${section}\n`);
    parts.push(header);
    parts.push(sep);
    for (const p of (sections[section] || [])) {
      parts.push(`| ${p.num} | ${p.found} | ${p.company} | ${p.role} | ${p.why} | ${p.angle} | ${p.source} | ${p.url} |`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
