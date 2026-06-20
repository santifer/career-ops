import { rememberFact } from "@/lib/career-ops";

// Persist the open-ended answers the user chose to remember into the CANONICAL
// memory (modes/_profile.md managed block, via rememberFact) — NOT a web-only store
// (that would drift). The next application's prefill already reads this block, so the
// system reuses these facts automatically: it gets smarter with every form.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { items?: { label?: string; value?: string }[] };
  try {
    body = (await req.json()) as { items?: { label?: string; value?: string }[] };
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  let saved = 0;
  for (const it of items.slice(0, 20)) {
    const label = String(it?.label || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const value = String(it?.value || "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!label || !value) continue;
    const r = rememberFact(`Application answer — when asked "${label}", use: ${value}`);
    if (r === "ok" || r === "deduped") saved++;
  }
  return Response.json({ ok: true, saved });
}
