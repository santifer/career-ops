/**
 * server.ts — Fastify HTTP server for the career-ops bridge.
 *
 * Responsibilities:
 *   • Bind loopback only.
 *   • Enforce the shared-secret token on every request.
 *   • Validate request envelopes with zod.
 *   • Route requests into the PipelineAdapter + JobStore.
 *   • Stream job events as Server-Sent Events.
 *
 * What this file DOES NOT do:
 *   • Talk to claude -p directly (that's the adapter's job).
 *   • Write files (adapters are the only layer allowed to touch disk).
 *   • Manage process lifecycle (that's index.ts).
 */

import Fastify from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  AUTH_HEADER,
  type HealthResult,
} from "./contracts/api.js";
import type { NewGradRow, EnrichedRow } from "./contracts/newgrad.js";
import {
  PROTOCOL_VERSION,
  type BridgeError,
  type RequestEnvelope,
} from "./contracts/envelope.js";
import {
  type EvaluationInput,
  type JobEvent,
  type JobId,
  type JobSnapshot,
} from "./contracts/jobs.js";
import type { PipelineAdapter } from "./contracts/pipeline.js";

import { type BridgeConfig, inspectClaude, inspectCodex } from "./runtime/config.js";
import { bridgeError, httpStatusFor, toBridgeError } from "./runtime/errors.js";
import { assertProtocol, failure, success } from "./runtime/envelope.js";
import { createInMemoryJobStore } from "./runtime/job-store.js";

/* -------------------------------------------------------------------------- */
/*  Zod schemas — runtime validation that matches the static contracts        */
/* -------------------------------------------------------------------------- */

const detectionSchema = z.object({
  label: z.enum(["job_posting", "likely_job_posting", "not_job_posting"]),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
});

const evaluationInputSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  pageText: z.string().max(50_000).optional(),
  detection: detectionSchema.optional(),
});

function envelopeSchema<T extends z.ZodTypeAny>(payload: T) {
  return z.object({
    protocol: z.string(),
    requestId: z.string().min(1),
    clientTimestamp: z.string(),
    payload,
  });
}

const evaluateCreateSchema = envelopeSchema(
  z.object({ input: evaluationInputSchema })
);

const livenessSchema = envelopeSchema(
  z.object({ url: z.string().url() })
);

/* -------------------------------------------------------------------------- */
/*  In-memory rate limiter (dependency-free)                                   */
/* -------------------------------------------------------------------------- */

class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly hits = new Map<string, number[]>();

  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }

  check(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }
    // Evict expired entries
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift();
    }
    if (timestamps.length >= this.max) {
      return false; // rate limited
    }
    timestamps.push(now);
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*  Runtime dependencies                                                       */
/* -------------------------------------------------------------------------- */

export interface BuildServerArgs {
  config: BridgeConfig;
  adapter: PipelineAdapter;
}

