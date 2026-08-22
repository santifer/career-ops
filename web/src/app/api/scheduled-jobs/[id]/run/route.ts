import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getScheduledJob } from "@/lib/scheduled-jobs";
import { careerOpsRoot } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 76 * 60 * 1_000;
const MAX_OUTPUT = 512 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

function runJob(runner: string, id: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    const child = spawn(process.execPath, [runner, "--job", id], {
      cwd: careerOpsRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-MAX_OUTPUT);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, TIMEOUT_MS);

    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message, timedOut });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const job = getScheduledJob(id);
  if (!job || job.status === "deleted") {
    return NextResponse.json({ error: "Scheduled job not found" }, { status: 404 });
  }

  const runner = path.join(careerOpsRoot(), "scripts", "scheduled-jobs-runner.mjs");
  if (!fs.existsSync(runner)) {
    return NextResponse.json({ error: "Scheduled job runner is not installed." }, { status: 404 });
  }

  const result = await runJob(runner, id);
  if (result.timedOut) {
    return NextResponse.json({ error: "Scheduled scan timed out." }, { status: 504 });
  }
  if (result.code !== 0) {
    const message = result.stderr.split(/\r?\n/).find(Boolean)?.slice(0, 300) || "Scan failed.";
    const status = /lock timeout/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const summary = JSON.parse(result.stdout.trim()) as { rolesFound?: unknown };
    const rolesFound = Number.isFinite(Number(summary.rolesFound)) ? Number(summary.rolesFound) : 0;
    return NextResponse.json({ success: true, rolesFound, summary });
  } catch {
    return NextResponse.json({ error: "Scheduled scan returned an invalid result." }, { status: 500 });
  }
}
