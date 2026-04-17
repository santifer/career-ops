/**
 * config.ts — bridge bootstrap configuration.
 *
 * Responsibilities:
 *   1. Locate the career-ops repo root (the directory containing this
 *      bridge/ directory).
 *   2. Load or generate the shared-secret token at bridge/.bridge-token.
 *   3. Resolve `claude` and `node` binaries from PATH.
 *   4. Decide which pipeline adapter to use (real vs fake) from env.
 *
 * Errors here crash the bridge on startup, which is correct — we must
 * not half-start. All runtime code below assumes a valid BridgeConfig.
 *
 * Security note: this file only ever runs execFileSync with fixed argv
 * arrays — never a shell command string. No user input is ever passed
 * to a subprocess from this module.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export type BridgeMode = "fake" | "real" | "sdk";
export type RealExecutor = "claude" | "codex";

export interface BridgeConfig {
  /** Absolute path to career-ops repo root. cwd for every shell-out. */
  repoRoot: string;
  /** Absolute path to bridge/ directory (inside repoRoot). */
  bridgeDir: string;
  /** Host to bind. Always loopback in production. */
  host: string;
  /** Port to bind. */
  port: number;
  /** Shared secret for the x-career-ops-token header. */
  token: string;
  /** Absolute path to the claude CLI, or null if unresolved. */
  claudeBin: string | null;
  /** Absolute path to the codex CLI, or null if unresolved. */
  codexBin: string | null;
  /** Absolute path to the node CLI. */
  nodeBin: string;
  /** Which pipeline adapter to use. */
  mode: BridgeMode;
  /** Which CLI powers real mode. */
  realExecutor: RealExecutor;
  /** Seconds an evaluation is allowed to run. */
  evaluationTimeoutSec: number;
  /** Maximum number of in-flight evaluations. */
  evaluationConcurrency: number;
  /** Maximum accepted evaluation requests per minute. */
  evaluationRateLimitPerMinute: number;
  /** Seconds a liveness check is allowed to run. */
  livenessTimeoutSec: number;
  /** Bridge semver, pulled from package.json. */
  bridgeVersion: string;
  /** Contents of the career-ops VERSION file. */
  careerOpsVersion: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47319;
const DEFAULT_EVAL_TIMEOUT_SEC = 900;   // 15 min — claude -p can be slow
const DEFAULT_EVAL_CONCURRENCY = 2;
const DEFAULT_EVAL_RPM = 30;
const DEFAULT_LIVENESS_TIMEOUT_SEC = 20;

function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Walk upward from src/runtime until we find bridge/package.json, then
 * one more level up is the repo root.
 */
function findRepoRoot(): { repoRoot: string; bridgeDir: string } {
  let dir = here();
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      const content = JSON.parse(readFileSync(pkg, "utf-8"));
      if (content.name === "@career-ops/bridge") {
        const bridgeDir = dir;
        const repoRoot = resolve(dir, "..");
        return { repoRoot, bridgeDir };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "bridge bootstrap: could not locate @career-ops/bridge package.json"
  );
}

/**
 * Resolve a binary name to an absolute path by scanning PATH manually.
 * We avoid spawning a shell (`which`, `command -v`) entirely so there is
 * zero command-injection surface. `binName` is always a hard-coded
 * literal in this module.
 */
function resolveBin(binName: string): string | null {
  const pathVar = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = pathVar.split(sep).filter(Boolean);
  for (const d of dirs) {
    const candidate = join(d, binName);
    try {
      const s = statSync(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // not here, keep looking
    }
  }
  return null;
}

function claudeVersion(claudeBin: string): string | null {
  try {
    // execFileSync with a fixed argv array — no shell, no injection surface.
    const out = execFileSync(claudeBin, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: 5000,
    });
    return out.trim();
  } catch {
    return null;
  }
}

function loadOrGenerateToken(bridgeDir: string): string {
  const tokenPath = join(bridgeDir, ".bridge-token");
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf-8").trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const fresh = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, fresh + "\n", { mode: 0o600 });
  return fresh;
}

function readVersion(p: string): string {
  try {
    return readFileSync(p, "utf-8").trim();
  } catch {
    return "unknown";
  }
}

function readPackageVersion(pkgPath: string): string {
  try {
    return (JSON.parse(readFileSync(pkgPath, "utf-8")).version as string) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function parseMode(raw: string | undefined): BridgeMode {
  if (raw === "real") return "real";
  if (raw === "sdk") return "sdk";
  if (raw === "fake" || raw === undefined) return "fake";
  throw new Error(
    `CAREER_OPS_BRIDGE_MODE must be "fake", "real", or "sdk", got "${raw}"`
  );
}

function parseRealExecutor(raw: string | undefined): RealExecutor {
  if (raw === "codex") return "codex";
  if (raw === "claude" || raw === undefined || raw === "") return "claude";
  throw new Error(
    `CAREER_OPS_REAL_EXECUTOR must be "claude" or "codex", got "${raw}"`
  );
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`CAREER_OPS_BRIDGE_PORT invalid: "${raw}"`);
  }
  return n;
}

