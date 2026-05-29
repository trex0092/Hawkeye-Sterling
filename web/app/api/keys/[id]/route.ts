import { NextResponse } from "next/server";
import { deleteKey, revokeKey } from "@/lib/server/api-keys";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  try {
    const { id } = await params;
    const ok = await revokeKey(id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "unknown key" }, { status: 404 });
    }
    void writeAuditChainEntry(
      { event: "api_key.revoked", actor: "admin", keyId: id },
      "admin",
    ).catch((err) =>
      console.warn("[keys/revoke] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, id, revoked: true });
  } catch (err) {
    console.error("[keys/revoke] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to revoke key" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  try {
    const { id } = await params;
    await deleteKey(id);
    void writeAuditChainEntry(
      { event: "api_key.deleted", actor: "admin", keyId: id },
      "admin",
    ).catch((err) =>
      console.warn("[keys/delete] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, id, deleted: true });
  } catch (err) {
    console.error("[keys/delete] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to delete key" }, { status: 500 });
  }
}