export function buildServer(args: BuildServerArgs) {
  const { config, adapter } = args;
  const store = createInMemoryJobStore();

  const evaluateRateLimit = new RateLimiter(60_000, 3);  // 3 evaluations per minute
  const generalRateLimit = new RateLimiter(60_000, 60);   // 60 requests per minute for everything else

  const fastify = Fastify({
    logger: {
      level: process.env.CAREER_OPS_BRIDGE_LOG_LEVEL ?? "info",
    },
    // Don't leak request bodies into logs — may contain pageText.
    disableRequestLogging: true,
    bodyLimit: 256 * 1024, // 256 KB — generous for JD text, blocks multi-MB abuse
  });

  /* -- global auth hook -------------------------------------------------- */

  fastify.addHook("preHandler", async (req, reply) => {
    const token = req.headers[AUTH_HEADER];
    if (typeof token !== "string" || token !== config.token) {
      const err = bridgeError(
        "UNAUTHORIZED",
        "missing or invalid " + AUTH_HEADER + " header"
      );
      return sendFailure(reply, requestIdFromRequest(req), err);
    }
  });

  /* -- request logging hook ------------------------------------------------ */

  fastify.addHook("onResponse", async (req, reply) => {
    fastify.log.info({
      method: req.method,
      path: req.url,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    }, "request");
  });

  /* -- /v1/health -------------------------------------------------------- */

  fastify.get("/v1/health", async (_req, reply) => {
    const doctor = await adapter.doctor();
    const claude = inspectClaude(config);
    const codex = inspectCodex(config);
    const result: HealthResult = {
      protocolVersion: PROTOCOL_VERSION,
      bridgeVersion: config.bridgeVersion,
      execution: {
        mode: config.mode,
        realExecutor: config.mode === "real" ? config.realExecutor : null,
      },
      repo: doctor.repo,
      deps: {
        claudeCli: claude,
        codexCli: codex,
        node: { version: process.version },
        playwrightChromium: doctor.playwrightChromium,
      },
    };
    reply.code(200).send(success("health", result));
  });

  /* -- /v1/liveness ------------------------------------------------------ */

  fastify.post("/v1/liveness", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = livenessSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ url: string }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    const check = await adapter.checkLiveness(env.payload.url);
    reply
      .code(200)
      .send(
        success(env.requestId, {
          url: check.url,
          status: check.status,
          reason: check.reason,
        })
      );
  });

  /* -- /v1/evaluate ------------------------------------------------------ */

  fastify.post("/v1/evaluate", async (req, reply) => {
    if (!evaluateRateLimit.check("evaluate")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "max 3 evaluations per minute"));
    }

    const parsed = evaluateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ input: EvaluationInput }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    const jobId = nanoid() as JobId;
    const createdAt = new Date().toISOString();
    const initial: JobSnapshot = {
      id: jobId,
      phase: "queued",
      createdAt,
      updatedAt: createdAt,
      input: env.payload.input,
      progress: { phases: [{ phase: "queued", at: createdAt }] },
    };
    await store.create(initial);

    // Kick off the evaluation asynchronously. Do NOT await.
    runEvaluationInBackground(adapter, store, jobId, env.payload.input, config.evaluationTimeoutSec).catch(
      (err) => {
        fastify.log.error({ err, jobId }, "background evaluation crashed");
      }
    );

    const base = `http://${config.host}:${config.port}`;
    reply.code(202).send(
      success(env.requestId, {
        jobId,
        streamUrl: `${base}/v1/jobs/${jobId}/stream`,
        snapshotUrl: `${base}/v1/jobs/${jobId}`,
      })
    );
  });

  /* -- /v1/jobs/:id ------------------------------------------------------ */

  fastify.get<{ Params: { id: string } }>("/v1/jobs/:id", async (req, reply) => {
    const snap = await store.get(req.params.id as JobId);
    if (!snap) {
      return sendFailure(
        reply,
        "job-get",
        bridgeError("NOT_FOUND", `job ${req.params.id} not found`)
      );
    }
    reply.code(200).send(success("job-get", snap));
  });

  /* -- /v1/jobs/:id/stream (SSE) ---------------------------------------- */

  fastify.get<{ Params: { id: string } }>(
    "/v1/jobs/:id/stream",
    async (req, reply) => {
      const jobId = req.params.id as JobId;
      const current = await store.get(jobId);
      if (!current) {
        return sendFailure(
          reply,
          "job-stream",
          bridgeError("NOT_FOUND", `job ${jobId} not found`)
        );
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.hijack();

      const send = (event: JobEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Initial snapshot.
      send({ kind: "snapshot", snapshot: current });

      // If already terminal, send terminal event + close.
      if (current.phase === "completed" && current.result) {
        send({ kind: "done", jobId, result: current.result });
        reply.raw.end();
        return;
      }
      if (current.phase === "failed" && current.error) {
        send({ kind: "failed", jobId, error: current.error });
        reply.raw.end();
        return;
      }

      // Keep the connection alive for proxies and load balancers.
      const heartbeatInterval = setInterval(() => {
        try {
          reply.raw.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15_000);

      // Subscribe for updates.
      let lastSentPhases = current.progress?.phases.length ?? 0;
      const unsubscribe = store.subscribe(jobId, (snap) => {
        // Emit any new phase transitions since last send.
        const phases = snap.progress?.phases ?? [];
        for (let i = lastSentPhases; i < phases.length; i++) {
          const t = phases[i]!;
          send({
            kind: "phase",
            jobId: snap.id,
            phase: t.phase,
            at: t.at,
            ...(t.note !== undefined && { note: t.note }),
          });
        }
        lastSentPhases = phases.length;

        if (snap.phase === "completed" && snap.result) {
          send({ kind: "done", jobId: snap.id, result: snap.result });
          clearInterval(heartbeatInterval);
          unsubscribe();
          reply.raw.end();
        } else if (snap.phase === "failed" && snap.error) {
          send({ kind: "failed", jobId: snap.id, error: snap.error });
          clearInterval(heartbeatInterval);
          unsubscribe();
          reply.raw.end();
        }
      });

      // Clean up if client disconnects early.
      req.raw.on("close", () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
      });
    }
  );

  /* -- POST /v1/tracker --------------------------------------------------- */

  const trackerReadSchema = envelopeSchema(
    z.object({ limit: z.number().int().min(1).max(50).optional() })
  );

  fastify.post("/v1/tracker", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = trackerReadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ limit?: number }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    const data = await adapter.readTrackerTail(env.payload.limit ?? 10);
    reply.code(200).send(success(env.requestId, data));
  });

  /* -- GET /v1/reports/:num ----------------------------------------------- */

  fastify.get<{ Params: { num: string } }>(
    "/v1/reports/:num",
    async (req, reply) => {
      const num = parseInt(req.params.num, 10);
      if (isNaN(num) || num < 0) {
        return sendFailure(
          reply,
          "report-read",
          bridgeError("BAD_REQUEST", `invalid report number: ${req.params.num}`)
        );
      }

      const report = await adapter.readReport(num);
      if (!report) {
        return sendFailure(
          reply,
          "report-read",
          bridgeError("NOT_FOUND", `report ${num} not found`)
        );
      }
      reply.code(200).send(success("report-read", report));
    }
  );

  /* -- POST /v1/tracker/merge -------------------------------------------- */

  const trackerMergeSchema = envelopeSchema(
    z.object({ dryRun: z.boolean().optional() })
  );

  fastify.post("/v1/tracker/merge", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = trackerMergeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ dryRun?: boolean }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    try {
      const report = await adapter.mergeTracker(env.payload.dryRun ?? false);
      reply.code(200).send(success(env.requestId, report));
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }
  });

  /* -- GET /v1/jobs ------------------------------------------------------- */

  fastify.get("/v1/jobs", async (_req, reply) => {
    const jobs = await store.list(20);
    reply.code(200).send(success("jobs-list", { jobs }));
  });

  /* -- POST /v1/newgrad-scan/score --------------------------------------- */

  const newGradRowSchema = z.object({
    position: z.number().int(),
    title: z.string(),
    postedAgo: z.string(),
    applyUrl: z.string(),
    detailUrl: z.string(),
    workModel: z.string(),
    location: z.string(),
    company: z.string(),
    salary: z.string().nullable(),
    companySize: z.string().nullable(),
    industry: z.string().nullable(),
    qualifications: z.string().nullable(),
    h1bSponsored: z.boolean(),
    isNewGrad: z.boolean(),
  });

  const newGradScoreSchema = envelopeSchema(
    z.object({ rows: z.array(newGradRowSchema).max(200) })
  );

  fastify.post("/v1/newgrad-scan/score", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = newGradScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ rows: NewGradRow[] }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    try {
      const result = await adapter.scoreNewGradRows(env.payload.rows);
      reply.code(200).send(success(env.requestId, result));
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }
  });

  /* -- POST /v1/newgrad-scan/enrich -------------------------------------- */

  const scoreBreakdownSchema = z.object({
    roleMatch: z.number(),
    skillHits: z.number(),
    skillKeywordsMatched: z.array(z.string()),
    freshness: z.number(),
  });

  const scoredRowSchema = z.object({
    row: newGradRowSchema,
    score: z.number(),
    maxScore: z.number(),
    breakdown: scoreBreakdownSchema,
  });

  const newGradDetailSchema = z.object({
    position: z.number().int(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    employmentType: z.string().nullable(),
    workModel: z.string().nullable(),
    seniorityLevel: z.string().nullable(),
    salaryRange: z.string().nullable(),
    matchScore: z.number().nullable(),
    expLevelMatch: z.number().nullable(),
    skillMatch: z.number().nullable(),
    industryExpMatch: z.number().nullable(),
    description: z.string(),
    industries: z.array(z.string()),
    recommendationTags: z.array(z.string()),
    responsibilities: z.array(z.string()),
    requiredQualifications: z.array(z.string()),
    skillTags: z.array(z.string()),
    taxonomy: z.array(z.string()),
    companyWebsite: z.string().nullable(),
    companyDescription: z.string().nullable(),
    companySize: z.string().nullable(),
    companyLocation: z.string().nullable(),
    companyFoundedYear: z.string().nullable(),
    companyCategories: z.array(z.string()),
    h1bSponsorLikely: z.boolean().nullable(),
    h1bSponsorshipHistory: z.array(
      z.object({
        year: z.string(),
        count: z.number().int(),
      })
    ),
    insiderConnections: z.number().int().nullable(),
    originalPostUrl: z.string(),
    applyNowUrl: z.string(),
    applyFlowUrls: z.array(z.string()),
  });

  const enrichedRowSchema = z.object({
    row: scoredRowSchema,
    detail: newGradDetailSchema,
  });

  const newGradEnrichSchema = envelopeSchema(
    z.object({ rows: z.array(enrichedRowSchema).max(50) })
  );

  fastify.post("/v1/newgrad-scan/enrich", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = newGradEnrichSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ rows: EnrichedRow[] }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    try {
      const result = await adapter.enrichNewGradRows(env.payload.rows);
      reply.code(200).send(success(env.requestId, result));
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }
  });

  /* -- POST /v1/newgrad-scan/enrich-stream (SSE) -------------------------- */

  fastify.post("/v1/newgrad-scan/enrich-stream", async (req, reply) => {
    if (!generalRateLimit.check("general")) {
      return sendFailure(reply, requestIdFromBody(req.body),
        bridgeError("RATE_LIMITED", "too many requests"));
    }

    const parsed = newGradEnrichSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        reply,
        requestIdFromBody(req.body),
        bridgeError("BAD_REQUEST", "invalid envelope", {
          issues: parsed.error.issues,
        })
      );
    }
    const env = parsed.data as RequestEnvelope<{ rows: EnrichedRow[] }>;
    try {
      assertProtocol(env);
    } catch (e) {
      return sendFailure(reply, env.requestId, toBridgeError(e));
    }

    // SSE headers — hijack so Fastify doesn't manage the response lifecycle
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.hijack();

    const write = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await adapter.enrichNewGradRows(
        env.payload.rows,
        (current, total, row) => {
          write({
            kind: "progress",
            current,
            total,
            row: { company: row.row.row.company, title: row.row.row.title },
          });
        },
      );
      write({ kind: "done", added: result.added, skipped: result.skipped, entries: result.entries });
    } catch (e) {
      const err = toBridgeError(e);
      write({ kind: "failed", error: { code: err.code, message: err.message } });
    }

    reply.raw.end();
  });

  return { fastify, store };
}

