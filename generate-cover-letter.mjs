#!/usr/bin/env node
/**
 * generate-cover-letter.mjs — Renders a cover letter payload to PDF.
 *
 * Usage:
 *   node generate-cover-letter.mjs --payload payload.json
 *   node generate-cover-letter.mjs --payload payload.json --out output/slug-cover.pdf
 *
 * Fills templates/cover-letter-template.html (EN) or
 * templates/cover-letter-de-template.html (DE, DIN 5008) with the payload,
 * then renders it to PDF via the same Playwright pipeline used for CVs.
 *
 * Template selection: set `payload.locale` to "de" for the German template.
 * Any other value (or absent) falls back to the English template.
 *
 * `buildHtml` and `buildHtmlDe` are exported as pure functions so templates
 * can be tested without loading Playwright (renderHtmlToPdf is imported
 * lazily inside main).
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, basename, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

const OUTPUT_ROOT = resolve("output");

function safeOutputPath(raw) {
  const filename = basename(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
  return join(OUTPUT_ROOT, filename);
}

function _require(obj, keys, context) {
  for (const key of keys) {
    if (!obj || typeof obj !== "object" || !(key in obj)) {
      throw new Error(`Missing required field: ${context}.${key}`);
    }
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function buildContactLine(candidate) {
  const parts = [];
  if (candidate.location) parts.push(escapeHtml(candidate.location));
  if (candidate.email) {
    const email = escapeHtml(candidate.email);
    parts.push(`<a href="mailto:${email}">${email}</a>`);
  }
  if (candidate.phone) parts.push(escapeHtml(candidate.phone));
  if (candidate.linkedin) {
    parts.push(`<a href="${escapeHtml(asUrl(candidate.linkedin))}">LinkedIn</a>`);
  }
  if (candidate.github) {
    const display = candidate.github.replace(/^https?:\/\//, "");
    parts.push(`<a href="${escapeHtml(asUrl(candidate.github))}">${escapeHtml(display)}</a>`);
  }
  return parts.join(" &nbsp;|&nbsp; ");
}

function buildCredentialsBlock(candidate) {
  const credentials = candidate.credentials || [];
  if (!credentials.length) return "";
  return `<div class="credentials">${credentials.map(escapeHtml).join(" &nbsp;|&nbsp; ")}</div>`;
}

function buildDateline(letter) {
  const parts = [letter.company, letter.city, letter.date].filter(Boolean).map(escapeHtml);
  return parts.join(" &nbsp;&nbsp; ");
}

function buildAchievementsBlock(achievements) {
  if (!achievements || !achievements.length) return "";
  const items = achievements.map(ach => {
    const lead = escapeHtml(ach.lead || "");
    const impact = escapeHtml(ach.impact || "");
    return `    <li><b>${lead},</b> ${impact}</li>`;
  }).join("\n");
  return `<ul class="achievements">\n${items}\n  </ul>`;
}

function buildFootnotesBlock(footnotes) {
  if (!footnotes || !footnotes.length) return "";
  const lines = footnotes.map(fn => {
    if (typeof fn === "object" && fn !== null) {
      const marker = escapeHtml(fn.marker || "");
      const text = escapeHtml(fn.text || "");
      const url = fn.url
        ? ` <a href="${escapeHtml(fn.url)}">${escapeHtml(fn.url)}</a>`
        : "";
      return `    <p>${marker} ${text}${url}</p>`;
    }
    return `    <p>${escapeHtml(fn)}</p>`;
  }).join("\n");
  return `<div class="footnotes">\n${lines}\n  </div>`;
}

// ── German (DIN 5008) template helpers ──

function buildSenderAddressBlock(candidate) {
  const lines = [];
  if (candidate.street) lines.push(escapeHtml(candidate.street));
  if (candidate.zip_city) lines.push(escapeHtml(candidate.zip_city));
  return lines.map(l => `<div>${l}</div>`).join("\n    ");
}

function buildSenderContactBlock(candidate) {
  const parts = [];
  if (candidate.phone) parts.push(`<a href="tel:${escapeHtml(candidate.phone)}">${escapeHtml(candidate.phone)}</a>`);
  if (candidate.email) {
    const email = escapeHtml(candidate.email);
    parts.push(`<a href="mailto:${email}">${email}</a>`);
  }
  if (candidate.linkedin) {
    const display = candidate.linkedin.replace(/^https?:\/\//, "").replace(/\/$/, "");
    parts.push(`<a href="${escapeHtml(asUrl(candidate.linkedin))}">${escapeHtml(display)}</a>`);
  }
  if (candidate.github) {
    const display = candidate.github.replace(/^https?:\/\//, "").replace(/\/$/, "");
    parts.push(`<a href="${escapeHtml(asUrl(candidate.github))}">${escapeHtml(display)}</a>`);
  }
  if (candidate.location) parts.push(`<span>${escapeHtml(candidate.location)}</span>`);
  return parts.join('\n      <span class="separator">|</span>\n      ');
}

function buildEvidenceBlock(evidence) {
  if (!evidence || !evidence.length) return "";
  const items = evidence.map(e => {
    const label = escapeHtml(e.label || "");
    const text = escapeHtml(e.text || "");
    return `    <li><strong>${label}:</strong> ${text}</li>`;
  }).join("\n");
  return `  <p class="evidence-intro">${escapeHtml(evidence._intro || "")}</p>\n  <ul class="evidence">\n${items}\n  </ul>`;
}

function buildRecipientBlock(recipient) {
  if (!recipient) return "";
  const lines = [];
  if (recipient.company) lines.push(escapeHtml(recipient.company));
  if (recipient.department) lines.push(escapeHtml(recipient.department));
  if (recipient.salutation_name) lines.push(escapeHtml(recipient.salutation_name));
  if (recipient.street) lines.push(escapeHtml(recipient.street));
  if (recipient.zip_city) lines.push(escapeHtml(recipient.zip_city));
  return lines.map(l => `<div>${l}</div>`).join("\n    ");
}

function buildAnlagenBlock(anlagen) {
  if (!anlagen || !anlagen.length) return "";
  const items = anlagen.map(a => `      <li>${escapeHtml(a)}</li>`).join("\n");
  return `  <div class="anlagen">\n    <div class="anlagen-title">Anlagen</div>\n    <ul class="anlagen-list">\n${items}\n    </ul>\n  </div>`;
}

function buildSignatureImageBlock(candidate) {
  if (!candidate.signature) return "";
  const src = escapeHtml(candidate.signature);
  return `<img class="signature-image" src="${src}" alt="Unterschrift">`;
}

function buildPostskriptumBlock(ps) {
  if (!ps) return "";
  return `  <div class="postskriptum">PS: ${escapeHtml(ps)}</div>`;
}

/**
 * Build HTML from the German DIN-5008 cover letter template.
 * Payload shape documented in modes/de/cover.md Step 11.
 */