function parsePositiveInt(raw: string | undefined, fallback: number, envName: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${envName} invalid: "${raw}"`);
  }
  return n;
}

export function loadConfig(): BridgeConfig {
  const { repoRoot, bridgeDir } = findRepoRoot();

  // Sanity check: repoRoot must contain cv.md, modes/, data/
  const mustExist = ["cv.md", "modes", "data"];
  for (const rel of mustExist) {
    const p = join(repoRoot, rel);
    if (!existsSync(p)) {
      throw new Error(
        `bridge bootstrap: repo root ${repoRoot} is missing ${rel}. This does not look like a career-ops repo.`
      );
    }
  }

  // Ensure batch dir exists — we don't create it, we just verify.
  const batchDir = join(repoRoot, "batch");
  if (!existsSync(batchDir) || !statSync(batchDir).isDirectory()) {
    throw new Error(
      `bridge bootstrap: expected ${batchDir} to exist as a directory`
    );
  }
  // Make sure tracker-additions exists; it's safe to create (existing
  // scripts do the same).
  const additionsDir = join(batchDir, "tracker-additions");
  if (!existsSync(additionsDir)) {
    mkdirSync(additionsDir, { recursive: true });
  }

  const token = loadOrGenerateToken(bridgeDir);
  const claudeBin = resolveBin("claude");
  const codexBin = resolveBin("codex");
  const nodeBin = resolveBin("node") ?? process.execPath;
  const mode = parseMode(process.env.CAREER_OPS_BRIDGE_MODE);
  const realExecutor = parseRealExecutor(process.env.CAREER_OPS_REAL_EXECUTOR);

  if (mode === "real" && realExecutor === "claude" && !claudeBin) {
    throw new Error(
      `bridge bootstrap: CAREER_OPS_BRIDGE_MODE=real but 'claude' CLI is not on PATH. ` +
        `Install Claude Code or switch to CAREER_OPS_BRIDGE_MODE=fake.`
    );
  }

  if (mode === "real" && realExecutor === "codex" && !codexBin) {
    throw new Error(
      `bridge bootstrap: CAREER_OPS_BRIDGE_MODE=real and CAREER_OPS_REAL_EXECUTOR=codex but 'codex' CLI is not on PATH. ` +
        `Install Codex CLI or switch CAREER_OPS_REAL_EXECUTOR=claude.`
    );
  }

  if (mode === "sdk" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      `bridge bootstrap: CAREER_OPS_BRIDGE_MODE=sdk but ANTHROPIC_API_KEY is not set. ` +
        `Set the env var or switch to CAREER_OPS_BRIDGE_MODE=fake.`
    );
  }

  const bridgeVersion = readPackageVersion(join(bridgeDir, "package.json"));
  const careerOpsVersion = readVersion(join(repoRoot, "VERSION"));

  return {
    repoRoot,
    bridgeDir,
    host: process.env.CAREER_OPS_BRIDGE_HOST ?? DEFAULT_HOST,
    port: parsePort(process.env.CAREER_OPS_BRIDGE_PORT, DEFAULT_PORT),
    token,
    claudeBin,
    codexBin,
    nodeBin,
    mode,
    realExecutor,
    evaluationTimeoutSec: DEFAULT_EVAL_TIMEOUT_SEC,
    evaluationConcurrency: parsePositiveInt(
      process.env.CAREER_OPS_BRIDGE_EVAL_CONCURRENCY,
      DEFAULT_EVAL_CONCURRENCY,
      "CAREER_OPS_BRIDGE_EVAL_CONCURRENCY",
    ),
    evaluationRateLimitPerMinute: parsePositiveInt(
      process.env.CAREER_OPS_BRIDGE_EVAL_RPM,
      DEFAULT_EVAL_RPM,
      "CAREER_OPS_BRIDGE_EVAL_RPM",
    ),
    livenessTimeoutSec: DEFAULT_LIVENESS_TIMEOUT_SEC,
    bridgeVersion,
    careerOpsVersion,
  };
}

/**
 * Cheap diagnostic used by /health. Never throws; returns structured info.
 */
function inspectCli(bin: string | null, name: string): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  if (!bin) {
    return { ok: false, error: `${name} CLI not found on PATH` };
  }
  const v = claudeVersion(bin);
  if (v === null) {
    return { ok: false, error: `${name} --version failed` };
  }
  return { ok: true, version: v };
}

export function inspectClaude(config: BridgeConfig): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  return inspectCli(config.claudeBin, "claude");
}

export function inspectCodex(config: BridgeConfig): {
  ok: boolean;
  version?: string;
  error?: string;
} {
  return inspectCli(config.codexBin, "codex");
}
