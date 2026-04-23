import { NextResponse } from "next/server";
import { issueKey, listApiKeys } from "@/lib/server/api-keys";
import { adminAuth } from "@/lib/server/admin-auth";
import { TIERS, type TierId } from "@/lib/data/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateKeyBody {
  name?: string;
  email?: string;
  tier?: TierId;
}

export async function GET(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  const keys = await listApiKeys();
  return NextResponse.json({
    ok: true,
    keys: keys.map(({ hash: _hash, ...rest }) => {
      void _hash;
      return rest;
    }),
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  let body: CreateKeyBody;
  try {
    body = (await req.json()) as CreateKeyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  const email = body.email?.trim();
  const tier = body.tier ?? "free";
  if (!name || !email) {
    return NextResponse.json(
      { ok: false, error: "name and email required" },
      { status: 400 },
    );
  }
  if (!TIERS[tier]) {
    return NextResponse.json({ ok: false, error: "unknown tier" }, { status: 400 });
  }
  const issued = await issueKey({ name, email, tier });
  return NextResponse.json({
    ok: true,
    id: issued.id,
    apiKey: issued.plaintext,
    warning: "Store this key securely — it will never be shown again.",
    tier: issued.tier,
  });
}
