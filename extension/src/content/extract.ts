/**
 * extract.ts — heuristic job-page detection and DOM text extraction.
 *
 * Called by chrome.scripting.executeScript from the background service
 * worker. Pure DOM — no network, no storage, no extension APIs.
 *
 * Detection is deliberately lightweight. The popup asks the user to
 * confirm before evaluating, so false positives are cheap. The heuristic
 * favors "yes this is a job posting" signals over strict exclusion.
 */

/**
 * When injected via chrome.scripting.executeScript({ files: ["content.js"] }),
 * this file runs as a self-contained IIFE in the page context. All
 * dependencies must be inlined — no imports from other modules.
 *
 * The result is returned via the script's return value, which Chrome
 * surfaces as results[0].result in the background worker.
 */

interface PageDetection {
  label: "job_posting" | "likely_job_posting" | "not_job_posting";
  confidence: number;
  signals: readonly string[];
}

type CaptureState = "ready" | "hydrating";

interface CapturedTab {
  tabId: number;
  url: string;
  title: string;
  pageText: string;
  detection: PageDetection;
  captureState: CaptureState;
  capturedAt: string;
}

const EXTRACT_MAX_CHARS = 10_000;
const MAX_SECTION_LINES = 24;
const MAX_LEAD_LINES = 12;
const MIN_SECTION_CHARS = 2_500;

const POSITIVE_KEYWORDS: readonly string[] = [
  "responsibilities",
  "requirements",
  "qualifications",
  "about the role",
  "about this role",
  "we're looking for",
  "what you'll do",
  "what you will do",
  "what we're looking for",
  "nice to have",
  "apply for this job",
  "apply now",
  "submit application",
  "years of experience",
];

const JOB_BOARD_HOSTS: readonly string[] = [
  "boards.greenhouse.io",
  "jobs.ashbyhq.com",
  "jobs.lever.co",
  "jobs.gem.com",
  "wellfound.com",
  "angel.co",
  "linkedin.com",
  "workable.com",
  "jobs.smartrecruiters.com",
  "workday",
  "remote.com",
  "remotefront",
  "jobright.ai",
];

/**
 * SPA root selectors — presence of one of these plus thin body text is a
 * strong hint that the page is mid-hydration (React/Next/Vue have barely
 * rendered past the app shell).
 */
const SPA_ROOT_SELECTORS: readonly string[] = [
  "#__next",
  "#root",
  "[data-reactroot]",
  "#app",
];

const HYDRATING_TEXT_THRESHOLD = 200;

function detectCaptureState(doc: Document, pageText: string): CaptureState {
  if (pageText.length >= HYDRATING_TEXT_THRESHOLD) return "ready";
  if (doc.readyState !== "complete") return "hydrating";
  for (const sel of SPA_ROOT_SELECTORS) {
    const root = doc.querySelector(sel);
    if (!root) continue;
    const rootText = (root as HTMLElement).innerText ?? root.textContent ?? "";
    if (rootText.trim().length < HYDRATING_TEXT_THRESHOLD) return "hydrating";
  }
  return "ready";
}

function scoreText(text: string): { hits: string[]; score: number } {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  let score = 0;
  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) {
      hits.push(`keyword:${kw}`);
      score += 1;
    }
  }
  return { hits, score };
}

function scoreHost(host: string): { hits: string[]; score: number } {
  const lower = host.toLowerCase();
  const hits: string[] = [];
  let score = 0;
  for (const h of JOB_BOARD_HOSTS) {
    if (lower.includes(h)) {
      hits.push(`host:${h}`);
      score += 3; // host is a strong signal
      break;
    }
  }
  return { hits, score };
}

