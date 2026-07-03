"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FILTERS,
  ATS_LABEL,
  filtersToParams,
  aiToParams,
  isBroadSearch,
  parseExplorePatch,
  type AtsSource,
  type DiscoveredOffer,
  type ExploreFilters,
  type ExploreMode,
  type ScanEvent,
} from "@/lib/explore";
import { makeAiStreamParser, type AiTraceChunk } from "@/lib/explore-ai";

export type Phase =
  | "idle"
  | "casting"
  | "scanning"
  | "revealing"
  | "results"
  | "empty-current"
  | "empty-loose"
  | "failed"
  | "hunting" // AI search streaming
  | "blocked"; // AI search needs a CLI
export type AiCost = { searches: number; candidates: number; fetches: number };
export type SourceState = {
  state: "queued" | "active" | "swept" | "noisy";
  companies?: number;
  done?: number;
  total?: number;
  matches?: number;
  unreachable?: number;
};

type ExploreCtx = {
  filters: ExploreFilters;
  setFilters: (f: ExploreFilters) => void;
  /** Set filters from a seed/URL only if the user/assistant hasn't touched them
   *  yet — so a fresh page mount can't clobber assistant-set filters. */
  initFilters: (f: ExploreFilters) => void;
  phase: Phase;
  running: boolean;
  offers: DiscoveredOffer[];
  sources: Partial<Record<AtsSource, SourceState>>;
  matchCount: number;
  companiesScanned: number;
  status: string;
  partial: boolean;
  error: string;
  added: Set<string>;
  adding: Set<string>;
  discover: () => Promise<void>;
  addToPipeline: (offers: DiscoveredOffer[]) => Promise<number>;
  applyPatch: (raw: Record<string, unknown>, opts?: { merge?: boolean; run?: boolean }) => void;
  reset: () => void;
  // ── AI search (modes/discover.md) ──
  mode: ExploreMode;
  setMode: (m: ExploreMode) => void;
  aiIntent: string;
  setAiIntent: (s: string) => void;
  discoverAI: () => Promise<void>;
  aiTrace: AiTraceChunk[];
  aiCost: AiCost;
};

const Ctx = createContext<ExploreCtx | null>(null);
export function useExplore(): ExploreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useExplore must be used within <ExploreProvider>");
  return c;
}

