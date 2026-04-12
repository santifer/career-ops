/**
 * envelope.ts — shared request/response envelope for the career-ops bridge.
 *
 * CONTRACTS ONLY. No runtime code. Imported by:
 *   • bridge/src/*     — the HTTP server
 *   • extension/src/*  — the Chrome extension (via a mirror re-export file)
 *
 * Invariants:
 *   1. Every request and every response carries a `protocol` version.
 *      The bridge refuses mismatched majors.
 *   2. Every error is a tagged union with a stable `code` and a
 *      `retriable` hint so the extension does not have to guess from
 *      HTTP status alone.
 *   3. Success and failure are both expressed as discriminated unions —
 *      no throwing across the wire, no ambiguous 200-with-error bodies.
 */

/**
 * Protocol version. Bump the major when the wire format changes in a
 * backwards-incompatible way. The bridge rejects requests whose major
 * does not match its own.
 */
export const PROTOCOL_VERSION = "1.0.0" as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/**
 * Every request body carries this envelope. Keeps room for future fields
 * (tracing, auth rotation, idempotency keys) without another breaking change.
 */
export interface RequestEnvelope<TPayload> {
  protocol: ProtocolVersion;
  /** Client-generated UUID. Used for idempotency on mutating endpoints. */
  requestId: string;
  /** ISO-8601 UTC timestamp from the client. Advisory, not authoritative. */
  clientTimestamp: string;
  payload: TPayload;
}

/**
 * Success response — discriminated by `ok: true`.
 */
export interface SuccessResponse<TResult> {
  ok: true;
  protocol: ProtocolVersion;
  requestId: string;
  /** ISO-8601 UTC timestamp from the bridge. */
  serverTimestamp: string;
  result: TResult;
}

/**
 * Failure response — discriminated by `ok: false`.
 */
export interface FailureResponse {
  ok: false;
  protocol: ProtocolVersion;
  requestId: string;
  serverTimestamp: string;
  error: BridgeError;
}

export type Response<TResult> = SuccessResponse<TResult> | FailureResponse;

/**
 * Canonical error codes. Kept small and intentional.
 *
 * `retriable` is a property of the code itself — see ERROR_RETRIABILITY.
 * Clients MUST use that map, not the HTTP status, to decide on retry.
 */
export type ErrorCode =
  // --- transport / protocol ---
  | "PROTOCOL_MISMATCH"    // client sent a different protocol major
  | "UNAUTHORIZED"         // missing or invalid bridge token
  | "BAD_REQUEST"          // payload failed validation
  | "NOT_FOUND"            // job/report/tracker row does not exist
  // --- bridge internal ---
  | "BRIDGE_NOT_READY"     // doctor checks failed; claude/playwright missing
  | "REPO_LOCKED"          // mkdir-based batch lock held > timeout
  | "RATE_LIMITED"         // client-side rate cap hit
  | "INTERNAL"             // unexpected, log-and-ticket error
  // --- pipeline / evaluation ---
  | "EVAL_FAILED"          // claude -p exited non-zero
  | "JD_EXTRACTION_FAILED" // could not extract JD from URL
  | "PDF_FAILED"           // generate-pdf.mjs exited non-zero
  | "TRACKER_MERGE_FAILED" // merge-tracker.mjs exited non-zero
  | "TIMEOUT";             // operation exceeded the bridge-enforced timeout

/** Which codes are safe to retry with the same requestId. */
export const ERROR_RETRIABILITY: Readonly<Record<ErrorCode, boolean>> = {
  PROTOCOL_MISMATCH: false,
  UNAUTHORIZED: false,
  BAD_REQUEST: false,
  NOT_FOUND: false,
  BRIDGE_NOT_READY: true,
  REPO_LOCKED: true,
  RATE_LIMITED: true,
  INTERNAL: true,
  EVAL_FAILED: false,
  JD_EXTRACTION_FAILED: false,
  PDF_FAILED: true,
  TRACKER_MERGE_FAILED: true,
  TIMEOUT: true,
};

export interface BridgeError {
  code: ErrorCode;
  /** Human-readable; safe to surface in the popup. */
  message: string;
  /** Optional structured detail for diagnostics. Never contains secrets. */
  detail?: Record<string, unknown>;
}

/**
 * Guard helpers — exported as types so the runtime implementations can
 * be generated from a single source. (Implementations live in
 * bridge/src/runtime/envelope.ts in Phase 2, not here.)
 */
export type IsSuccess = <T>(r: Response<T>) => r is SuccessResponse<T>;
export type IsFailure = <T>(r: Response<T>) => r is FailureResponse;
