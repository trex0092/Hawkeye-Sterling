import { NextResponse } from "next/server";
import { deleteKey, revokeKey } from "@/lib/server/api-keys";
import { adminAuth } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  const ok = await revokeKey(params.id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: params.id, revoked: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  await deleteKey(params.id);
  return NextResponse.json({ ok: true, id: params.id, deleted: true });
}
