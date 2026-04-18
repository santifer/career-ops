import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { NewGradRow } from "../contracts/newgrad.js";
import { canonicalizeJobUrl } from "../lib/canonical-job-url.js";
import { parsePostedAgo } from "./newgrad-scorer.js";

const SCAN_HISTORY_PATH = "data/scan-history.tsv";
const SCAN_HISTORY_HEADER = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n";
const NEWGRAD_PORTAL = "newgrad-scan";
const MAX_RECENT_MINUTES = 24 * 60;

export interface NewGradSeenKeys {
  urls: ReadonlySet<string>;
  companyRoles: ReadonlySet<string>;
}

export function isRecentNewGradRow(row: NewGradRow): boolean {
  const minutesAgo = parsePostedAgo(row.postedAgo);
  return isFinite(minutesAgo) && minutesAgo < MAX_RECENT_MINUTES;
}

export function newGradRowUrl(row: NewGradRow): string {
  return normalizeUrl(row.detailUrl) || normalizeUrl(row.applyUrl);
}

export function newGradCompanyRoleKey(row: NewGradRow): string {
  return companyRoleKey(row.company, row.title);
}

export function wasNewGradRowSeen(row: NewGradRow, seen: NewGradSeenKeys): boolean {
  const url = newGradRowUrl(row);
  if (url && seen.urls.has(url)) return true;

  const key = newGradCompanyRoleKey(row);
  return key !== "" && seen.companyRoles.has(key);
}

export function loadNewGradSeenKeys(repoRoot: string): NewGradSeenKeys {
  const urls = new Set<string>();
  const companyRoles = new Set<string>();

  readScanHistory(repoRoot, urls, companyRoles);
  readPipelineUrls(repoRoot, urls, companyRoles);

  return { urls, companyRoles };
}

export function appendNewGradScanHistory(
  repoRoot: string,
  rows: readonly NewGradRow[],
  statusForRow: (row: NewGradRow) => string,
): void {
  if (rows.length === 0) return;

  const path = join(repoRoot, SCAN_HISTORY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, SCAN_HISTORY_HEADER, "utf-8");
  }

  const today = new Date().toISOString().slice(0, 10);
  const seenInBatch = new Set<string>();
  const lines: string[] = [];

  for (const row of rows) {
    const url = newGradRowUrl(row);
    const companyRole = newGradCompanyRoleKey(row);
    const dedupeKey = url || companyRole;
    if (!dedupeKey || seenInBatch.has(dedupeKey)) continue;
    seenInBatch.add(dedupeKey);

    lines.push([
      url || `newgrad-scan:${companyRole}`,
      today,
      NEWGRAD_PORTAL,
      row.title,
      row.company,
      statusForRow(row),
    ].map(tsvCell).join("\t"));
  }

  if (lines.length > 0) {
    appendFileSync(path, `${lines.join("\n")}\n`, "utf-8");
  }
}

function readScanHistory(
  repoRoot: string,
  urls: Set<string>,
  companyRoles: Set<string>,
): void {
  const path = join(repoRoot, SCAN_HISTORY_PATH);
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const url = normalizeUrl(cells[0] ?? "");
    const title = (cells[3] ?? "").trim();
    const company = (cells[4] ?? "").trim();
    const status = (cells[5] ?? "").trim();
    if (!isTerminalScanStatus(status)) continue;
    if (url) urls.add(url);
    const key = companyRoleKey(company, title);
    if (key) companyRoles.add(key);
  }
}

function readPipelineUrls(
  repoRoot: string,
  urls: Set<string>,
  companyRoles: Set<string>,
): void {
  const path = join(repoRoot, "data/pipeline.md");
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf-8");
  for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
    const url = normalizeUrl(match[1] ?? "");
    if (url) urls.add(url);
  }
  for (const match of text.matchAll(/- \[[ x]\] https?:\/\/\S+\s+—\s+(.+?)\s+\|\s+(.+?)\s+\(/g)) {
    const key = companyRoleKey(match[1] ?? "", match[2] ?? "");
    if (key) companyRoles.add(key);
  }
}

function isTerminalScanStatus(status: string): boolean {
  return status !== "" && status !== "promoted";
}

function normalizeUrl(value: string): string {
  return canonicalizeJobUrl(value) ?? value.trim();
}

function companyRoleKey(company: string, role: string): string {
  const normalizedCompany = normalizeText(company);
  const normalizedRole = normalizeText(role);
  if (!normalizedCompany || !normalizedRole) return "";
  return `${normalizedCompany}|${normalizedRole}`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tsvCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}
