// POST /api/audit/certify
//
// Emits a tamper-evident immutability certificate for a case / STR /
// disposition. Returns a signed snapshot the regulator (UAE FIU, internal
// audit, FATF reviewer) can verify offline against the public key at
// /.well-known/hawkeye-pubkey.pem.
//
// Required: ADMIN_TOKEN OR active MLRO session — the certificate is a
// formal regulatory artifact; only authorised operators may issue it.
//
// Body: {
//   caseId: string,
//   trigger: "case_closure" | "str_filed" | "ctr_filed" |
//            "four_eyes_approval" | "disposition_committed" | "evidence_pack",
//   digest?: Record<string, string|number|boolean>   // optional summary
//                                                      // fields to bind into
//                                                      // the signature
// }
//
// Response: AuditCertificate (see web/lib/server/audit-certificate.ts)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { listKeys, getJson } from "@/lib/server/store";
import { buildAuditCertificate, type AuditSnapshotInput } from "@/lib/server/audit-certificate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface AuditEntry {
  seq: number;
  entryHash: string;
  at?: string;
  actor?: string;
  caseId?: string;
  subjectId?: string;
}

interface CertifyBody {
  caseId?: string;
  trigger?: AuditSnapshotInput["trigger"];
  digest?: Record<string, string | number | boolean>;
}

const VALID_TRIGGERS = new Set([
  "case_closure",
  "str_filed",
  "ctr_filed",
  "four_eyes_approval",
  "disposition_committed",
  "evidence_pack",
]);

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: CertifyBody;
  try {
    body = (await req.json()) as CertifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const caseId = (body.caseId ?? "").trim();
  if (!caseId) {
    return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400, headers: gate.headers });
  }
  if (!body.trigger || !VALID_TRIGGERS.has(body.trigger)) {
    return NextResponse.json(
      { ok: false, error: `trigger must be one of: ${Array.from(VALID_TRIGGERS).join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  // Walk the persisted audit-log entries and pull the ones tied to this
  // case. The audit-log key prefix is set by mlro-integration.ts; we
  // scan a bounded slice (10k recent entries) so the route stays under
  // the maxDuration ceiling even for chatty tenants.
  const AUDIT_KEY_PREFIX = "audit/mlro/";
  const allKeys = await listKeys(AUDIT_KEY_PREFIX);
  const recentKeys = allKeys.slice(-10_000);
  const entries: AuditEntry[] = [];
  for (const key of recentKeys) {
    const entry = await getJson<AuditEntry>(key);
    if (!entry || typeof entry.seq !== "number" || !entry.entryHash) continue;
    if (entry.caseId === caseId || entry.subjectId === caseId) {
      entries.push(entry);
    }
  }

  if (entries.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no audit entries found for caseId",
        hint: "Cases must have at least one audit-trail entry before a certificate can be issued. Verify the caseId or check that MLRO actions were recorded.",
      },
      { status: 404, headers: gate.headers },
    );
  }

  const certificate = buildAuditCertificate({
    caseId,
    tenantId,
    trigger: body.trigger,
    auditEntries: entries.map((e) => ({
      seq: e.seq,
      entryHash: e.entryHash,
      at: e.at ?? new Date().toISOString(),
      ...(e.actor ? { actor: e.actor } : {}),
    })),
    digest: body.digest ?? {},
  });

  return NextResponse.json(
    {
      ok: true,
      certificate,
      regulationBasis: [
        "UAE PDPL 45/2021 Art.13 (record retention)",
        "UAE FDL 10/2025 Art.24 (10-year audit chain)",
        "FATF R.11 (record-keeping)",
      ],
      hint: certificate.signed
        ? "Verify offline: openssl pkeyutl -verify -pubin -inkey hawkeye-pubkey.pem -sigfile <cert>.sig -in <snapshot>.json"
        : "REPORT_ED25519_PRIVATE_KEY not configured — certificate is unsigned. Configure the key to enable regulator-verifiable signatures.",
    },
    { headers: gate.headers },
  );
}
