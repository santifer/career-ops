/**
 * workers/batch-live-sse-worker.mjs
 * Cloudflare Workers + Durable Objects — batch-live SSE production stub
 *
 * DEPLOYMENT TARGET (not yet deployed — local Node.js server handles SSE today)
 * ===========================================================================
 * On Cloudflare Workers, SSE via Durable Objects collapses 194 poll
 * invocations/session into one persistent connection. Workers bills per
 * CPU-time request; a single long-lived stream is ~5–10× cheaper than polling
 * at scale.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  BatchLiveDurableObject (one per deployment)        │
 *   │  ─ holds canonical batchLive state in memory        │
 *   │  ─ receives POST /internal/push from a batch runner │
 *   │    whenever batch-state.tsv changes                 │
 *   │  ─ broadcasts SSE "batch-live" events to all        │
 *   │    subscribed WebSocket / TransformStream clients   │
 *   └──────────────────┬──────────────────────────────────┘
 *                       │ Durable Object ID: env.BATCH_LIVE_DO
 *   ┌──────────────────▼──────────────────────────────────┐
 *   │  BatchLiveWorker (edge router)                      │
 *   │  GET  /api/batch-live-stream → upgrade to SSE DO   │
 *   │  GET  /api/batch-live        → JSON snapshot (poll) │
 *   │  POST /internal/push         → forward to DO        │
 *   └─────────────────────────────────────────────────────┘
 *
 * To deploy:
 *   1. wrangler init --name batch-live-worker
 *   2. Copy this file to src/index.mjs in the wrangler project.
 *   3. Add to wrangler.toml:
 *        [durable_objects]
 *        bindings = [{ name = "BATCH_LIVE_DO", class_name = "BatchLiveDurableObject" }]
 *        [[migrations]]
 *        tag = "v1"
 *        new_classes = ["BatchLiveDurableObject"]
 *   4. wrangler deploy
 *   5. Point career-ops dashboard BASE to the worker URL and update
 *      scripts/build-dashboard.mjs _initBatchStream() to use
 *      `${BASE}/api/batch-live-stream` for the EventSource URL.
 *
 * Env vars required:
 *   INTERNAL_SECRET — shared secret for POST /internal/push authorization
 */

// ── Durable Object: holds state + fan-out to SSE clients ──────────
export class BatchLiveDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
    // Map<id, { controller: ReadableStreamDefaultController }>
    this._clients = new Map();
    this._nextId  = 1;
    // Last known batchLive payload — sent immediately on new connections.
    this._lastPayload = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ── POST /internal/push — receive new batchLive snapshot from runner ──
    if (request.method === 'POST' && url.pathname === '/internal/push') {
      const secret = request.headers.get('x-internal-secret');
      if (secret !== (this.env.INTERNAL_SECRET || '')) {
        return new Response('Unauthorized', { status: 401 });
      }
      let payload;
      try { payload = await request.json(); }
      catch { return new Response('Bad JSON', { status: 400 }); }
      this._lastPayload = payload;
      this._broadcast(payload);
      return new Response(JSON.stringify({ ok: true, clients: this._clients.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── GET /api/batch-live-stream — open SSE connection ──────────
    if (request.method === 'GET' && url.pathname === '/api/batch-live-stream') {
      const id = this._nextId++;
      let controller;
      const stream = new ReadableStream({
        start: (ctrl) => { controller = ctrl; },
        cancel: () => { this._clients.delete(id); },
      });
      this._clients.set(id, { controller });

      // Send initial snapshot immediately.
      if (this._lastPayload) {
        this._sendEvent(controller, 'batch-live', this._lastPayload);
      }

      // Keepalive every 25s via alarm.
      // (In DO, use setInterval via alarm API — not browser setInterval.)
      // For simplicity in this stub, keepalives are driven by the broadcast loop.

      return new Response(stream, {
        headers: {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // ── GET /api/batch-live — JSON snapshot (poll fallback) ───────
    if (request.method === 'GET' && url.pathname === '/api/batch-live') {
      const payload = this._lastPayload || { total: 0, completed: 0, failed: 0, running: 0, pending: 0, pct: 0, rows: [], triageItems: [] };
      return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  _sendEvent(controller, event, data) {
    try {
      const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(new TextEncoder().encode(chunk));
    } catch (_) {}
  }

  _broadcast(payload) {
    for (const [id, { controller }] of this._clients) {
      try {
        this._sendEvent(controller, 'batch-live', payload);
      } catch (_) {
        this._clients.delete(id);
      }
    }
  }
}

// ── Worker entry point (edge router) ──────────────────────────────
export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // All batch-live routes go to the single Durable Object instance.
    if (path === '/api/batch-live-stream' || path === '/api/batch-live' || path === '/internal/push') {
      const id = env.BATCH_LIVE_DO.idFromName('singleton');
      const stub = env.BATCH_LIVE_DO.get(id);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
