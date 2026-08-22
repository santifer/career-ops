import { NextResponse } from "next/server";
import {
  deleteScheduledJob,
  getScheduledJob,
  parseScheduledJobInput,
  setScheduledJobStatus,
  updateScheduledJob,
} from "@/lib/scheduled-jobs";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const current = getScheduledJob(id);
    if (!current || current.status === "deleted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const onlyStatus = Object.keys(input).every((key) => key === "status");

    if (onlyStatus && (input.status === "active" || input.status === "paused")) {
      const job = await setScheduledJobStatus(id, input.status);
      return NextResponse.json(job);
    }
    if (input.status !== undefined && input.status !== "active" && input.status !== "paused") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const fields = parseScheduledJobInput(input, current);
    const job = await updateScheduledJob(id, {
      ...fields,
      ...(input.status === "active" || input.status === "paused" ? { status: input.status } : {}),
    });
    return job
      ? NextResponse.json(job)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid update" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const job = await deleteScheduledJob(id);
  return job
    ? NextResponse.json(job)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
