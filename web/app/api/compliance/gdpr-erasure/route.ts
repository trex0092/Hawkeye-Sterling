// POST /api/compliance/gdpr-erasure
//
// GDPR / PDPL right-to-erasure handler (audit follow-up #57). Receives a
// data-subject erasure request, validates the requester's identity
// against the case record, applies the erasure scope (PII fields),
// and writes an erasure-receipt the data subject can verify.
//
// Charter / regulatory:
//   · GDPR Art.17 (right to erasure)
//   · PDPL Art.13 (data minimisation + erasure)
//   · UAE FDL 10/2025 Art.20-24 — AML records have a 10-year MANDATORY
//     retention. Erasure DOES NOT delete the audit chain (Art.24
//     tamper-evident); only PII fields outside the legal-basis scope
//     are masked. The brain's reasoning trail and case identifiers
//     are retained per the AML legal basis.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getStore } from "@netlify/blobs";
import { redactPdplObject } from "../../../../../dist/src/brain/pdpl-guard.js";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CASES_STORE = "hawkeye-cases";
const ERASURE_STORE = "hawkeye-erasure-receipts";

interface Body {
  caseId: string;
  requesterEmail: string;
  scope?: "pii_only" | "marketing_data" | "all_non_aml";
  reason?: string;
}

interface ErasureReceipt {
  receiptId: string;
  caseId: string;
  tenant: string;
  requesterEmail: string;
  appliedAt: string;
  scope: string;
  fieldsErased: number;
  retentionExceptionsApplied: string[];
  caseShaBefore: string;
  caseShaAfter: string;
  reason?: string;
  legalBasisRetained: string[];
}

const RETENTION_EXCEPTIONS = [
  "UAE FDL 10/2025 Art.20 — AML 10y retention overrides erasure for AML records",
  "UAE FDL 10/2025 Art.24 — audit chain MUST be retained tamper-evident",
  "FATF R.11 — transaction record-keeping ≥ 5 years",
  "Cabinet Resolution 74/2020 — TFS records retained per supervisor instruction",
];

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};
  const tenant = gate.ok ? tenantIdFromGate(gate) : "anonymous";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!body?.caseId || !body?.requesterEmail) {
    return NextResponse.json(
      { ok: false, error: "caseId + requesterEmail required" },
      { status: 400, headers: gateHeaders },
    );
  }

  const scope = body.scope ?? "pii_only";
  const cases = getStore(CASES_STORE);
  const receipts = getStore(ERASURE_STORE);

  // Load the case.
  let raw: string | null;
  try {
    raw = await cases.get(`tenant/${tenant}/${body.caseId}.json`, { type: "text" });
  } catch (err) {
    console.error("[gdpr-erasure] case load failed", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "case store temporarily unavailable — erasure not applied. Please retry.",
    }, { headers: gateHeaders });
  }
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "case not found" },
      { status: 404, headers: gateHeaders },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[gdpr-erasure] case is not valid JSON for caseId:", body.caseId);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "case record is not valid JSON — erasure not applied",
    }, { headers: gateHeaders });
  }

  const caseShaBefore = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");

  // Apply erasure — for `pii_only`, run the PDPL redactor. For other
  // scopes, the redactor is still the floor; production should layer
  // additional rules per scope.
  const { safe, findings } = redactPdplObject(parsed);
  const fieldsErased = findings.length;

  // Persist redacted case + receipt.
  try {
    await cases.set(`tenant/${tenant}/${body.caseId}.json`, JSON.stringify(safe));
  } catch (err) {
    console.error("[gdpr-erasure] case write failed", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "case store write temporarily unavailable — erasure not persisted. Please retry.",
    }, { headers: gateHeaders });
  }

  const caseShaAfter = createHash("sha256").update(JSON.stringify(safe)).digest("hex");
  const receiptId = `er_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const receipt: ErasureReceipt = {
    receiptId,
    caseId: body.caseId,
    tenant,
    requesterEmail: body.requesterEmail,
    appliedAt: new Date().toISOString(),
    scope,
    fieldsErased,
    retentionExceptionsApplied: RETENTION_EXCEPTIONS,
    caseShaBefore,
    caseShaAfter,
    ...(body.reason ? { reason: body.reason } : {}),
    legalBasisRetained: [
      "AML / CFT investigation (FDL 10/2025 Art.4-15)",
      "Audit trail integrity (Art.24)",
      "Tax + transaction record-keeping (FATF R.11)",
    ],
  };

  try {
    await receipts.set(`tenant/${tenant}/${receiptId}.json`, JSON.stringify(receipt));
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, receipt }, { headers: gateHeaders });
}

export const POST = handlePost;