export function buildHtmlDe(payload) {
  _require(payload, ["candidate", "letter"], "payload");
  const candidate = payload.candidate;
  const letter = payload.letter;
  _require(candidate, ["name"], "candidate");
  _require(letter, ["opening"], "letter");

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = resolve(scriptDir, "templates", "cover-letter-de-template.html");
  let html = readFileSync(templatePath, "utf-8");

  const dateLine = [letter.city, letter.date].filter(Boolean).map(escapeHtml).join(", ");

  const evidenceBlock = Array.isArray(letter.evidence)
    ? buildEvidenceBlock(Object.assign(letter.evidence, { _intro: letter.evidence_intro || "" }))
    : "";

  const replacements = {
    "{{NAME}}": escapeHtml(candidate.name),
    "{{SENDER_ADDRESS_BLOCK}}": buildSenderAddressBlock(candidate),
    "{{SENDER_CONTACT_BLOCK}}": buildSenderContactBlock(candidate),
    "{{RECIPIENT_BLOCK}}": buildRecipientBlock(payload.recipient),
    "{{DATE_LINE}}": dateLine,
    "{{BETREFF}}": escapeHtml(letter.betreff || `Bewerbung als ${letter.role_title || ""}`),
    "{{ANREDE}}": escapeHtml(letter.anrede || "Sehr geehrte Damen und Herren,"),
    "{{OPENING}}": escapeHtml(letter.opening),
    "{{QUALIFICATIONS}}": escapeHtml(letter.qualifications || ""),
    "{{EVIDENCE_BLOCK}}": evidenceBlock,
    "{{VALUE_PROPOSITION}}": escapeHtml(letter.value_proposition || ""),
    "{{ADMINISTRATIVE_CLOSE}}": escapeHtml(letter.administrative_close || ""),
    "{{GRUSSFORMEL}}": escapeHtml(letter.grussformel || "Mit freundlichen Grüßen"),
    "{{SIGNATURE_IMAGE_BLOCK}}": buildSignatureImageBlock(candidate),
    "{{PRINTED_NAME}}": escapeHtml(letter.printed_name || candidate.name),
    "{{ANLAGEN_BLOCK}}": buildAnlagenBlock(letter.anlagen),
    "{{POSTSKRIPTUM_BLOCK}}": buildPostskriptumBlock(letter.postskriptum),
    "{{FOOTNOTES_BLOCK}}": buildFootnotesBlock(letter.footnotes),
  };

  return html.replace(/\{\{[A-Z_]+\}\}/g, (token) => replacements[token] ?? token);
}

