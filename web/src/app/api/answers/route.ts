import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript, findReportFile, readMemory } from "@/lib/career-ops";
import { buildAnswerPrompt, extractJsonObject, runPlanner, toAnswers, type PlannerField } from "@/lib/apply/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 320;

// Application follow-up questions, against a REPORT rather than a live form (#8).
//
// Applications routinely ask free-text questions ("Describe a workflow you've
// changed using AI, under 150 words"). Until now the only way to draft one was
// /api/apply/prefill, which requires an open Playwright session, so whenever the
// apply flow could not open the form the drafting capability went with it, even
// though drafting needs no browser at all.
//
// GET  ?n=<report>          → the questions and answers stored on that report
// POST {n, questions[]}     → save questions (no drafting)
// POST {n, questions[], draft:true, cliId} → draft the unanswered ones, then save
//
// Storage is the report's `## Application Answers` section, written by the core
// application-answers.mjs, so the CLI `apply` mode reads back exactly what the web
// UI wrote (modes/apply.md step 4 already says to reuse a previous section).

type Q = { question: string; answer: string; maxWords?: number };

/** Guard rails on user-pasted input, so one paste cannot blow up a report. */
const MAX_QUESTIONS = 40;
const MAX_QUESTION_CHARS = 2000;
const MAX_ANSWER_CHARS = 20000;

function reportPathOr404(n: string): string | null {
  return findReportFile(n);
}

/** Read the stored section via the core parser (the module that owns the format).
 *  pathToFileURL, not a hand-built `file://` string: a Windows path or a space in
 *  the project path does not survive naive concatenation, and CI runs Windows.
 *  Mirrors the loader in lib/core/text-key.ts. */
async function readStored(file: string): Promise<{ present: boolean; date: string; state: string; freeText: Q[]; source?: "saved" | "block-h" }> {
  const core = path.join(careerOpsRoot(), "application-answers.mjs");
  const mod = await import(/* webpackIgnore: true */ pathToFileURL(core).href).catch(() => null);
  const empty = { present: false, date: "", state: "", freeText: [] as Q[] };
  if (!mod?.parseApplicationAnswersSection) return empty;
  try {
    const text = fs.readFileSync(file, "utf8");
    const parsed = mod.parseApplicationAnswersSection(text);
    if (parsed?.present) {
      return {
        present: true,
        date: String(parsed.date ?? ""),
        state: String(parsed.state ?? ""),
        freeText: Array.isArray(parsed.freeText) ? parsed.freeText : [],
        source: "saved" as const,
      };
    }
    // Nothing saved yet. The evaluation mode may already have drafted answers in
    // Block H, and modes/apply.md treats those as a legitimate base for a real
    // application, so seed from them rather than showing an empty page. Nothing is
    // written until the user saves, so this stays a suggestion.
    const h = mod.parseDraftAnswersBlockH?.(text);
    if (h?.present && h.freeText.length > 0) {
      return { present: false, date: "", state: "", freeText: h.freeText, source: "block-h" as const };
    }
    return empty;
  } catch {
    return empty;
  }
}

