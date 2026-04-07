// Schema version checker for career-ops intelligence engine.
// Extracts and compares schema version comments in markdown files.
// Advisory only — never blocks operations.

const SCHEMA_RE = /<!--\s*SCHEMA_VERSION:\s*(\d+)\s*-->/;

/**
 * Extract schema version number from a markdown string.
 * Looks for <!-- SCHEMA_VERSION: N --> comment.
 * Returns the version number or null if not found.
 */
export function extractSchemaVersion(markdown) {
  if (!markdown) return null;
  const match = markdown.match(SCHEMA_RE);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check compatibility between a file's schema version and the expected version.
 * Treats null (missing version) as version 1.
 * Returns { compatible: true } or { compatible: false, message: "..." }.
 */
export function checkCompatibility(fileVersion, expectedVersion) {
  const effective = fileVersion ?? 1;
  const expected = expectedVersion ?? 1;

  if (effective === expected) {
    return { compatible: true };
  }

  return {
    compatible: false,
    message: `Schema version mismatch: file is v${effective}, expected v${expected}. This is advisory only.`,
  };
}
