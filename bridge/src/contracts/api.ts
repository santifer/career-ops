/**
 * api.ts — HTTP API contract between the Chrome extension and the
 * career-ops local bridge.
 *
 * One file, one source of truth. Every endpoint has:
 *   • path + method
 *   • request payload type
 *   • success result type
 *   • failure error codes it may legitimately return
 *
 * CONTRACTS ONLY. No runtime.
 *
 * Transport: HTTP/1.1 over 127.0.0.1 (localhost). TLS is NOT required
 * because the bridge binds to the loopback interface; however, every
 * request MUST carry the shared-secret token (see AuthHeader).
 *
 * Concurrency: every mutating endpoint is idempotent on `requestId`.
 * Retrying with the same requestId returns the same result (either
 * the cached success or the original failure).
 */

import type {
  RequestEnvelope,
  Response,
  ErrorCode,
} from "./envelope.js";
import type {
  EvaluationInput,
  JobId,
  JobSnapshot,
  TrackerRow,
} from "./jobs.js";
import type {
  NewGradRow,
  EnrichedRow,
  NewGradScoreResult,
  NewGradEnrichResult,
} from "./newgrad.js";

/* -------------------------------------------------------------------------- */
/*  Transport-level constants                                                 */
/* -------------------------------------------------------------------------- */

/** The bridge binds here. Never bind to 0.0.0.0 or a LAN interface. */
export const BRIDGE_DEFAULT_HOST = "127.0.0.1" as const;
export const BRIDGE_DEFAULT_PORT = 47319 as const;

/**
 * Header that carries the shared secret. The secret is generated once
 * on first bridge start and persisted under bridge/.bridge-token (gitignored).
 * The extension stores the same value in chrome.storage.local and sends it
 * on every request. No secret in request bodies, no secret in URLs.
 */
export const AUTH_HEADER = "x-career-ops-token" as const;

/* -------------------------------------------------------------------------- */
/*  Endpoint catalog                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The complete set of endpoints the bridge exposes in the vertical slice
 * (Phase 2). Phase 3 endpoints are marked `phase: 3` and Phase 4 hardening
 * endpoints are marked `phase: 4`.
 */
export type EndpointId =
  | "health"
  | "liveness"
  | "evaluateCreate"
  | "evaluateStream"
  | "jobGet"
  | "trackerList"
  | "reportRead"
  | "newgradScore"
  | "newgradEnrich";

export interface EndpointDescriptor<TReq, TRes> {
  id: EndpointId;
  method: "GET" | "POST";
  /** Express-style path; `:param` captures. */
  path: string;
  phase: 2 | 3 | 4;
  /** Idempotent on `requestId`? */
  idempotent: boolean;
  /** Error codes this endpoint is allowed to return. */
  errors: readonly ErrorCode[];
  /** Phantom types — used only by generics, not at runtime. */
  __req?: TReq;
  __res?: TRes;
}

/* -------------------------------------------------------------------------- */
/*  /health — bridge is up and the career-ops repo is usable                  */
/* -------------------------------------------------------------------------- */

export interface HealthResult {
  /** Bridge protocol version. Extension compares majors. */
  protocolVersion: string;
  /** Bridge semver. */
  bridgeVersion: string;
  execution: {
    /** Bridge adapter mode. */
    mode: "fake" | "real" | "sdk";
    /** Which CLI powers real mode, if applicable. */
    realExecutor: "claude" | "codex" | null;
  };
  repo: {
    /** Absolute path to the career-ops repo root the bridge is serving. */
    rootPath: string;
    /** Contents of VERSION file. */
    careerOpsVersion: string;
    /** `data/applications.md` exists and parses. */
    trackerOk: boolean;
    /** `cv.md` exists and is non-empty. */
    cvOk: boolean;
    /** `config/profile.yml` exists. */
    profileOk: boolean;
  };
  deps: {
    /** `claude --version` succeeded. */
    claudeCli: { ok: boolean; version?: string; error?: string };
    /** `codex --version` succeeded. */
    codexCli: { ok: boolean; version?: string; error?: string };
    /** `node --version` — always ok if we're running, but reported for completeness. */
    node: { version: string };
    /** Playwright chromium browser is installed. */
    playwrightChromium: { ok: boolean; error?: string };
  };
}

