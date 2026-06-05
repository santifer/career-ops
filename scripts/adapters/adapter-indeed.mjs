/**
 * adapter-indeed.mjs — Parses Indeed MCP markdown response into PulseJob[]
 *
 * Input format (one or more jobs, separated by blank lines):
 *
 *   **Job Title:** Scrum Master
 *   **Job Id:** JOBSEARCH_34
 *   **Company:** Inclusion Cloud
 *   **Location:** Dallas, TX
 *   **Posted on:** February 27, 2026
 *   **Job Type:** N/A
 *   **Compensation:** $74,081.75 - $109,476.32 a year
 *   **View Job URL:** https://to.indeed.com/aabngnw26yq7
 *
 * Usage:
 *   import { parseIndeedMD } from './adapter-indeed.mjs';
 *   const jobs = parseIndeedMD(markdownText);
 */

const MONTH_MAP = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** Parse "February 27, 2026" or "June 04, 2026" → ISO string */
function parsePostedDate(raw) {
  if (!raw || raw.trim() === 'N/A') return null;
  const m = raw.trim().match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[1].toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Date.UTC(parseInt(m[3]), month, parseInt(m[2])));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse "$74,081.75 - $109,476.32 a year" or "$130,000" → { min, max } */
function parseSalary(raw) {
  if (!raw || raw.trim() === 'N/A') return { min: null, max: null };
  const clean = raw.replace(/,/g, '');
  // Range: $X - $Y
  const range = clean.match(/\$(\d+(?:\.\d+)?)\s*[-–]\s*\$(\d+(?:\.\d+)?)/);
  if (range) {
    return {
      min: parseFloat(range[1]),
      max: parseFloat(range[2]),
    };
  }
  // Single: $X
  const single = clean.match(/\$(\d+(?:\.\d+)?)/);
  if (single) {
    return { min: parseFloat(single[1]), max: null };
  }
  return { min: null, max: null };
}

/** Extract a field value from a **Key:** Value line */
function field(lines, key) {
  const prefix = `**${key}:**`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      const val = trimmed.slice(prefix.length).trim();
      return val === 'N/A' || val === '' ? null : val;
    }
  }
  return null;
}

/**
 * Parse an Indeed MCP markdown response into an array of PulseJob objects.
 * @param {string} markdown - Raw MCP markdown output
 * @param {string} [ingestedAt] - Override ingestion timestamp (default: now)
 * @returns {import('../ingest-runner.mjs').PulseJob[]}
 */
export function parseIndeedMD(markdown, ingestedAt) {
  const now = ingestedAt || new Date().toISOString();
  if (!markdown || !markdown.trim()) return [];

  // Split on blank lines between job blocks
  const blocks = markdown
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.includes('**Job Title:**') || b.includes('**Job Id:**'));

  const jobs = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    const title   = field(lines, 'Job Title');
    const id      = field(lines, 'Job Id');
    const company = field(lines, 'Company');
    const location = field(lines, 'Location');
    const postedRaw = field(lines, 'Posted on');
    const jobType   = field(lines, 'Job Type');
    const compRaw   = field(lines, 'Compensation');
    const url       = field(lines, 'View Job URL');

    // Required fields — skip if missing
    if (!title || !id || !company || !url) continue;

    const salary = parseSalary(compRaw);

    jobs.push({
      source:          'indeed',
      external_id:     id,
      title:           title,
      company:         company,
      location:        location || 'Remote',
      url:             url,
      posted_at:       parsePostedDate(postedRaw) || now,
      ingested_at:     now,
      state:           'new',
      salary_min:      salary.min,
      salary_max:      salary.max,
      employment_type: jobType,
      remote:          location ? /\bremote\b/i.test(location) : true,
      summary:         null,
      company_logo_url: null,
      easy_apply:      null,
      score:           null,
      has_connection:  false,
      verified:        false,
    });
  }

  return jobs;
}
