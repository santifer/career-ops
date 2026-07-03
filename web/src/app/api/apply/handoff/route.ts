import { handoffSession } from "@/lib/apply/session";

// Re-raise the headed application window to the front (it may have slipped behind
// other windows). Used by the "Bring the application window forward" button so the
// user can always get back to the real form to review + Submit it themselves.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { sessionId?: string };
  try {
    body = (await req.json()) as { sessionId?: string };
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }
  try {
    await handoffSession(body.sessionId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 160) : "couldn't bring the window forward (the session may have closed)" }, { status: 500 });
  }
}
