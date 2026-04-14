import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toggleCompany, removeCompany } from "@/lib/db/queries/scanner";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) is required" },
      { status: 400 },
    );
  }

  const company = await toggleCompany(id, body.enabled);

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = await removeCompany(id);

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
