// POST /api/document-intelligence/verify-identity
//
// Delegates to the configured KYC provider (Jumio or Onfido) and stores
// the verification outcome on the subject record.
//
// Auth required — no anonymous access.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { patchSubject } from "@/lib/server/subject-store";
import { getActiveKycProvider } from "@/lib/server/document-intelligence";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, cost: 2 });
  if (!gate.ok) return gate.response;

  let body: { documentBase64?: unknown; faceBase64?: unknown; subjectId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  if (typeof body.documentBase64 !== "string" || !body.documentBase64.trim()) {
    return NextResponse.json(
      { ok: false, error: "documentBase64 is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (typeof body.subjectId !== "string" || !body.subjectId.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const activeProvider = getActiveKycProvider();

  if (!activeProvider) {
    return NextResponse.json(
      {
        ok: true,
        available: false,
        message:
          "No KYC provider configured. Set JUMIO_API_KEY + JUMIO_API_SECRET or ONFIDO_API_TOKEN in your Netlify environment variables.",
      },
      { headers: gate.headers },
    );
  }

  const { connector, provider } = activeProvider;

  try {
    const result = await connector.verifyIdentity(
      body.documentBase64,
      typeof body.faceBase64 === "string" ? body.faceBase64 : undefined,
    );

    // Persist the KYC outcome on the subject record
    const tenant = tenantIdFromGate(gate);
    await patchSubject(
      tenant,
      (body.subjectId as string).trim(),
      {
        // Store KYC outcome in notes field as structured comment since SubjectProfile
        // doesn't have dedicated KYC fields — we extend via _kycVerified custom keys
        notes: `[KYC] Provider: ${provider} | Verified: ${result.verified} | Score: ${result.score.toFixed(2)} | At: ${new Date().toISOString()}`,
      } as Parameters<typeof patchSubject>[2],
      gate.keyId,
    );

    void writeAuditChainEntry(
      { event: "kyc_verification_completed", actor: gate.keyId, meta: { subjectId: (body.subjectId as string).trim(), provider, verified: result.verified } },
      tenant,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      {
        ok: true,
        available: true,
        provider,
        verified: result.verified,
        score: result.score,
        details: result.details,
        kycVerifiedAt: new Date().toISOString(),
      },
      { headers: gate.headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[document-intelligence/verify-identity] error:", message);
    return NextResponse.json(
      { ok: false, error: "KYC verification failed. Please try again." },
      { status: 500, headers: gate.headers },
    );
  }
}