/* -------------------------------------------------------------------------- */
/*  Background evaluation runner                                              */
/* -------------------------------------------------------------------------- */

async function runEvaluationInBackground(
  adapter: PipelineAdapter,
  store: ReturnType<typeof createInMemoryJobStore>,
  jobId: JobId,
  input: EvaluationInput,
  timeoutSec: number
): Promise<void> {
  const startedAt = Date.now();
  console.log(
    JSON.stringify({
      level: 30,
      msg: "evaluation started",
      jobId,
      url: input.url,
      timeoutSec,
    })
  );

  const timeoutMs = timeoutSec * 1000;
  const timeout = new Promise<BridgeError>((resolve) =>
    setTimeout(() => resolve({
      code: "TIMEOUT",
      message: `evaluation timed out after ${timeoutSec}s`,
    }), timeoutMs)
  );

  const evaluation = adapter.runEvaluation(jobId, input, (transition) => {
    console.log(
      JSON.stringify({
        level: 30,
        msg: "evaluation progress",
        jobId,
        phase: transition.phase,
        note: transition.note ?? null,
      })
    );
    // Fire-and-forget the progress update into the store.
    void store.pushTransition(jobId, transition);
  });

  const result = await Promise.race([evaluation, timeout]);

  if (isBridgeError(result)) {
    await store.markFailed(jobId, result);
    console.log(JSON.stringify({ level: 30, msg: "evaluation finished", jobId, phase: "failed", durationMs: Date.now() - startedAt }));
    return;
  }
  await store.markCompleted(jobId, result);
  console.log(JSON.stringify({ level: 30, msg: "evaluation finished", jobId, phase: "completed", durationMs: Date.now() - startedAt }));
}

function isBridgeError(v: unknown): v is BridgeError {
  return (
    typeof v === "object" &&
    v !== null &&
    "code" in v &&
    "message" in v &&
    typeof (v as { code: unknown }).code === "string"
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

interface MinimalReply {
  code(n: number): MinimalReply;
  send(body: unknown): unknown;
}

function sendFailure(reply: MinimalReply, requestId: string, err: BridgeError) {
  reply.code(httpStatusFor(err.code)).send(failure(requestId, err));
}

function requestIdFromRequest(req: { body: unknown }): string {
  const body = req.body;
  if (body && typeof body === "object" && "requestId" in body) {
    const rid = (body as { requestId: unknown }).requestId;
    if (typeof rid === "string") return rid;
  }
  return "unauthenticated";
}

function requestIdFromBody(body: unknown): string {
  if (body && typeof body === "object" && "requestId" in body) {
    const rid = (body as { requestId: unknown }).requestId;
    if (typeof rid === "string") return rid;
  }
  return "unknown";
}
