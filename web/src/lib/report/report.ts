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

export type Diag = {
  version: string;
  channel: string;
  sha: string;
  route: string;
  cli: string;
  ua: string;
  viewport: string;
  logs: string[];
};

/** Gather a STRUCTURAL diagnostic snapshot. Deliberately excludes anything personal:
 *  no cv.md, no profile, no application answers, no job URLs, no report content. */
export async function collect(): Promise<Diag> {
  let version = "";
  let channel = "stable";
  let sha = "";
  try {
    const d = await (await fetch("/api/version")).json();
    version = d.version || "";
    channel = d.channel || "stable";
    sha = d.sha || "";
  } catch {
    /* keep defaults */
  }
  let cli = "";
  try {
    cli = JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || "";
  } catch {
    /* none */
  }
  return {
    version,
    channel,
    sha,
    route: scrub(location.pathname + location.search),
    cli,
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    logs: recentLogs().map(scrub),
  };
}

/** The EXACT markdown body the user reviews and that becomes the GitHub issue. */
export function issueBody(d: Diag, description: string): string {
  return [
    "## What happened",
    scrub(description).trim() || "_(describe what you were doing and what went wrong)_",
    "",
    "## Environment",
    `- **Version:** \`${d.version || "?"}\` · ${d.channel}${d.sha ? ` · \`${d.sha}\`` : ""}`,
    `- **CLI:** ${d.cli || "—"}`,
    `- **Screen:** \`${d.route}\``,
    `- **Browser:** ${scrub(d.ua)}`,
    `- **Viewport:** ${d.viewport}`,
    "",
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
