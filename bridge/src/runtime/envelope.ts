/**
 * envelope.ts — runtime helpers for the wire envelope.
 *
 * Pure functions. No I/O. Used by server.ts to wrap responses consistently.
 */

import {
  PROTOCOL_VERSION,
  type BridgeError,
  type FailureResponse,
  type RequestEnvelope,
  type SuccessResponse,
} from "../contracts/envelope.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function success<T>(requestId: string, result: T): SuccessResponse<T> {
  return {
    ok: true,
    protocol: PROTOCOL_VERSION,
    requestId,
    serverTimestamp: nowIso(),
    result,
  };
}

export function failure(requestId: string, error: BridgeError): FailureResponse {
  return {
    ok: false,
    protocol: PROTOCOL_VERSION,
    requestId,
    serverTimestamp: nowIso(),
    error,
  };
}

/**
 * Validate that the incoming envelope's protocol major matches ours.
 * Throws a BridgeError on mismatch.
 */
export function assertProtocol<T>(envelope: RequestEnvelope<T>): void {
  const [incoming] = envelope.protocol.split(".");
  const [ours] = PROTOCOL_VERSION.split(".");
  if (incoming !== ours) {
    const err: BridgeError = {
      code: "PROTOCOL_MISMATCH",
      message: `Bridge speaks protocol ${PROTOCOL_VERSION}, client sent ${envelope.protocol}`,
    };
    throw err;
  }
}
