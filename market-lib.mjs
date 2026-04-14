import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "yaml";

export const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const MARKET_DIR = path.join(DATA_DIR, "market");
export const PORTALS_FILE = path.join(ROOT_DIR, "portals.yml");
export const PROFILE_FILE = path.join(ROOT_DIR, "config", "profile.yml");

const HTML_ENTITIES = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&nbsp;", " "],
]);

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function readText(filePath) {
  return await readFile(filePath, "utf8");
}

export async function writeText(filePath, contents) {
  await writeFile(filePath, contents, "utf8");
}

export async function loadYaml(filePath) {
  const contents = await readText(filePath);
  return YAML.parse(contents);
}

export async function readJsonl(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = (await readText(filePath))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line));
}

export async function writeJsonl(filePath, rows) {
  const contents = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeText(filePath, contents ? `${contents}\n` : "");
}

export async function readTsv(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = (await readText(filePath)).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export async function writeTsv(filePath, headers, rows) {
  const lines = [headers.join("\t")];
  for (const row of rows) {
    lines.push(headers.map((header) => row[header] ?? "").join("\t"));
  }

  await writeText(filePath, `${lines.join("\n")}\n`);
}

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function decodeHtml(value) {
  let result = String(value ?? "");
  for (const [entity, replacement] of HTML_ENTITIES.entries()) {
    result = result.split(entity).join(replacement);
  }

  return result.replace(/&#(\d+);/g, (_, codePoint) => String.fromCharCode(Number(codePoint)));
}

export function stripHtml(value) {
  return normalizeWhitespace(decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " ")));
}

export function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalizeUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        key === "gh_jid" ||
        key === "gh_src" ||
        key === "source" ||
        key === "sourceid"
      ) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return normalizeWhitespace(rawUrl);
  }
}

export function toAbsoluteUrl(rawUrl, baseUrl) {
  if (!rawUrl) {
    return "";
  }

  try {
    return canonicalizeUrl(new URL(rawUrl, baseUrl).toString());
  } catch {
    return canonicalizeUrl(rawUrl);
  }
}

export function inferPlatform(url) {
  const normalized = canonicalizeUrl(url).toLowerCase();

  if (normalized.includes("greenhouse.io")) {
    return "greenhouse";
  }
  if (normalized.includes("ashbyhq.com")) {
    return "ashby";
  }
  if (normalized.includes("lever.co")) {
    return "lever";
  }
  if (normalized.includes("workable.com")) {
    return "workable";
  }
  if (normalized.includes("smartrecruiters.com")) {
    return "smartrecruiters";
  }

  return "web";
}

export function inferRemoteMode(...values) {
  const text = normalizeWhitespace(values.filter(Boolean).join(" ")).toLowerCase();

  if (!text) {
    return "unknown";
  }
  if (
    /\bremote\b|work from home|wfh|100%\s*remote|fully\s+remote|remote-first|remote\s+first/.test(text) ||
    /\b(?:fully\s+)?distributed\b|work\s+from\s+anywhere|anywhere\s+in\s+(?:the\s+)?(?:us|u\.s\.|uk|eu|world|europe|north america)/.test(
      text,
    )
  ) {
    return "remote";
  }
  if (/\bhybrid\b/.test(text)) {
    return "hybrid";
  }
  if (/\bonsite\b|\bon-site\b|in office|office-first/.test(text)) {
    return "onsite";
  }

  return "unknown";
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSalary(rawText) {
  const text = normalizeWhitespace(rawText);
  if (!text) {
    return null;
  }

  const rangePattern =
    /\$([0-9]{2,3}(?:,[0-9]{3})*)(?:\s*(?:-|–|to)\s*\$?([0-9]{2,3}(?:,[0-9]{3})*))?/gi;
  const matches = [...text.matchAll(rangePattern)];
  if (matches.length === 0) {
    return null;
  }

  const [first] = matches;
  const min = Number(first[1].replace(/,/g, ""));
  const max = first[2] ? Number(first[2].replace(/,/g, "")) : min;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  const low = Math.min(min, max);
  const high = Math.max(min, max);
  // Reject obvious misparses (hourly noise, percentages, bad OCR) for annual USD bands.
  if (low < 15_000 || high > 2_500_000) {
    return null;
  }

  return {
    raw: first[0],
    currency: "USD",
    min: low,
    max: high,
  };
}

export async function mapInBatches(items, batchSize, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const resolved = await Promise.all(batch.map((item, batchIndex) => mapper(item, index + batchIndex)));
    results.push(...resolved);
  }

  return results;
}

export function buildJobKey(job) {
  const canonicalUrl = canonicalizeUrl(job.url);
  if (canonicalUrl) {
    return canonicalUrl;
  }

  return [slugify(job.company), slugify(job.title), slugify(job.location)].filter(Boolean).join("::");
}

export function summarizeText(value, maxLength = 400) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function extractJsonAssignment(html, token) {
  const source = String(html ?? "");
  const tokenIndex = source.indexOf(token);
  if (tokenIndex === -1) {
    return null;
  }

  const startIndex = source.indexOf("{", tokenIndex + token.length);
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (inString) {
      if (character === quote) {
        inString = false;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      inString = true;
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = source.slice(startIndex, index + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
