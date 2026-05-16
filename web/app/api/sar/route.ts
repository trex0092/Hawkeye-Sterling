// /api/sar — Suspicious Activity Report (SAR) management.
//
// Provides a unified entry point for SAR generation and retrieval used by the
// MCP tool `generate_sar_report` and the MLRO workflow. Enforces the four-eyes
// dual-attestation requirement (UAE FDL 10/2025 Art.16) before generating any
// regulatory-facing SAR.
//
// Routes:
//   GET  /api/sar?caseId=<id>   → list SAR reports for a case
//   POST /api/sar               → generate SAR (four-eyes pre-check required)
//
// POST body:
//   {
//     caseId:    string  — case identifier linking to a case in /api/cases
//     narrative: string  — MLRO narrative for the SAR
//     filingType?: "STR" | "SAR" | "CTR"   (default "STR")
//     subjectName?: string
//     bypassFourEyes?: boolean  — operators can override for test/demo (logged)
//   }
//
// Four-eyes enforcement:
//   Before generating the SAR the route checks /api/four-eyes?caseId=<id>
//   and counts distinct approvers. If < 2 distinct approvers have signed off,
//   the request is rejected with 403 four_eyes_required.
//   This implements UAE FDL 10/2025 Art.16 in code, not just governance policy.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SarRecord {
  sarId: string;
  caseId: string;
  filingType: string;
  subjectName: string;
  narrative: string;
  generatedAt: string;
  generatedBy: string;
  fourEyesVerified: boolean;
  approvers: string[];
  status: "draft" | "pending_review" | "submitted";
}

interface FourEyesItem {
  id: string;
  subjectId: string;
  subjectName: string;
  action: string;
  initiatedBy: string;
  initiatedAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: string;
}

interface FourEyesResponse {
  ok: boolean;
  count: number;
  items: FourEyesItem[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function checkFourEyes(caseId: string, req: Request): Promise<{
  ok: boolean;
  distinctApprovers: number;
  approvers: string[];
  error?: string;
}> {
  // Read four-eyes approvals from the blob store directly (avoids HTTP loopback).
  const keys = await listKeys("four-eyes/");
  const loaded = await Promise.all(keys.map((k) => getJson<FourEyesItem>(k)));
  const items = loaded.filter((i): i is FourEyesItem => i !== null);

  // Filter to approvals relevant to this case: action "str" or "escalate",
  // status "approved", and where the subjectId or id contains the caseId.
  const relevant = items.filter(
    (i) =>
      i.status === "approved" &&
      (i.action === "str" || i.action === "escalate" || i.action === "freeze") &&
      (i.subjectId === caseId || i.id.includes(caseId) || i.subjectId.includes(caseId)),
  );

  // Count distinct approvers (initiatedBy is the first signer, approvedBy is the second).
  const approverSet = new Set<string>();
  for (const item of relevant) {
    if (item.initiatedBy) approverSet.add(item.initiatedBy);
    if (item.approvedBy) approverSet.add(item.approvedBy);
  }

  void req; // gate already enforced by withGuard wrapper

  return {
    ok: approverSet.size >= 2,
    distinctApprovers: approverSet.size,
    approvers: Array.from(approverSet),
  };
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId")?.trim();

  const keys = await listKeys("sar/");
  const loaded = await Promise.all(keys.map((k) => getJson<SarRecord>(k)));
  const records = loaded.filter((r): r is SarRecord => r !== null);

  const filtered = caseId ? records.filter((r) => r.caseId === caseId) : records;
  filtered.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return NextResponse.json({ ok: true, count: filtered.length, records: filtered });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }

  const caseId = str(raw["caseId"]);
  const narrative = str(raw["narrative"]);
  const subjectName = str(raw["subjectName"]) ?? "Unknown Subject";
  const filingType = str(raw["filingType"]) ?? "STR";
  const bypassFourEyes = raw["bypassFourEyes"] === true;
  const generatedBy = str(raw["generatedBy"]) ?? "mlro";

  if (!caseId) {
    return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400 });
  }
  if (!narrative) {
    return NextResponse.json({ ok: false, error: "narrative required" }, { status: 400 });
  }

  // ── Four-eyes pre-check (UAE FDL 10/2025 Art.16) ─────────────────────────
  if (!bypassFourEyes) {
    const feCheck = await checkFourEyes(caseId, req);
    if (!feCheck.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "four_eyes_required",
          message:
            "Two distinct approver sign-offs required before SAR submission. " +
            "UAE FDL 10/2025 Art.16 — dual-attestation mandatory for regulatory filings.",
          approvalsRecorded: feCheck.approvers.length,
          distinctApprovers: feCheck.distinctApprovers,
          action: "POST a four-eyes approval via /api/four-eyes with action='str' before retrying",
        },
        { status: 403 },
      );
    }
    console.info(
      `[sar] four-eyes verified: caseId=${caseId} approvers=[${feCheck.approvers.join(",")}]`,
    );
  } else {
    console.warn(
      `[sar] four-eyes BYPASSED: caseId=${caseId} generatedBy=${generatedBy} — audit record created`,
    );
  }

  // ── Delegate to sar-report route for actual generation ────────────────────
  // Calls the existing /api/sar-report endpoint which handles GoAML XML,
  // PDF generation, tipping-off checks, and Asana integration.
  const baseUrl =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const adminToken = process.env["ADMIN_TOKEN"] ?? "";

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55_000);
    let sarReportResult: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${baseUrl}/api/sar-report`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          subjectName,
          filingType,
          narrative,
          caseId,
          generatedBy,
        }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        sarReportResult = (await res.json()) as Record<string, unknown>;
      } else {
        const errBody = await res.text().catch(() => "");
        console.warn(`[sar] sar-report returned HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(t);
    }

    // Store a SAR record for listing via GET /api/sar.
    const sarId = `sar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: SarRecord = {
      sarId,
      caseId,
      filingType,
      subjectName,
      narrative,
      generatedAt: new Date().toISOString(),
      generatedBy,
      fourEyesVerified: !bypassFourEyes,
      approvers: bypassFourEyes ? [] : (await checkFourEyes(caseId, req)).approvers,
      status: "draft",
    };
    await setJson(`sar/${sarId}`, record).catch((err: unknown) => {
      console.warn("[sar] record persist failed (non-critical):", err);
    });

    return NextResponse.json({
      ok: true,
      sarId,
      record,
      ...(sarReportResult ? { report: sarReportResult } : {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "SAR generation failed", detail },
      { status: 500 },
    );
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req as Parameters<typeof enforce>[0]);
  if (!gate.ok) return gate.response as unknown as NextResponse;
  return handleGet(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req as Parameters<typeof enforce>[0]);
  if (!gate.ok) return gate.response as unknown as NextResponse;
  return handlePost(req);
}
