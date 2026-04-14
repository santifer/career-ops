import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLink } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const result = await verifyMagicLink(token);

    if (!result) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }

    await createSession(result.userId);

    const redirectTo = result.isNewUser ? "/onboarding/welcome" : "/home";

    return NextResponse.json({ success: true, redirectTo });
  } catch (error) {
    console.error("Magic link verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
