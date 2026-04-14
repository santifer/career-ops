import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscription } from "@/lib/db/queries/settings";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await getSubscription(session.userId);
  if (!subscription)
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  // Strip sensitive fields before returning
  const { apiKeyEncrypted: _, ...safe } = subscription;
  return NextResponse.json({
    ...safe,
    hasApiKey: !!subscription.apiKeyEncrypted,
  });
}
