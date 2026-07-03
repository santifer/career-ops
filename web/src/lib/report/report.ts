import { recentLogs } from "./logbuf";

const REPO = "santifer/career-ops";

/** Strip PII / secrets that could ride in error text, paths or logs BEFORE anything
 *  leaves the machine. Defence-in-depth — the user also reviews the full payload
 *  (preview-then-confirm) before the issue opens. */
export function scrub(s: string): string {
  return (s || "")
    .replace(/\/Users\/[^/\s"']+/g, "~")
    .replace(/\/home\/[^/\s"']+/g, "~")
    .replace(/(sk|key|token|secret|bearer|api[-_]?key)([-_=:\s"']+)[A-Za-z0-9._-]{8,}/gi, "$1$2[redacted]");
}

/** Structural fingerprint from /api/report/shape — shapes/counts, never contents. */
export type Shape = {
  runtime?: { node?: string; platform?: string; arch?: string };
  setup?: { phase?: string; missing?: string[]; hasCv?: boolean; hasData?: boolean };
  data?: {
    inbox?: { candidates?: number; parsed?: number };
    tracker?: { candidates?: number; parsed?: number };
    reports?: number;
    pdfs?: number;
    followupsFile?: boolean;
  };
  capabilities?: { scanJson?: boolean; trackerDelete?: boolean };
};

export type Diag = {
  version: string;
  coreVersion: string;
  channel: string;
  sha: string;
  route: string;
  cli: string;
  ua: string;
  viewport: string;
  logs: string[];
  shape: Shape | null;
  /** Whether the core follow-up cadence engine answered — false = engine degraded. */
  followupsAvailable: boolean | null;
};

/** Gather a STRUCTURAL diagnostic snapshot. Deliberately excludes anything personal:
 *  no cv.md, no profile, no application answers, no job URLs, no report content. */
export async function collect(): Promise<Diag> {
  let version = "";
  let coreVersion = "";
  let channel = "stable";
  let sha = "";
  try {
    const d = await (await fetch("/api/version")).json();
    version = d.version || "";
    coreVersion = d.coreVersion || "";
    channel = d.channel || "stable";
    sha = d.sha || "";
  } catch {
    /* keep defaults */
  }
  let shape: Shape | null = null;
  try {
    shape = (await (await fetch("/api/report/shape")).json()) as Shape;
  } catch {
    /* structural snapshot is best-effort */
  }
  let followupsAvailable: boolean | null = null;
  try {
    followupsAvailable = Boolean((await (await fetch("/api/followups")).json()).available);
  } catch {
    /* best-effort */
  }
  let cli = "";
  try {
    cli = JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || "";
  } catch {
    /* none */
  }
  return {
    version,
    coreVersion,
    channel,
    sha,
    route: scrub(location.pathname + location.search),
    cli,
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    logs: recentLogs().map(scrub),
    shape,
    followupsAvailable,
  };
}

/** The EXACT markdown body the user reviews and that becomes the GitHub issue. */
export function issueBody(d: Diag, description: string): string {
  const s = d.shape;
  const fmt = (n?: number) => (typeof n === "number" ? String(n) : "?");
  const shapeLines = s
    ? [
        "## Data shape (counts only — no contents)",
        `- **Setup:** ${s.setup?.phase || "?"}${s.setup?.missing?.length ? ` · missing: ${s.setup.missing.join(", ")}` : ""}`,
        `- **Inbox:** ${fmt(s.data?.inbox?.parsed)}/${fmt(s.data?.inbox?.candidates)} rows parsed · **Tracker:** ${fmt(s.data?.tracker?.parsed)}/${fmt(s.data?.tracker?.candidates)} rows parsed`,
        `- **Reports:** ${fmt(s.data?.reports)} · **PDFs:** ${fmt(s.data?.pdfs)} · **Follow-ups engine:** ${d.followupsAvailable === null ? "?" : d.followupsAvailable ? "ok" : "DEGRADED"}`,
        `- **Core capabilities:** scan --json ${s.capabilities?.scanJson ? "yes" : "no"} · tracker delete ${s.capabilities?.trackerDelete ? "yes" : "no"}`,
        `- **Server:** node ${s.runtime?.node || "?"} · ${s.runtime?.platform || "?"}/${s.runtime?.arch || "?"}`,
        "",
      ]
    : [];
  return [
    "## What happened",
    scrub(description).trim() || "_(describe what you were doing and what went wrong)_",
    "",
    "## Environment",
    `- **Version:** \`${d.version || "?"}\`${d.coreVersion ? ` · core \`${d.coreVersion}\`` : ""} · ${d.channel}${d.sha ? ` · \`${d.sha}\`` : ""}`,
    `- **CLI:** ${d.cli || "—"}`,
    `- **Screen:** \`${d.route}\``,
    `- **Browser:** ${scrub(d.ua)}`,
    `- **Viewport:** ${d.viewport}`,
    "",
    ...shapeLines,
    "## Recent errors",
    d.logs.length ? "```\n" + d.logs.join("\n") + "\n```" : "_(none captured)_",
    "",
    "---",
    "_Filed from the in-app bug reporter. Contains NO CV, profile, application answers, or job URLs._",
  ]
    .join("\n")
    .slice(0, 6000);
}

export function issueUrl(d: Diag, description: string): string {
  const title = `[web ${d.channel}] ${(scrub(description) || "bug report").replace(/\s+/g, " ").trim().slice(0, 70)}`;
  const params = new URLSearchParams({ title, body: issueBody(d, description), labels: "web-alpha,area:web" });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
