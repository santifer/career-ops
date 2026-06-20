import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// The WEB build's own version + channel (NOT the user's data checkout) — read from
// the repo's VERSION (parent of the web/ cwd). The channel is derived from a
// pre-release suffix (`-rc`/`-beta`) so the UI can show a beta banner + the bug
// reporter can tag the right release. Invisible to stable installs (the updater
// reads VERSION from `main`, which stays stable while the bundle lives on a branch).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readVersion(): string {
  const candidates = [path.join(process.cwd(), "..", "VERSION"), path.join(process.cwd(), "VERSION")];
  for (const p of candidates) {
    try {
      const v = fs.readFileSync(p, "utf8").split(/\s+/)[0].trim();
      if (v) return v;
    } catch {
      /* next candidate */
    }
  }
  return "";
}

function shortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export async function GET() {
  const version = readVersion();
  const m = version.match(/-(rc|beta|alpha|next)\b/i);
  const channel = m ? m[1].toLowerCase() : "stable";
  return Response.json({ version, channel, sha: shortSha() });
}