export function ExploreProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<ExploreFilters>({ ...DEFAULT_FILTERS, ats: [...DEFAULT_FILTERS.ats] });
  const touched = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [offers, setOffers] = useState<DiscoveredOffer[]>([]);
  const [sources, setSources] = useState<Partial<Record<AtsSource, SourceState>>>({});
  const [matchCount, setMatchCount] = useState(0);
  const [companiesScanned, setCompaniesScanned] = useState(0);
  const [status, setStatus] = useState("");
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [mode, setModeState] = useState<ExploreMode>("scan");
  const [aiIntent, setAiIntent] = useState("");
  const [aiTrace, setAiTrace] = useState<AiTraceChunk[]>([]);
  const [aiCost, setAiCost] = useState<AiCost>({ searches: 0, candidates: 0, fetches: 0 });
  const runningRef = useRef(false);
  const aiIntentRef = useRef(aiIntent);
  aiIntentRef.current = aiIntent;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const setFilters = useCallback((f: ExploreFilters) => {
    touched.current = true;
    filtersRef.current = f;
    setFiltersState(f);
  }, []);
  const initFilters = useCallback((f: ExploreFilters) => {
    if (touched.current) return;
    filtersRef.current = f;
    setFiltersState(f);
  }, []);

  const discover = useCallback(async () => {
    if (runningRef.current) return;
    const f = filtersRef.current;
    runningRef.current = true;
    setPhase("casting");
    setOffers([]);
    setMatchCount(0);
    setCompaniesScanned(0);
    setPartial(false);
    setError("");
    setStatus("Casting the net across the ATS network…");
    const init: Partial<Record<AtsSource, SourceState>> = {};
    for (const a of f.ats) init[a] = { state: "queued" };
    setSources(init);
    if (typeof window !== "undefined") {
      const qs = filtersToParams(f);
      window.history.replaceState(null, "", `/explore${qs ? `?${qs}` : ""}`);
    }

    const acc: DiscoveredOffer[] = [];
    let sawError = "";
    try {
      const r = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (r.status === 400) {
        const d = await r.json().catch(() => ({}));
        sawError = d.error || "The scanner isn't available.";
      } else if (!r.body) {
        sawError = "No response stream.";
      } else {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: ScanEvent;
            try {
              ev = JSON.parse(line) as ScanEvent;
            } catch {
              continue;
            }
            switch (ev.kind) {
              case "atsStart":
                setPhase("scanning");
                setStatus(`Walking ${ATS_LABEL[ev.ats as AtsSource] ?? ev.ats} — ${ev.companies.toLocaleString()} companies`);
                setSources((s) => ({ ...s, [ev.ats]: { ...s[ev.ats as AtsSource], state: "active", companies: ev.companies } }));
                break;
              case "progress":
                // `matches` is the GLOBAL running total (the engine batches the
                // offer list to the very end), so it drives the live hero counter.
                setMatchCount((m) => Math.max(m, ev.matches));
                setSources((s) => ({ ...s, [ev.ats]: { ...s[ev.ats as AtsSource], state: "active", done: ev.scanned, total: ev.total } }));
                break;
              case "atsDone":
                setSources((s) => ({ ...s, [ev.ats]: { ...s[ev.ats as AtsSource], state: ev.unreachable > 0 ? "noisy" : "swept", unreachable: ev.unreachable } }));
                break;
              case "offer":
                acc.push(ev.offer);
                setOffers((o) => [...o, ev.offer]);
                break;
              case "summary":
                setCompaniesScanned(ev.companiesScanned);
                if (ev.unreachable > 0) setPartial(true);
                break;
              case "error":
                sawError = ev.message;
                break;
              default:
                break;
            }
          }
        }
      }
    } catch (e) {
      sawError = e instanceof Error ? e.message : "stream error";
    }

    // Mark any still-active sources as swept (stream ended).
    setSources((s) => {
      const next = { ...s };
      for (const k of Object.keys(next) as AtsSource[]) if (next[k]?.state === "active" || next[k]?.state === "queued") next[k] = { ...next[k]!, state: "swept" };
      return next;
    });

    runningRef.current = false;
    if (acc.length > 0) {
      setMatchCount(acc.length);
      setPhase("revealing");
      setStatus(`${acc.length} fresh role${acc.length === 1 ? "" : "s"} found — free.`);
      window.setTimeout(() => setPhase("results"), 850);
    } else if (sawError) {
      setError(sawError);
      setPhase("failed");
    } else {
      setPhase(isBroadSearch(f) ? "empty-current" : "empty-loose");
    }
  }, []);

  const addToPipeline = useCallback(async (list: DiscoveredOffer[]) => {
    const fresh = list.filter((o) => !added.has(o.url) && !adding.has(o.url));
    if (fresh.length === 0) return 0;
    setAdding((s) => new Set([...s, ...fresh.map((o) => o.url)]));
    try {
      const r = await fetch("/api/explore/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offers: fresh }),
      });
      const d = (await r.json()) as { added?: number };
      if (d.added && d.added > 0) setAdded((s) => new Set([...s, ...fresh.map((o) => o.url)]));
      return d.added ?? 0;
    } catch {
      return 0;
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        for (const o of fresh) next.delete(o.url);
        return next;
      });
    }
  }, [added, adding]);

  const applyPatch = useCallback((raw: Record<string, unknown>, opts?: { merge?: boolean; run?: boolean }) => {
    const next = parseExplorePatch(raw, filtersRef.current, opts?.merge ?? false);
    setFilters(next);
    filtersRef.current = next;
    if (opts?.run) void discover();
  }, [discover]);

  const reset = useCallback(() => {
    runningRef.current = false;
    setPhase("idle");
    setOffers([]);
    setSources({});
    setMatchCount(0);
    setCompaniesScanned(0);
    setStatus("");
    setPartial(false);
    setError("");
    setAiTrace([]);
    setAiCost({ searches: 0, candidates: 0, fetches: 0 });
  }, []);

  // AI search — orchestrate modes/discover.md via the user's CLI, streamed.
  const discoverAI = useCallback(async () => {
    if (runningRef.current) return;
    const intent = aiIntentRef.current.trim();
    if (!intent) return;
    let cliId: string | null = null;
    try {
      cliId = JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || null;
    } catch {
      cliId = null;
    }
    if (!cliId) {
      setPhase("blocked");
      return;
    }
    runningRef.current = true;
    setPhase("casting");
    setOffers([]);
    setMatchCount(0);
    setAiTrace([]);
    setAiCost({ searches: 0, candidates: 0, fetches: 0 });
    setError("");
    setStatus("Casting across the open web…");
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/explore?${aiToParams(intent)}`);

    let knownUrls = new Set<string>();
    try {
      const k = await fetch("/api/explore/ai/known").then((r) => r.json());
      knownUrls = new Set<string>(Array.isArray(k.urls) ? k.urls : []);
    } catch {
      /* best-effort dedup */
    }
    const parser = makeAiStreamParser({ knownUrls });

    const acc: DiscoveredOffer[] = [];
    let sawError = "";
    const handle = (chunks: AiTraceChunk[]) => {
      for (const ch of chunks) {
        if (ch.kind === "offer") {
          acc.push(ch.offer);
          setOffers((o) => [...o, ch.offer]);
          setMatchCount(acc.length);
          setAiCost((c) => ({ ...c, candidates: acc.length }));
          setPhase("hunting");
        } else {
          setAiTrace((t) => [...t, ch]);
          if (ch.kind === "narration") {
            const s = (ch.text.match(/\bsearch(ing|ed)?\b/gi) || []).length;
            const f = (ch.text.match(/\bfetch(ing|ed)?\b/gi) || []).length;
            if (s || f) setAiCost((c) => ({ ...c, searches: c.searches + s, fetches: c.fetches + f }));
            setPhase((p) => (p === "casting" ? "hunting" : p));
          }
        }
      }
    };

    try {
      const r = await fetch("/api/explore/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: intent, cliId }),
      });
      if (r.status === 404) {
        runningRef.current = false;
        setPhase("blocked");
        return;
      }
      if (r.status === 400) {
        const d = await r.json().catch(() => ({}));
        sawError = d.error || "AI search isn't available.";
      } else if (!r.body) {
        sawError = "No response stream.";
      } else {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          handle(parser.feed(dec.decode(value, { stream: true })));
        }
        handle(parser.flush());
      }
    } catch (e) {
      sawError = e instanceof Error ? e.message : "stream error";
    }

    runningRef.current = false;
    if (acc.length > 0) {
      setMatchCount(acc.length);
      setPhase("revealing");
      setStatus(`${acc.length} candidate${acc.length === 1 ? "" : "s"} found.`);
      window.setTimeout(() => setPhase("results"), 850);
    } else if (sawError) {
      setError(sawError);
      setPhase("failed");
    } else {
      setPhase("empty-loose");
    }
  }, []);

  // Switch surface — clear any half-run, but PRESERVE filters (the scan↔ai bridge).
  const setMode = useCallback(
    (m: ExploreMode) => {
      reset();
      setModeState(m);
    },
    [reset],
  );

  const value = useMemo(
    () => ({
      filters, setFilters, initFilters, phase,
      running: phase === "casting" || phase === "scanning" || phase === "revealing" || phase === "hunting",
      offers, sources, matchCount, companiesScanned, status, partial, error, added, adding,
      discover, addToPipeline, applyPatch, reset,
      mode, setMode, aiIntent, setAiIntent, discoverAI, aiTrace, aiCost,
    }),
    [filters, setFilters, initFilters, phase, offers, sources, matchCount, companiesScanned, status, partial, error, added, adding, discover, addToPipeline, applyPatch, reset, mode, setMode, aiIntent, discoverAI, aiTrace, aiCost],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
