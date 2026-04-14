import { NextRequest, NextResponse } from "next/server";
import { sendMagicLink } from "@/lib/auth/magic-link";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    await sendMagicLink(email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Magic link send error:", error);
    return NextResponse.json({ error: "Failed to send magic link" }, { status: 500 });
  }
}
