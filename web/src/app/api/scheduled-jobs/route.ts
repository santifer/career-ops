import { NextResponse } from "next/server";
import {
  createScheduledJob,
  listScheduledJobs,
  parseScheduledJobInput,
} from "@/lib/scheduled-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(listScheduledJobs(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not read scheduled jobs." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const fields = parseScheduledJobInput(await req.json());
    const job = await createScheduledJob(fields);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scheduled job." },
      { status: 400 },
    );
  }
}
