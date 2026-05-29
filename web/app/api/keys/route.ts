import { NextResponse } from "next/server";
import { issueKey, listApiKeys } from "@/lib/server/api-keys";
import { enforce } from "@/lib/server/enforce";
import { TIERS, type TierId } from "@/lib/data/tiers";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface CreateKeyBody {
  name?: string;
  email?: string;
  tier?: TierId;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const keys = await listApiKeys();
    return NextResponse.json({
      ok: true,
      keys: keys.map(({ hash: _hash, ...rest }) => {
        void _hash;
        return rest;
      }),
    });
  } catch (err) {
    console.error("[keys] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load API keys" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: CreateKeyBody;
  try {
    body = (await req.json()) as CreateKeyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  const name = body.name?.trim();
  const email = body.email?.trim();
  const tier = body.tier ?? "free";
  if (!name || !email) {
    return NextResponse.json(
      { ok: false, error: "name and email required" },
      { status: 400 }
    );
  }
  if (name.length > 500) {
    return NextResponse.json(
      { ok: false, error: "name exceeds 500-character limit" },
      { status: 400 },
    );
  }
  if (email.length > 500) {
    return NextResponse.json(
      { ok: false, error: "email exceeds 500-character limit" },
      { status: 400 },
    );
  }
  if (!TIERS[tier]) {
    return NextResponse.json({ ok: false, error: "unknown tier" }, { status: 400 , headers: gate.headers});
  }
  try {
    const issued = await issueKey({ name, email, tier });
    // API key issuance is a privileged admin action — must be on the tamper-evident chain.
    void writeAuditChainEntry(
      { event: "api_key.issued", actor: "admin", keyId: issued.id, name, email, tier },
      "admin",
    ).catch((err) =>
      console.warn("[keys] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({
      ok: true,
      id: issued.id,
      apiKey: issued.plaintext,
      warning: "Store this key securely — it will never be shown again.",
      tier: issued.tier,
    });
  } catch (err) {
    console.error("[keys] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to issue API key" }, { status: 500 });
  }
}
