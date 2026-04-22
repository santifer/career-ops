import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  CareerOpsRepoError,
  composeCareerOpsPrompt,
} from "@/lib/career-ops/compose-prompt";
import { getModeDefinition, isCareerOpsModeId } from "@/lib/career-ops/modes";
import {
  createQueuedAgentRun,
  getAgentRunDetail,
  listAgentRuns,
} from "@/lib/db/queries/agent-runs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listAgentRuns(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const modeRaw = body?.mode;
  const userNotes =
    typeof body?.userNotes === "string" ? body.userNotes : undefined;

  if (typeof modeRaw !== "string" || !isCareerOpsModeId(modeRaw)) {
    return NextResponse.json(
      { error: "Invalid or missing mode" },
      { status: 400 },
    );
  }

  const definition = getModeDefinition(modeRaw);
  if (!definition) {
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  }

  try {
    const composed = await composeCareerOpsPrompt(definition, userNotes);
    const row = await createQueuedAgentRun({
      userId: session.userId,
      mode: definition.id,
      cliLine: composed.cliLine,
      promptBundle: composed.promptBundle,
      subagentInstruction: composed.subagentInstruction,
      userNotes: userNotes ?? null,
      repoRevision: process.env.CAREER_OPS_REPO_REVISION ?? "dev",
      runnerKind: process.env.CAREER_OPS_RUNNER_MODE ?? "fake",
    });

    const detail = (await getAgentRunDetail(session.userId, row.id)) ?? row;
    return NextResponse.json(detail, { status: 202 });
  } catch (error) {
    if (error instanceof CareerOpsRepoError) {
      return NextResponse.json(
        {
          error: error.message,
          hint:
            "Set CAREER_OPS_ROOT to your career-ops repository root (folder containing modes/_shared.md).",
        },
        { status: 503 },
      );
    }

    throw error;
  }
}