/** Persist through the core script so CLI and web produce a byte-identical section. */
function writeStored(file: string, questions: Q[], state: string): Promise<{ ok: boolean; error?: string }> {
  const payload = JSON.stringify({
    state,
    freeText: questions.map((q) => ({ question: q.question, answer: q.answer })),
  });
  const tmp = path.join(os.tmpdir(), `co-answers-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, payload);
  return new Promise((resolve) => {
    execFile(
      "node",
      [rootScript("application-answers"), "--report", file, "--input", tmp, "--state", state],
      { cwd: careerOpsRoot(), timeout: 20_000 },
      (err, _out, stderr) => {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* best effort */
        }
        if (err) resolve({ ok: false, error: (stderr || err.message).slice(0, 200) });
        else resolve({ ok: true });
      },
    );
  });
}

/** A stated word cap ("under 150 words", "max 150 words", "150 words or fewer"). */
export function wordCapFrom(text: string): number | undefined {
  const m = String(text ?? "").match(/(?:under|below|max(?:imum)?(?:\s+of)?|no more than|fewer than|less than|within)\s+(\d{2,4})\s*words/i)
    || String(text ?? "").match(/(\d{2,4})\s*words\s*(?:or\s*(?:fewer|less)|max(?:imum)?)/i);
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 5000 ? n : undefined;
}

function sanitize(raw: unknown): Q[] {
  if (!Array.isArray(raw)) return [];
  const out: Q[] = [];
  for (const item of raw.slice(0, MAX_QUESTIONS)) {
    const rec = (item ?? {}) as Record<string, unknown>;
    const question = String(rec.question ?? "").trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) continue;
    const answer = String(rec.answer ?? "").slice(0, MAX_ANSWER_CHARS);
    out.push({ question, answer, maxWords: wordCapFrom(question) });
  }
  return out;
}

export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n")?.trim() ?? "";
  if (!n) return Response.json({ error: "a report number is required" }, { status: 400 });
  const file = reportPathOr404(n);
  if (!file) return Response.json({ error: `no report found for #${n}` }, { status: 404 });
  const stored = await readStored(file);
  return Response.json({
    ...stored,
    freeText: stored.freeText.map((q) => ({ ...q, maxWords: wordCapFrom(q.question) })),
  });
}

export async function POST(req: Request) {
  let body: { n?: string; questions?: unknown; draft?: boolean; cliId?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const n = String(body.n ?? "").trim();
  if (!n) return Response.json({ error: "a report number is required" }, { status: 400 });
  // findReportFile enforces containment under the project root.
  const file = reportPathOr404(n);
  if (!file) return Response.json({ error: `no report found for #${n}` }, { status: 404 });

  const questions = sanitize(body.questions);
  if (questions.length === 0) return Response.json({ error: "add at least one question" }, { status: 400 });

  // `submitted` is a claim about the real world, so it is only ever set from an
  // explicit request, never inferred from the fact that answers exist.
  const state = body.state === "submitted" ? "submitted" : "filled";

  if (!body.draft) {
    const saved = await writeStored(file, questions, state);
    if (!saved.ok) return Response.json({ error: `could not save: ${saved.error}` }, { status: 500 });
    return Response.json({ ok: true, questions, drafted: 0 });
  }

  const cliId = String(body.cliId ?? "").trim();
  if (!cliId) return Response.json({ error: "no CLI selected to draft with" }, { status: 400 });

  // Only draft what is still blank, so an answer the user wrote or edited is never
  // silently overwritten by a regenerated one.
  const todo = questions.filter((q) => !q.answer.trim());
  if (todo.length === 0) {
    const saved = await writeStored(file, questions, state);
    if (!saved.ok) return Response.json({ error: `could not save: ${saved.error}` }, { status: 500 });
    return Response.json({ ok: true, questions, drafted: 0, note: "every question already had an answer" });
  }

  const title = path.basename(file).replace(/^\d+-/, "").replace(/-\d{4}-\d{2}-\d{2}\.md$/, "").replace(/-/g, " ");
  const fields: PlannerField[] = todo.map((q, i) => ({
    id: `q${i}`,
    type: "textarea",
    label: q.question,
    required: false,
    maxWords: q.maxWords,
  }));

  const prompt = buildAnswerPrompt({ title, fields, memory: readMemory() });
  const run = await runPlanner({ cliId, prompt, fieldCount: fields.length });
  if (run.error && !run.buf) return Response.json({ error: run.error }, { status: 500 });
  if (!run.buf.trim()) {
    return Response.json(
      { error: run.signal ? "the planner was killed before answering" : "the planner produced no output" },
      { status: 500 },
    );
  }

  const { obj, truncated } = extractJsonObject(run.buf);
  if (!obj) return Response.json({ error: "could not read the planner's answer" }, { status: 500 });
  const answers = toAnswers(obj);

  let drafted = 0;
  const merged = questions.map((q) => {
    if (q.answer.trim()) return q;
    const idx = todo.indexOf(q);
    const a = idx === -1 ? undefined : answers[`q${idx}`];
    if (!a || !a.value.trim()) return q;
    drafted += 1;
    // needs_confirmation marks the sensitive fields the planner is told to refuse
    // (legal, visa, work authorization, salary, demographic). Those come back
    // blank by design, so they stay the user's to answer.
    return { ...q, answer: a.value };
  });

  const saved = await writeStored(file, merged, state);
  if (!saved.ok) return Response.json({ error: `drafted, but could not save: ${saved.error}` }, { status: 500 });
  return Response.json({ ok: true, questions: merged, drafted, truncated });
}
