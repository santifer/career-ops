#!/usr/bin/env node
/**
 * cover-format-policy.mjs — Pure decision logic for which cover-letter rendering
 * to attach for a given application channel.
 *
 * One approved letter renders to several formats (see generate-cover-formats.mjs):
 *   • pdf   — polished HTML template (visual, the HUMAN format)
 *   • docx  — Word document (the MACHINE format: most reliable ATS parsing)
 *   • md    — canonical markdown (paste boxes, not a file upload)
 *
 * Why DOCX is the portal default (researched 2026):
 *   DOCX parses more reliably than PDF across every major ATS — Workday,
 *   Greenhouse, Lever, iCIMS and especially Taleo (whose PDF parser garbles
 *   text). Measured DOCX vs PDF parse quality: 100/98, 100/95, 100/90, 98/85,
 *   95/80 respectively; plain DOCX ~4% failure vs PDF ~18%. Text-based PDFs are
 *   "acceptable" but DOCX is strictly safer for any field that goes through a
 *   parser. Direct email skips the parser, so a human-facing channel gets the
 *   polished PDF (hiring managers prefer receiving PDF and formatting is kept).
 *   If a posting/field specifies a format, that always wins.
 *
 * `chooseCoverFormat` is a pure function (no I/O) so it can be unit-tested and
 * reused at both authoring time (modes/cover.md) and apply time (form-fill.mjs).
 *
 * Defaults can be overridden per-user via config/profile.yml:
 *   cover_letter:
 *     format_policy:
 *       portal_default: docx     # docx | pdf  — what to upload when a field accepts both
 *       human_channels: [email, direct, human, hiring-manager]
 */

export const DEFAULT_COVER_POLICY = {
  // What to upload to a portal field that accepts both Word and PDF.
  portal_default: "docx",
  // Channel hints that mean a human reads the file directly (no ATS parser).
  human_channels: ["email", "direct", "human", "hiring-manager"],
};

function lc(value) {
  return String(value ?? "").toLowerCase();
}

/**
 * Does the field's `accept` attribute allow a Word document?
 * An empty/unspecified accept means "anything" → Word is allowed.
 */
export function acceptAllowsDocx(accept) {
  const a = lc(accept);
  if (!a.trim()) return true;
  return a.includes(".docx") || a.includes(".doc") || a.includes("officedocument") || a.includes("msword");
}

/**
 * Does the field's `accept` attribute allow a PDF?
 * An empty/unspecified accept means "anything" → PDF is allowed.
 */
export function acceptAllowsPdf(accept) {
  const a = lc(accept);
  if (!a.trim()) return true;
  return a.includes(".pdf") || a.includes("application/pdf");
}

/**
 * Decide which cover-letter format to attach.
 *
 * @param {object} signals
 * @param {string} [signals.accept]  — the file input's `accept` attribute
 * @param {string} [signals.host]    — application host (URL hostname), reserved for future per-host rules
 * @param {string} [signals.channel] — 'email' | 'direct' | 'human' | '' (portal upload when empty)
 * @param {object} [policy]          — overrides merged over DEFAULT_COVER_POLICY
 * @returns {{ format: 'pdf'|'docx', reason: string }}
 */
export function chooseCoverFormat(signals = {}, policy = {}) {
  const p = { ...DEFAULT_COVER_POLICY, ...(policy || {}) };
  const { accept = "", channel = "" } = signals;
  const ch = lc(channel);

  // 1. Human reads the file directly (e.g. emailed) → polished PDF.
  if (p.human_channels.map(lc).includes(ch)) {
    return { format: "pdf", reason: `human channel (${ch})` };
  }

  // 2. Portal field that restricts to PDF only → polished PDF (text-based, single column).
  if (!acceptAllowsDocx(accept) && acceptAllowsPdf(accept)) {
    return { format: "pdf", reason: "field accepts PDF only" };
  }

  // 3. Portal field that restricts to Word only → DOCX.
  if (acceptAllowsDocx(accept) && !acceptAllowsPdf(accept)) {
    return { format: "docx", reason: "field accepts Word only" };
  }

  // 4. Portal upload that accepts both (or is unspecified) → DOCX is the safer parse.
  return {
    format: p.portal_default === "pdf" ? "pdf" : "docx",
    reason: "portal upload (parser-facing)",
  };
}

/**
 * Fallback order for a decided format, used when the preferred rendering was not
 * generated (e.g. pandoc unavailable so no .docx). Each format degrades to the
 * next-best available one. Markdown is never auto-attached (it is a paste copy).
 *
 * @param {'pdf'|'docx'} format
 * @returns {string[]}
 */
export function formatFallbackOrder(format) {
  switch (format) {
    case "docx": return ["docx", "pdf"];
    case "pdf":
    default:     return ["pdf", "docx"];
  }
}
