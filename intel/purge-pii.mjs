// PII purge utilities for career-ops intelligence engine.
// Finds, evaluates, and redacts PII-tagged content in markdown files.

const PII_TAG_RE = /<!--\s*PII:\s*(.+?),\s*(.+?),\s*(\d{4}-\d{2}-\d{2})\s*-->/g;

/**
 * Find all PII tags in markdown content.
 * Returns array of { name, source, date } objects.
 */
export function findPIITags(markdown) {
  if (!markdown) return [];
  const results = [];
  let match;
  // Reset regex state
  PII_TAG_RE.lastIndex = 0;
  while ((match = PII_TAG_RE.exec(markdown)) !== null) {
    results.push({
      name: match[1].trim(),
      source: match[2].trim(),
      date: match[3].trim(),
    });
  }
  return results;
}

/**
 * Check if a date string is older than retentionDays from now.
 */
export function isOlderThan(dateStr, retentionDays, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const date = new Date(dateStr);
  return date < cutoff;
}

/**
 * Redact PII blocks for a given target date.
 * Removes content between <!-- PII: ... targetDate --> and <!-- END PII -->.
 */
export function redactPII(markdown, targetDate) {
  if (!markdown) return markdown;
  const escapedDate = targetDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<!--\\s*PII:\\s*.+?,\\s*.+?,\\s*${escapedDate}\\s*-->[\\s\\S]*?<!--\\s*END PII\\s*-->`,
    'g'
  );
  return markdown.replace(re, `<!-- PII REDACTED: ${targetDate} -->`);
}
