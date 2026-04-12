/**
 * bridge-client.ts — typed HTTP client for the career-ops bridge.
 *
 * All requests go through this module. No raw fetch() elsewhere in the
 * background worker. This is the seam where we:
 *   • Attach the auth header.
 *   • Build the envelope.
 *   • Validate the response shape (lightly — full zod isn't worth the
 *     bundle size for a Phase 2 slice).
 *
 * SSE is handled separately via `streamJob` using fetch + ReadableStream.
 * Chrome's EventSource does not let us set custom headers, so fetch is
 * the only option for an auth-header'd SSE stream.
 */

import {
  AUTH_HEADER,
  type EvaluateCreateResult,
  type HealthResult,
  type JobSnapshot,
  type LivenessResult,
  type ReportReadResult,
  type TrackerListResult,
  type NewGradScoreResult,
  type NewGradEnrichResult,
} from "../contracts/bridge-wire.js";
import {
  PROTOCOL_VERSION,
  type BridgeError,
  type FailureResponse,
  type Response as EnvelopedResponse,
  type SuccessResponse,
} from "../contracts/bridge-wire.js";
import type { EvaluationInput, JobEvent, JobId, NewGradRow, EnrichedRow } from "../contracts/bridge-wire.js";
import type { ExtensionState, MergeReport } from "../contracts/messages.js";

export interface BridgeClientConfig {
  host: string;
  port: number;
  token: string;
}

