/**
 * errors.ts — runtime factories and HTTP mapping for BridgeError.
 *
 * The contract lives in contracts/envelope.ts. This file is the only
 * place that is allowed to decide HTTP status codes.
 */

import type { BridgeError, ErrorCode } from "../contracts/envelope.js";

export function bridgeError(
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
): BridgeError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/**
 * Map error code → HTTP status. Centralized here so the popup can rely
 * on the `code` field, not the status, for retry logic. Status codes
 * are for generic HTTP middleware and browser devtools readability.
 */
export function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case "PROTOCOL_MISMATCH":
      return 426; // Upgrade Required
    case "UNAUTHORIZED":
      return 401;
    case "BAD_REQUEST":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "BRIDGE_NOT_READY":
      return 503;
    case "REPO_LOCKED":
      return 423; // Locked
    case "RATE_LIMITED":
      return 429;
    case "TIMEOUT":
      return 504;
    case "EVAL_FAILED":
    case "JD_EXTRACTION_FAILED":
    case "PDF_FAILED":
    case "TRACKER_MERGE_FAILED":
      return 422; // Unprocessable Entity — semantic pipeline failure
    case "INTERNAL":
      return 500;
  }
}

/**
 * Normalize an arbitrary thrown value into a BridgeError with
 * code=INTERNAL. Used as the last line of defense in HTTP handlers.
 */
export function toBridgeError(err: unknown): BridgeError {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return err as BridgeError;
  }
  const message = err instanceof Error ? err.message : String(err);
  return bridgeError("INTERNAL", message);
}