/**
 * Build HTML from the English cover letter template (original behavior).
 */
export function buildHtml(payload) {
  _require(payload, ["candidate", "letter"], "payload");

  if (payload.locale === "de") return buildHtmlDe(payload);

  const candidate = payload.candidate;
  const letter = payload.letter;
  _require(candidate, ["name"], "candidate");
  _require(letter, ["role_title", "opening", "profile_intro"], "letter");

  const scriptDir = dirname(fileURLToPath(import.meta.url));

  const templatePath = resolve(scriptDir, "templates", "cover-letter-template.html");
  let html = readFileSync(templatePath, "utf-8");

  const greetingBlock = letter.greeting ? `<p class="greeting">${escapeHtml(letter.greeting)}</p>` : "";
  const closingBlock = letter.closing ? `<p>${escapeHtml(letter.closing)}</p>` : "";
  const languageClosingBlock = letter.language_closing
    ? `<p class="language-closing">${escapeHtml(letter.language_closing)}</p>`
    : "";
  const problemsBlock = letter.problems_section ? `<p>${escapeHtml(letter.problems_section)}</p>` : "";

  const replacements = {
    "{{NAME}}": escapeHtml(candidate.name),
    "{{CONTACT_LINE}}": buildContactLine(candidate),
    "{{CREDENTIALS_BLOCK}}": buildCredentialsBlock(candidate),
    "{{ROLE_TITLE}}": escapeHtml(letter.role_title),
    "{{DATELINE}}": buildDateline(letter),
    "{{GREETING_BLOCK}}": greetingBlock,
    "{{OPENING}}": escapeHtml(letter.opening),
    "{{PROFILE_INTRO}}": escapeHtml(letter.profile_intro),
    "{{ACHIEVEMENTS_BLOCK}}": buildAchievementsBlock(letter.achievements),
    "{{PROBLEMS_BLOCK}}": problemsBlock,
    "{{CLOSING_BLOCK}}": closingBlock,
    "{{LANGUAGE_CLOSING_BLOCK}}": languageClosingBlock,
    "{{FOOTNOTES_BLOCK}}": buildFootnotesBlock(letter.footnotes),
  };

  return html.replace(/\{\{[A-Z_]+\}\}/g, (token) => replacements[token] ?? token);
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      payload: { type: "string" },
      out:     { type: "string" },
      help:    { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (args.help || !args.payload) {
    console.log(`
Usage:
  node generate-cover-letter.mjs --payload payload.json [--out output/path.pdf]

  --payload   Path to the JSON payload file (required)
  --out       Override output path from payload (optional)
`);
    process.exit(args.help ? 0 : 1);
  }

  const payloadPath = resolve(args.payload);
  if (!existsSync(payloadPath)) {
    console.error(`ERROR: payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));

  if (args.out) {
    payload.output_path = args.out;
  }

  if (!payload.output_path) {
    const company = (payload.letter?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const role    = (payload.letter?.role_title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    payload.output_path = join(OUTPUT_ROOT, `${company}-${role}-cover.pdf`);
  } else {
    payload.output_path = safeOutputPath(payload.output_path);
  }

  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  // Imported lazily so buildHtml can be used (and tested) without Playwright.
  const { renderHtmlToPdf } = await import("./generate-pdf.mjs");

  try {
    const html = buildHtml(payload);
    const outputPath = resolve(payload.output_path);
    await renderHtmlToPdf(html, outputPath, { format: "a4" });
    console.log(`\nCover letter PDF: ${payload.output_path}`);
  } catch (err) {
    console.error("ERROR generating cover letter PDF:");
    console.error(err.message);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