export function bridgeClient(
  cfg: BridgeClientConfig
): {
  getHealth(): Promise<EnvelopedResponse<HealthResult>>;
  checkLiveness(url: string): Promise<EnvelopedResponse<LivenessResult>>;
  createEvaluation(
    input: EvaluationInput
  ): Promise<EnvelopedResponse<EvaluateCreateResult>>;
  getJob(jobId: JobId): Promise<EnvelopedResponse<JobSnapshot>>;
  getTracker(limit: number): Promise<EnvelopedResponse<TrackerListResult>>;
  getReport(num: number): Promise<EnvelopedResponse<ReportReadResult>>;
  mergeTracker(dryRun: boolean): Promise<EnvelopedResponse<MergeReport>>;
  scoreNewGradRows(rows: NewGradRow[]): Promise<EnvelopedResponse<NewGradScoreResult>>;
  enrichNewGradRows(rows: EnrichedRow[]): Promise<EnvelopedResponse<NewGradEnrichResult>>;
  streamJob(
    jobId: JobId,
    onEvent: (event: JobEvent) => void,
    signal: AbortSignal
  ): Promise<void>;
  streamEnrich(
    rows: EnrichedRow[],
    onEvent: (event: { kind: string; [key: string]: unknown }) => void,
    signal: AbortSignal
  ): Promise<void>;
} {
  const base = `http://${cfg.host}:${cfg.port}`;

  function nowIso(): string {
    return new Date().toISOString();
  }

  function newRequestId(): string {
    return `ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function envelope<T>(payload: T) {
    return {
      protocol: PROTOCOL_VERSION,
      requestId: newRequestId(),
      clientTimestamp: nowIso(),
      payload,
    };
  }

  function headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      [AUTH_HEADER]: cfg.token,
    };
  }

  function failureFromError(requestId: string, err: unknown): FailureResponse {
    const message = err instanceof Error ? err.message : String(err);
    const bridgeErr: BridgeError = { code: "INTERNAL", message };
    return {
      ok: false,
      protocol: PROTOCOL_VERSION,
      requestId,
      serverTimestamp: nowIso(),
      error: bridgeErr,
    };
  }

  async function jsonRequest<TResult>(
    path: string,
    init: RequestInit,
    requestId: string
  ): Promise<EnvelopedResponse<TResult>> {
    try {
      const res = await fetch(base + path, init);
      const body = await res.json();
      if (isSuccess<TResult>(body) || isFailure(body)) {
        return body;
      }
      return failureFromError(requestId, new Error("malformed response body"));
    } catch (err) {
      return failureFromError(requestId, err);
    }
  }

  function isSuccess<T>(v: unknown): v is SuccessResponse<T> {
    return (
      typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === true
    );
  }
  function isFailure(v: unknown): v is FailureResponse {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { ok?: unknown }).ok === false
    );
  }

  return {
    async getHealth() {
      // /v1/health does not take an envelope.
      try {
        const res = await fetch(base + "/v1/health", {
          method: "GET",
          headers: headers(),
        });
        const body = await res.json();
        if (isSuccess<HealthResult>(body) || isFailure(body)) {
          return body;
        }
        return failureFromError(
          "health",
          new Error("malformed /v1/health response")
        );
      } catch (err) {
        return failureFromError("health", err);
      }
    },

    async checkLiveness(url: string) {
      const env = envelope({ url });
      return jsonRequest<LivenessResult>(
        "/v1/liveness",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId
      );
    },

    async createEvaluation(input: EvaluationInput) {
      const env = envelope({ input });
      return jsonRequest<EvaluateCreateResult>(
        "/v1/evaluate",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId
      );
    },

    async getJob(jobId: JobId) {
      try {
        const res = await fetch(`${base}/v1/jobs/${jobId}`, {
          method: "GET",
          headers: headers(),
        });
        const body = await res.json();
        if (isSuccess<JobSnapshot>(body) || isFailure(body)) {
          return body;
        }
        return failureFromError(
          "job",
          new Error("malformed /v1/jobs response")
        );
      } catch (err) {
        return failureFromError("job", err);
      }
    },

    async getTracker(limit: number) {
      const env = envelope({ limit });
      return jsonRequest<TrackerListResult>(
        "/v1/tracker",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId
      );
    },

    async getReport(num: number) {
      try {
        const res = await fetch(`${base}/v1/reports/${num}`, {
          method: "GET",
          headers: headers(),
        });
        const body = await res.json();
        if (isSuccess<ReportReadResult>(body) || isFailure(body)) {
          return body;
        }
        return failureFromError(
          "report",
          new Error("malformed /v1/reports response")
        );
      } catch (err) {
        return failureFromError("report", err);
      }
    },

    async mergeTracker(dryRun: boolean) {
      const env = envelope({ dryRun });
      return jsonRequest<MergeReport>(
        "/v1/tracker/merge",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId
      );
    },

    async scoreNewGradRows(rows: NewGradRow[]) {
      const env = envelope({ rows });
      return jsonRequest<NewGradScoreResult>(
        "/v1/newgrad-scan/score",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId,
      );
    },

    async enrichNewGradRows(rows: EnrichedRow[]) {
      const env = envelope({ rows });
      return jsonRequest<NewGradEnrichResult>(
        "/v1/newgrad-scan/enrich",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(env),
        },
        env.requestId,
      );
    },

    async streamEnrich(
      rows: EnrichedRow[],
      onEvent: (event: { kind: string; [key: string]: unknown }) => void,
      signal: AbortSignal
    ) {
      const res = await fetch(`${base}/v1/newgrad-scan/enrich-stream`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(envelope({ rows })),
        signal,
      });
      if (!res.ok || !res.body) {
        // Parse structured error from bridge response body
        try {
          const errBody = await res.json() as { ok: false; error: BridgeError };
          if (errBody?.error) {
            const e = new Error(errBody.error.message) as Error & { bridgeError: BridgeError };
            e.bridgeError = errBody.error;
            throw e;
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && "bridgeError" in parseErr) throw parseErr;
        }
        throw new Error(`Enrich SSE stream failed: HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            onEvent(JSON.parse(dataLine.slice("data: ".length)));
          } catch { /* skip malformed */ }
        }
      }
    },

    async streamJob(
      jobId: JobId,
      onEvent: (event: JobEvent) => void,
      signal: AbortSignal
    ) {
      const res = await fetch(`${base}/v1/jobs/${jobId}/stream`, {
        method: "GET",
        headers: headers(),
        signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE stream failed: HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE frames: data: <json>\n\n
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const json = dataLine.slice("data: ".length);
          try {
            const event = JSON.parse(json) as JobEvent;
            onEvent(event);
          } catch {
            // skip malformed frame
          }
        }
      }
    },
  };
}

/** Construct a client directly from ExtensionState. */
export function bridgeClientFromState(state: ExtensionState) {
  return bridgeClient({
    host: state.bridgeHost,
    port: state.bridgePort,
    token: state.bridgeToken,
  });
}
