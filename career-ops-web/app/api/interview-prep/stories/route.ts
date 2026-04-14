import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getStoryBank, createStory } from "@/lib/db/queries/interview-prep";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getStoryBank(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.theme) {
    return NextResponse.json({ error: "theme is required" }, { status: 400 });
  }

  const row = await createStory(session.userId, {
    theme: body.theme,
    situation: body.situation,
    task: body.task,
    action: body.action,
    result: body.result,
    reflection: body.reflection,
    bestForQuestions: body.bestForQuestions ?? [],
  });

  return NextResponse.json(row, { status: 201 });
}