function detect(host: string, text: string): PageDetection {
  const textResult = scoreText(text);
  const hostResult = scoreHost(host);
  const total = textResult.score + hostResult.score;
  const signals = [...hostResult.hits, ...textResult.hits];

  let label: PageDetection["label"];
  let confidence: number;
  if (total >= 6) {
    label = "job_posting";
    confidence = Math.min(0.95, 0.5 + total * 0.05);
  } else if (total >= 2) {
    label = "likely_job_posting";
    confidence = Math.min(0.75, 0.3 + total * 0.05);
  } else {
    label = "not_job_posting";
    confidence = Math.max(0.1, 0.3 - total * 0.05);
  }

  return { label, confidence, signals };
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushUniqueLine(target: string[], seen: Set<string>, line: string): void {
  const normalized = line.trim();
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(normalized);
}

function isHeading(line: string): boolean {
  if (!line) return false;
  if (line.length > 90) return false;
  if (/[:：]$/.test(line)) return true;
  if (/^[A-Z][A-Z\s/&-]{2,}$/.test(line)) return true;
  return /^(about|job description|responsibilities|requirements|qualifications|what you'll do|what we'?re looking for|preferred|benefits|compensation|salary|location|travel)\b/i.test(
    line
  );
}

function isRelevantHeading(line: string): boolean {
  return /^(about|job description|responsibilities|requirements|qualifications|what you'll do|what you will do|what we'?re looking for|preferred|nice to have|benefits|compensation|salary|location|travel)\b/i.test(
    line
  );
}

/**
 * Collects visible-ish text from an element tree without relying on
 * innerText. innerText requires layout and can return "" in many
 * Workday-like SPA states (hidden route caches, freshly-mounted nodes,
 * nodes inside display:none parents during transition). textContent is
 * layout-independent and survives those cases. We also descend into
 * open shadow roots, which Workday occasionally uses.
 */
function collectText(root: Element | ShadowRoot | Document): string {
  const parts: string[] = [];
  const walker = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.nodeValue ?? "").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) walker(sr);
    for (const child of Array.from(node.childNodes)) walker(child);
  };
  walker(root as Node);
  return parts.join("\n");
}

function extractRelevantJobText(doc: Document): string {
  const main =
    doc.querySelector("[data-automation-id='jobPostingPage']") ?? // Workday
    doc.querySelector("[data-automation-id='jobPostingDescription']") ??
    doc.querySelector("main") ??
    doc.querySelector("article") ??
    doc.body;
  if (!main) return "";

  // Prefer innerText when available (respects line-breaks from CSS), but
  // fall back to our walker when innerText is empty or unusable. This
  // is the single most common reason the old capture returned "no
  // result" on Workday-style pages.
  let raw = "";
  try {
    raw = (main as HTMLElement).innerText ?? "";
  } catch {
    raw = "";
  }
  if (!raw || raw.trim().length < 50) {
    raw = collectText(main) || main.textContent || "";
  }
  const normalized = normalizeText(raw);
  if (!normalized) return "";

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return normalized.slice(0, EXTRACT_MAX_CHARS);

  const collected: string[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(0, MAX_LEAD_LINES)) {
    pushUniqueLine(collected, seen, line);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!isRelevantHeading(line)) continue;

    pushUniqueLine(collected, seen, line);
    let added = 0;
    for (let j = i + 1; j < lines.length && added < MAX_SECTION_LINES; j++) {
      const candidate = lines[j] ?? "";
      if (isHeading(candidate) && isRelevantHeading(candidate)) break;
      pushUniqueLine(collected, seen, candidate);
      added += 1;
    }
  }

  let excerpt = collected.join("\n");
  if (excerpt.length < MIN_SECTION_CHARS) {
    for (const line of lines) {
      pushUniqueLine(collected, seen, line);
      excerpt = collected.join("\n");
      if (excerpt.length >= MIN_SECTION_CHARS) break;
    }
  }

  return excerpt.slice(0, EXTRACT_MAX_CHARS);
}

function extractBodyText(doc: Document): string {
  return extractRelevantJobText(doc);
}

/**
 * Self-executing capture. When this file is injected via
 * chrome.scripting.executeScript({ files: ["content.js"] }),
 * Chrome uses the last expression's value as results[0].result.
 */
(() => {
  // Guard everything. If anything inside the extraction throws, Chrome
  // silently hands results[0].result === undefined back to the
  // background — which surfaces as "content script returned no result".
  // That makes real failures indistinguishable from "page not ready",
  // and hides the actual cause. Always return a serialisable object.
  try {
    const url = location.href;
    const title = document.title;
    const pageText = extractBodyText(document);
    const detection = detect(location.hostname, pageText);
    const captureState = detectCaptureState(document, pageText);
    const result: CapturedTab = {
      tabId: -1, // filled by background after return
      url,
      title,
      pageText,
      detection,
      captureState,
      capturedAt: new Date().toISOString(),
    };
    return result;
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message : String(err);
    const fallback: CapturedTab & { extractError?: string } = {
      tabId: -1,
      url: typeof location !== "undefined" ? location.href : "",
      title: typeof document !== "undefined" ? document.title : "",
      pageText: "",
      detection: { label: "not_job_posting", confidence: 0.1, signals: [] },
      captureState: "hydrating",
      capturedAt: new Date().toISOString(),
      extractError: safeMsg,
    };
    return fallback;
  }
})();
