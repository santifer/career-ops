"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ExternalLink, ChevronsUpDown, Sparkles, Loader2, X } from "lucide-react";
import type { Application, InboxJob } from "@/lib/career-ops";
import { Badge } from "@/components/ui/badge";
import { CostBadge } from "@/components/cost/cost-badge";
import { useJobs } from "@/components/jobs/job-store";
import { CompanyLogo } from "@/components/company-logo";
import { canonStatus, scoreNum, scoreTone, statusDot } from "@/lib/format";
import { cn } from "@/lib/cn";

// INBOX (the action queue) is the default tab; the rest filter the tracker.
const TABS = [
  "INBOX",
  "ALL",
  "EVALUATED",
  "APPLIED",
  "RESPONDED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DISCARDED",
  "SKIP",
] as const;
type Tab = (typeof TABS)[number];

const SORT_KEYS = ["company", "role", "score", "status", "date"] as const;
type SortKey = (typeof SORT_KEYS)[number];

export function PipelineView({
  applications,
  inbox,
}: {
  applications: Application[];
  inbox: InboxJob[];
}) {
  const { jobs, startJob } = useJobs();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // The URL is the SINGLE source of truth for tab/min/sort/dir, so the home stat
  // tiles' deep links AND the assistant's filterPipeline/navigate actions drive
  // the table identically (no useState mirror → no desync).
  const pTab = (params.get("tab") ?? "").toUpperCase();
  const tab: Tab = (TABS as readonly string[]).includes(pTab) ? (pTab as Tab) : "INBOX";
  const pMin = parseFloat(params.get("min") ?? "");
  const minFilter: number | null = Number.isFinite(pMin) ? pMin : null;
  const pSort = params.get("sort") ?? "";
  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(pSort) ? (pSort as SortKey) : "score";
  const sort = { key: sortKey, dir: (params.get("dir") === "1" ? 1 : -1) as 1 | -1 };

  // Search stays LOCAL for snappy typing; seeded from the URL and re-synced only
  // when the URL's q changes (i.e. the assistant set it) — never per keystroke.
  const [q, setQ] = useState(params.get("q") ?? "");
  const lastUrlQ = useRef(params.get("q") ?? "");
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ !== lastUrlQ.current) {
      lastUrlQ.current = urlQ;
      setQ(urlQ);
    }
  }, [params]);

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") sp.delete(k);
        else sp.set(k, String(v));
      }
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [params, router, pathname],
  );

  const pendingInbox = useMemo(() => inbox.filter((j) => !j.done), [inbox]);

  // Link each inbox posting to its worker (by URL) so the row can show
  // Evaluate → Evaluating… → processed·score.
  const jobByUrl = useMemo(() => {
    const m = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      if (!j.input || j.kind === "research") continue;
      const ex = m.get(j.input);
      if (!ex || j.startedAt > ex.startedAt) m.set(j.input, j);
    }
    return m;
  }, [jobs]);

  const processedCount = useMemo(
    () => pendingInbox.filter((j) => jobByUrl.get(j.url)?.status === "done").length,
    [pendingInbox, jobByUrl],
  );

  const filteredInbox = useMemo(() => {
    let list = pendingInbox;
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((j) => `${j.company} ${j.role}`.toLowerCase().includes(needle));
    }
    // processed (done) rows sink to the bottom — the inbox drains toward processed
    return [...list].sort((a, b) => {
      const pa = jobByUrl.get(a.url)?.status === "done" ? 1 : 0;
      const pb = jobByUrl.get(b.url)?.status === "done" ? 1 : 0;
      return pa - pb;
    });
  }, [pendingInbox, q, jobByUrl]);

  const filtered = useMemo(() => {
    if (tab === "INBOX") return [];
    let rows = applications;
    if (tab !== "ALL") rows = rows.filter((r) => canonStatus(r.status).includes(tab));
    if (minFilter != null) {
      rows = rows.filter((r) => {
        const n = scoreNum(r.score);
        return !Number.isNaN(n) && n >= minFilter;
      });
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => `${r.company} ${r.role}`.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => {
      if (sort.key === "score") {
        const an = scoreNum(a.score);
        const bn = scoreNum(b.score);
        const av = Number.isNaN(an) ? -Infinity : an;
        const bv = Number.isNaN(bn) ? -Infinity : bn;
        return (av - bv) * sort.dir;
      }
      return (a[sort.key] || "").localeCompare(b[sort.key] || "") * sort.dir;
    });
  }, [applications, tab, q, sort, minFilter]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular-nums">{pendingInbox.length - processedCount}</span> in inbox
            {processedCount > 0 && (
              <>
                {" "}
                · <span className="tabular-nums text-brand">{processedCount}</span> processed
              </>
            )}{" "}
            · <span className="tabular-nums">{applications.length}</span> tracked
          </p>
        </div>
        <div className="relative w-64 max-w-[40vw]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company or role…"
            className="w-full rounded-md border border-border bg-surface/60 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/40"
          />
        </div>
      </div>

      {/* tabs */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const count =
            t === "INBOX"
              ? pendingInbox.length - processedCount
              : t === "ALL"
                ? applications.length
                : applications.filter((r) => canonStatus(r.status).includes(t)).length;
          return (
            <button
              key={t}
              onClick={() => setParams({ tab: t === "INBOX" ? null : t })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                tab === t
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t} <span className="text-faint tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {tab !== "INBOX" && minFilter != null && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-faint">Filtered:</span>
          <button
            type="button"
            onClick={() => setParams({ min: null })}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/15"
            title="Clear score filter"
          >
            score ≥ {minFilter.toFixed(1)}
            <X className="size-3" />
          </button>
        </div>
      )}

      {tab === "INBOX" ? (
        /* ── Inbox: the action queue with worker triggers ── */
        filteredInbox.length > 0 ? (
          <>
          {/* Cost cue ONCE for the whole inbox, not per row — teaches the free/
              spend boundary (Explore's model) without stacking brand badges. */}
          <p className="mt-4 flex items-center gap-1.5 px-1 text-xs text-faint">
            <CostBadge kind="spend" size="xs" /> Evaluating a role runs your AI — the scan that filled this inbox was free.
          </p>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
            {filteredInbox.slice(0, 60).map((j, i) => {
              const job = jobByUrl.get(j.url);
              const processed = job?.status === "done";
              const launch = () =>
                startJob({ title: `Evaluate · ${j.company}`, subtitle: j.role, kind: "evaluate", input: j.url, page: "/pipeline" });
              return (
                <li
                  key={`${j.url}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-surface-hover",
                    processed && "opacity-60",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={j.company} size={20} />
                    <span className="shrink-0 text-sm font-medium">{j.company}</span>
                    <span className="truncate text-sm text-muted">{j.role}</span>
                    {j.location && <span className="hidden shrink-0 text-xs text-faint sm:inline">· {j.location}</span>}
                    {j.compensation && <span className="hidden shrink-0 text-xs font-medium text-muted sm:inline">· {j.compensation}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {job?.status === "running" ? (
                      <Link
                        href={`/jobs/${job.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand"
                      >
                        <Loader2 className="size-3.5 animate-spin" /> Evaluating…
                      </Link>
                    ) : job?.status === "done" ? (
                      <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-xs">
                        {job.result?.score != null && <Badge tone={job.result.tone}>{job.result.score}/5</Badge>}
                        <span className="text-faint">processed</span>
                      </Link>
                    ) : job?.status === "error" ? (
                      <button type="button" onClick={launch} className="text-xs text-red-400 transition-colors hover:underline">
                        Retry
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={launch}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-brand"
                        title="Evaluate this posting — spins up a worker on your CLI"
                      >
                        <Sparkles className="size-3.5" />
                        <span className="hidden sm:inline">Evaluate</span>
                      </button>
                    )}
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1 text-faint transition-colors hover:text-brand"
                      aria-label={`Open ${j.company} posting`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        ) : (
          <InboxEmpty count={pendingInbox.length} filtered={q.trim().length > 0} />
        )
      ) : filtered.length > 0 ? (
        /* ── Tracker table ── */
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-faint">
              <tr>
                {SORT_KEYS.map((k) => (
                  <th
                    key={k}
                    className="cursor-pointer select-none px-4 py-2.5 font-medium hover:text-foreground"
                    onClick={() => setParams({ sort: k, dir: sort.key === k ? sort.dir * -1 : -1 })}
                  >
                    <span className="inline-flex items-center gap-1">
                      {k}
                      <ChevronsUpDown className="size-3" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <tr key={`${r.n}-${i}`} className="group transition-colors hover:bg-surface/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/pipeline/${r.n}`} className="flex items-center gap-2.5 transition-colors group-hover:text-brand">
                      <CompanyLogo name={r.company} size={20} />
                      {r.company}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <Link href={`/pipeline/${r.n}`}>{r.role}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={scoreTone(r.score)}>{r.score || "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("size-1.5 shrink-0 rounded-full", statusDot(r.status))} />
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-faint tabular-nums">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
          <p className="font-display text-lg">No matches</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Try a different tab or clear the search.</p>
        </div>
      )}
    </div>
  );
}

// Empty inbox = the app's terminal-card cue (CLI heritage spent once, honestly).
function InboxEmpty({ count, filtered }: { count: number; filtered: boolean }) {
  if (filtered) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
        <p className="font-display text-lg">No matches</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Clear the search to see the full inbox.</p>
      </div>
    );
  }
  return (
    <div className="dot-bg mt-4 overflow-hidden rounded-2xl border border-border bg-surface/50 bg-origin-border bg-gradient-to-tr from-brand/10 via-transparent to-transparent shadow-lg">
      <div className="flex items-center gap-2 border-b border-foreground/10 px-5 py-3">
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="ml-3 font-mono text-xs tracking-wide text-muted">
          <span className="text-foreground/40">&gt;_</span> career-ops scan
        </span>
      </div>
      <div className="px-6 py-12 text-center">
        <p className="font-display text-lg">
          Your <span className="text-brand">inbox</span> is empty.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {count > 0
            ? "Nothing pending right now."
            : "Run a scan or drop job URLs into data/pipeline.md to fill it."}
        </p>
        <p className="mt-4 font-mono text-xs text-faint">
          $ career-ops scan
          <span
            aria-hidden="true"
            className="cli-cursor ml-0.5 inline-block h-[1em] w-[0.35em] bg-current align-middle"
          />
        </p>
      </div>
    </div>
  );
}
