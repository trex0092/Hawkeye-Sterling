import { NextResponse } from "next/server";
import { deleteKey, revokeKey } from "@/lib/server/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const ok = await revokeKey(params.id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: params.id, revoked: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  await deleteKey(params.id);
  return NextResponse.json({ ok: true, id: params.id, deleted: true });
}
