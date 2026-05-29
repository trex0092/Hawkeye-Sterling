// POST /api/goaml-export
// GET  /api/goaml-export?caseId=<id>   — build XML from stored STR case
//
// UAE FIU STR XML wizard. Accepts either a full goAML input object (POST body)
// or a stored STR case ID (GET ?caseId=<id>) and delegates XML generation
// to /api/goaml-xml — which owns the goAML v4/v5 XSD-validated builder.
//
// This endpoint adds:
//   1. Case-ID lookup from the str-cases store
//   2. Automatic field population from CaseRecord / StrCase data
//   3. A "download" header on success so browsers trigger Save As
//
// Regulatory basis: UAE FDL 10/2025 Art.17 — 48-hour STR obligation;
// UAE FIU goAML Technical Guide v3.1.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson } from "@/lib/server/store";
import type { GoAmlXmlResult } from "@/app/api/goaml-xml/route";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

function safeFilenameSegment(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

interface StrCaseRecord {
  id: string;
  subject: string;
  amount?: string;
  currency?: string;
  jurisdiction?: string;
  typology?: string;
  notes?: string;
  reportRef?: string;
}

function caseToGoAmlBody(c: StrCaseRecord): Record<string, unknown> {
  const mlroEmail = process.env["MLRO_EMAIL"] ?? "hawkeye.sterling.v2@gmail.com";
  const mlroName = process.env["MLRO_NAME"] ?? "Hawkeye Sterling MLRO";
  const mlroPhone = process.env["MLRO_PHONE"] ?? "+971-000-0000";
  const reportingEntityId = process.env["REPORTING_ENTITY_ID"] ?? "HKS-001";

  return {
    mlroName,
    mlroEmail,
    mlroPhone,
    reportingEntityId,
    subjectName: c.subject,
    subjectDob: "",
    subjectNationality: c.jurisdiction ?? "AE",
    subjectPassport: "",
    subjectPassportCountry: c.jurisdiction ?? "AE",
    subjectCountry: c.jurisdiction ?? "AE",
    accountNumber: "",
    narrativeText: (c.notes ?? `Suspicious activity involving ${c.subject}. Typology: ${c.typology ?? "Unknown"}. Amount: ${c.amount ?? "Unknown"} ${c.currency ?? "AED"}.`).slice(0, 4999),
    transactions: c.amount
      ? [
          {
            amount: parseFloat(c.amount.replace(/[^0-9.]/g, "")) || 0,
            currency: c.currency ?? "AED",
            transactionDate: new Date().toISOString().split("T")[0],
            transactionType: "wire_transfer",
            direction: "credit" as const,
          },
        ]
      : [],
    suspectedOffence: c.typology ?? "Money Laundering",
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const caseId = (url.searchParams.get("caseId") ?? "").trim();
  if (!caseId) {
    return NextResponse.json(
      { ok: false, error: "caseId query param required. Example: ?caseId=STR-20260519-abc1" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    const t = tenant.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const i = caseId.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
    const stored = await getJson<StrCaseRecord>(`str-cases/${t}/${i}.json`);

    if (!stored) {
      return NextResponse.json(
        { ok: false, error: `STR case "${caseId}" not found. Use POST /api/goaml-export with a full body.` },
        { status: 404, headers: gate.headers },
      );
    }

    const body = caseToGoAmlBody(stored);
    const { POST: xmlHandler } = await import("@/app/api/goaml-xml/route");
    const synthetic = new Request(req.url.replace("/goaml-export", "/goaml-xml"), {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", ...Object.fromEntries(req.headers) }),
      body: JSON.stringify(body),
    });
    const xmlRes = await xmlHandler(synthetic);
    const data = (await xmlRes.json()) as GoAmlXmlResult & { ok: boolean };

    if (!data.ok) return NextResponse.json(data, { status: 503, headers: gate.headers });

    void writeAuditChainEntry(
      { event: "goaml.export_generated", actor: gate.keyId, meta: { subjectName: stored.subject, caseId } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    const headers = new Headers(gate.headers);
    headers.set("Content-Disposition", `attachment; filename="${safeFilenameSegment(data.reportRef ?? caseId)}.xml"`);
    headers.set("Content-Type", "application/xml");
    return new NextResponse(data.xml, { status: 200, headers });
  } catch (err) {
    console.error("[goaml-export] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to generate goAML export" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // Direct POST — body is either a full GoAmlXmlInput or a { caseId } reference
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  // If caseId is provided, look it up and merge with body
  if (typeof body["caseId"] === "string" && body["caseId"]) {
    const t = tenant.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const i = (body["caseId"] as string).replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
    const stored = await getJson<StrCaseRecord>(`str-cases/${t}/${i}.json`);
    if (stored) {
      body = { ...caseToGoAmlBody(stored), ...body };
    }
  }

  const { POST: xmlHandler } = await import("@/app/api/goaml-xml/route");
  const synthetic = new Request(req.url.replace("/goaml-export", "/goaml-xml"), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...Object.fromEntries(req.headers) }),
    body: JSON.stringify(body),
  });
  const xmlRes = await xmlHandler(synthetic);
  const data = (await xmlRes.json()) as GoAmlXmlResult & { ok: boolean };

  const headers = new Headers(gate.headers);
  if (data.ok) {
    headers.set("Content-Disposition", `attachment; filename="${safeFilenameSegment(data.reportRef ?? "str-export")}.xml"`);
    void writeAuditChainEntry(
      { event: "goaml.export_generated", actor: gate.keyId, meta: { subjectName: typeof body["subjectName"] === "string" ? body["subjectName"] : undefined, reportRef: data.reportRef } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  }
  return NextResponse.json(data, { status: xmlRes.status, headers });
}