export const HEALTH: EndpointDescriptor<void, HealthResult> = {
  id: "health",
  method: "GET",
  path: "/v1/health",
  phase: 2,
  idempotent: true,
  errors: ["UNAUTHORIZED", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /liveness — is this URL still an open job posting?                        */
/* -------------------------------------------------------------------------- */

export interface LivenessRequest {
  url: string;
}

export interface LivenessResult {
  url: string;
  /** Derived from check-liveness.mjs detection output. */
  status: "active" | "expired" | "uncertain";
  /** Brief human-readable reason. */
  reason: string;
}

export const LIVENESS: EndpointDescriptor<
  RequestEnvelope<LivenessRequest>,
  Response<LivenessResult>
> = {
  id: "liveness",
  method: "POST",
  path: "/v1/liveness",
  phase: 2,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "TIMEOUT", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /evaluate — create a new evaluation job                                   */
/* -------------------------------------------------------------------------- */

export interface EvaluateCreateRequest {
  input: EvaluationInput;
}

export interface EvaluateCreateResult {
  jobId: JobId;
  /** Convenience URL for the SSE stream. */
  streamUrl: string;
  /** Convenience URL for polling the snapshot. */
  snapshotUrl: string;
}

export const EVALUATE_CREATE: EndpointDescriptor<
  RequestEnvelope<EvaluateCreateRequest>,
  Response<EvaluateCreateResult>
> = {
  id: "evaluateCreate",
  method: "POST",
  path: "/v1/evaluate",
  phase: 2,
  idempotent: true,
  errors: [
    "UNAUTHORIZED",
    "BAD_REQUEST",
    "BRIDGE_NOT_READY",
    "REPO_LOCKED",
    "RATE_LIMITED",
    "INTERNAL",
  ],
};

/* -------------------------------------------------------------------------- */
/*  /evaluate/:id/stream — SSE channel of JobEvents                           */
/* -------------------------------------------------------------------------- */

/**
 * SSE endpoint. Does not use the JSON envelope — each SSE `data:` line
 * is a JSON-encoded `JobEvent`. Errors during the stream terminate with
 * a `failed` event, not an HTTP error (the HTTP status is always 200 on
 * successful stream open).
 *
 * The stream emits an initial `snapshot` event on connection, then one
 * event per phase transition, then a terminal `done` or `failed` event.
 */
export const EVALUATE_STREAM: EndpointDescriptor<void, void> = {
  id: "evaluateStream",
  method: "GET",
  path: "/v1/jobs/:id/stream",
  phase: 2,
  idempotent: true, // safe to reconnect
  errors: ["UNAUTHORIZED", "NOT_FOUND"],
};

/* -------------------------------------------------------------------------- */
/*  /jobs/:id — point-in-time snapshot (polling fallback)                     */
/* -------------------------------------------------------------------------- */

export const JOB_GET: EndpointDescriptor<void, Response<JobSnapshot>> = {
  id: "jobGet",
  method: "GET",
  path: "/v1/jobs/:id",
  phase: 2,
  idempotent: true,
  errors: ["UNAUTHORIZED", "NOT_FOUND", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /tracker — recent rows, for the "Recent activity" section (Phase 3)       */
/* -------------------------------------------------------------------------- */

export interface TrackerListRequest {
  /** Max rows. Default 10, cap 50. */
  limit?: number;
}

export interface TrackerListResult {
  rows: readonly TrackerRow[];
  /** Total rows in applications.md. */
  totalRows: number;
}

export const TRACKER_LIST: EndpointDescriptor<
  RequestEnvelope<TrackerListRequest>,
  Response<TrackerListResult>
> = {
  id: "trackerList",
  method: "POST", // POST because it takes an envelope with requestId
  path: "/v1/tracker",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /reports/:num — read one evaluation report (Phase 3)                      */
/* -------------------------------------------------------------------------- */

export interface ReportReadResult {
  num: number;
  path: string;
  markdown: string;
  /** Parsed header fields for popup rendering without full markdown. */
  meta: {
    company: string;
    role: string;
    date: string;
    score: number;
    archetype: string;
    url?: string;
  };
}

export const REPORT_READ: EndpointDescriptor<void, Response<ReportReadResult>> = {
  id: "reportRead",
  method: "GET",
  path: "/v1/reports/:num",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "NOT_FOUND", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /newgrad-scan/score — score + filter listing rows from newgrad-jobs.com    */
/* -------------------------------------------------------------------------- */

export interface NewGradScoreRequest {
  rows: NewGradRow[];
}

export const NEWGRAD_SCORE: EndpointDescriptor<
  RequestEnvelope<NewGradScoreRequest>,
  Response<NewGradScoreResult>
> = {
  id: "newgradScore",
  method: "POST",
  path: "/v1/newgrad-scan/score",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "RATE_LIMITED", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  /newgrad-scan/enrich — enrich scored rows with detail data + write        */
/*  survivors to pipeline.md                                                  */
/* -------------------------------------------------------------------------- */

export interface NewGradEnrichRequest {
  rows: EnrichedRow[];
}

export const NEWGRAD_ENRICH: EndpointDescriptor<
  RequestEnvelope<NewGradEnrichRequest>,
  Response<NewGradEnrichResult>
> = {
  id: "newgradEnrich",
  method: "POST",
  path: "/v1/newgrad-scan/enrich",
  phase: 3,
  idempotent: true,
  errors: ["UNAUTHORIZED", "BAD_REQUEST", "RATE_LIMITED", "INTERNAL"],
};

/* -------------------------------------------------------------------------- */
/*  Endpoint registry — used by tests and by a future OpenAPI generator       */
/* -------------------------------------------------------------------------- */

export const ENDPOINTS = {
  HEALTH,
  LIVENESS,
  EVALUATE_CREATE,
  EVALUATE_STREAM,
  JOB_GET,
  TRACKER_LIST,
  REPORT_READ,
  NEWGRAD_SCORE,
  NEWGRAD_ENRICH,
} as const;

export type EndpointRegistry = typeof ENDPOINTS;
