import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readMemory } from "@/lib/career-ops";
import { getSession } from "@/lib/apply/session";
import { buildAnswerPrompt, extractJsonObject, runPlanner, type PlannerField } from "@/lib/apply/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 320;

// AI pre-fill for an OPEN apply session (STREAMING NDJSON). The user's BYO CLI
// (read-only planner, no browser access) drafts an answer per scraped field from
// cv.md / profile / the job's report. We stream a live diagnostic log of every
// step so a stuck or empty prefill is observable on the page AND written to
// <root>/.career-ops-web/apply-prefill.log for debugging.
//
// The prompt, the spawn and the truncation-tolerant JSON parse now live in
// lib/apply/planner.ts, shared with /api/answers (#8), so a question typed into
// the job page is drafted under exactly the same grounding and sensitive-field
// rules as one scraped off a live form.

export async function POST(req: Request) {
  let body: { sessionId?: string; cliId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { sessionId, cliId } = body;
  const t0 = Date.now();
  const encoder = new TextEncoder();
  const logPath = path.join(careerOpsRoot(), ".career-ops-web", "apply-prefill.log");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  } catch {
    /* ignore */
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* client gone */
        }
      };
      const log = (m: string) => {
        const el = Date.now() - t0;
        emit({ t: "log", m, el });
        try {
          fs.appendFileSync(logPath, `${new Date(t0 + el).toISOString()} [+${(el / 1000).toFixed(1)}s] ${m}\n`);
        } catch {
          /* ignore */
        }
      };
      const fail = (m: string, raw?: string) => {
        log(`ERROR: ${m}`);
        emit({ t: "error", m, raw });
        controller.close();
      };
      try {
        fs.appendFileSync(logPath, `\n===== prefill ${new Date(t0).toISOString()} session=${sessionId} cli=${cliId} =====\n`);
      } catch {
        /* ignore */
      }

      const s = sessionId ? getSession(sessionId) : undefined;
      if (!s) return fail("apply session not found (it may have expired)");
      if (!cliId) return fail("no CLI selected");

      const fields: PlannerField[] = s.fields.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        required: f.required,
        options: f.options,
      }));
      const prompt = buildAnswerPrompt({ title: s.title, fields, memory: readMemory() });
      log(`Form: "${s.title}" · ${fields.length} fields · prompt ${prompt.length} chars`);

      const result = await runPlanner({ cliId, prompt, fieldCount: fields.length, onLog: log });
      if (result.error && !result.buf) return fail(result.error);

      log(`Planner exited code=${result.code} signal=${result.signal} · ${result.buf.length} chars total`);
      log(`output head: ${result.buf.slice(0, 100).replace(/\s+/g, " ") || "(empty)"}`);
      log(`output tail: ${result.buf.slice(-100).replace(/\s+/g, " ") || "(empty)"}`);

      if (!result.buf.trim()) {
        return fail(
          result.signal
            ? "planner was killed before producing any output (try again / smaller form)"
            : "planner produced no output (check the CLI works in this folder)",
        );
      }

      const { obj, truncated } = extractJsonObject(result.buf);
      if (!obj) {
        return fail(
          result.signal
            ? "planner was killed mid-answer (form too large/slow), couldn't recover any fields"
            : "couldn't parse the planner's answer as JSON",
          result.buf.slice(-300),
        );
      }
      const count = Object.keys(obj).length;
      log(`Parsed ${count} answers${truncated ? " (RECOVERED from truncated output, some fields may be missing)" : ""}`);
      emit({ t: "done", answers: obj, truncated, count });
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
