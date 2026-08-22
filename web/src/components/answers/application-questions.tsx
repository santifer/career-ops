"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Check } from "lucide-react";

// Application follow-up questions, on the job page (#8).
//
// Applications routinely ask free-text questions ("Describe a workflow you've
// meaningfully changed using AI in the last few months. Under 150 words."). The
// only place to draft one used to be the apply flow, which needs a live browser
// session on the employer's form, so when that could not open there was nowhere
// to put the question at all.
//
// This works with no session and no successful apply: paste the questions, draft
// answers from the same grounded planner the apply prefill uses, edit them, and
// they persist into the report's `## Application Answers` section that the CLI
// apply mode already knows how to reuse.

type Q = { question: string; answer: string; maxWords?: number };

const CONFIG_KEY = "career-ops:config";
function cliId(): string | null {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").cliId || null;
  } catch {
    return null;
  }
}

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Split a pasted block into questions. Blank-line separated when the paste uses
 *  blank lines (a question can wrap over lines), otherwise one per line. */
export function splitQuestions(text: string): string[] {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const parts = raw.includes("\n\n") ? raw.split(/\n{2,}/) : raw.split("\n");
  return parts
    .map((p) => p.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function ApplicationQuestions({ n }: { n: string }) {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "draft">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState<"saved" | "block-h" | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/answers?n=${encodeURIComponent(n)}`);
      const j = await r.json();
      if (Array.isArray(j.freeText)) setQuestions(j.freeText);
      if (j.source === "saved" || j.source === "block-h") setSource(j.source);
    } catch {
      /* best effort: an empty section is the normal starting state */
    } finally {
      setLoading(false);
    }
  }, [n]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, as: "save" | "draft") => {
    setBusy(as);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch("/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, questions, ...body }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setError(typeof j.error === "string" ? j.error : "That did not work.");
        return;
      }
      if (Array.isArray(j.questions)) setQuestions(j.questions);
      setSource("saved");
      setSaved(true);
    } catch {
      setError("That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const addPasted = () => {
    const added = splitQuestions(paste).map((question) => ({ question, answer: "" }));
    if (added.length === 0) return;
    setQuestions((q) => [...q, ...added]);
    setPaste("");
    setSaved(false);
  };

  const update = (i: number, answer: string) => {
    setQuestions((q) => q.map((item, idx) => (idx === i ? { ...item, answer } : item)));
    setSaved(false);
  };

  const remove = (i: number) => {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
    setSaved(false);
  };

  if (loading) return null;

  const unanswered = questions.filter((q) => !q.answer.trim()).length;
  const cli = cliId();

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg text-landing">Application questions</h2>
        {questions.length > 0 && (
          <span className="text-xs text-faint">
            {questions.length} question{questions.length === 1 ? "" : "s"}
            {unanswered > 0 ? ` · ${unanswered} unanswered` : " · all answered"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Paste the follow-up questions this application asks. Answers are drafted from your CV and
        profile, saved onto this report, and reused next time you apply here.
      </p>

      {/* Seeded content is a suggestion, not a record. Saying so prevents a draft
          written during evaluation from being mistaken for an answer already sent. */}
      {source === "block-h" && questions.length > 0 && (
        <p className="mt-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-muted">
          Starting from the answers drafted during this offer&apos;s evaluation. Nothing is stored
          against this report until you save.
        </p>
      )}

      {questions.length > 0 && (
        <ol className="mt-4 space-y-4">
          {questions.map((q, i) => {
            const words = countWords(q.answer);
            const over = q.maxWords ? words > q.maxWords : false;
            return (
              <li key={`${i}-${q.question.slice(0, 24)}`} className="rounded-xl border border-border bg-surface/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground">{q.question}</p>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="Remove question"
                    className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-rose-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <textarea
                  value={q.answer}
                  onChange={(e) => update(i, e.target.value)}
                  rows={q.answer ? 5 : 3}
                  placeholder={busy === "draft" ? "Drafting…" : "Your answer, or draft it below"}
                  className="mt-2.5 w-full resize-y rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50"
                />
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <span className={over ? "text-rose-400" : "text-faint"}>
                    {words} word{words === 1 ? "" : "s"}
                    {q.maxWords ? ` / ${q.maxWords}` : ""}
                  </span>
                  {over && <span className="text-rose-400">over the limit this question states</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4">
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder={"Paste one or more questions.\nOne per line, or separated by blank lines."}
          className="w-full resize-y rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addPasted}
            disabled={!paste.trim()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Add
          </button>

          <button
            type="button"
            onClick={() => post({ draft: true, cliId: cli }, "draft")}
            disabled={busy !== null || unanswered === 0 || !cli}
            title={!cli ? "Choose an AI tool in Config first" : unanswered === 0 ? "Every question already has an answer" : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-50"
          >
            {busy === "draft" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {busy === "draft" ? "Drafting…" : `Draft ${unanswered || ""} answer${unanswered === 1 ? "" : "s"}`.trim()}
          </button>

          <button
            type="button"
            onClick={() => post({}, "save")}
            disabled={busy !== null || questions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
            {saved && busy === null ? "Saved" : "Save"}
          </button>
        </div>
        {!cli && (
          <p className="mt-2 text-xs text-faint">Pick an AI tool in Config to draft answers. You can still write and save them yourself.</p>
        )}
        <p className="mt-2 text-xs text-faint">
          Legal, visa, work authorization, salary and demographic questions are left blank on purpose.
          Those are yours to answer.
        </p>
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
