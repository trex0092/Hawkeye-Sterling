// GET /api/compliance/soc2-export
//
// SOC2-ready audit log export (audit follow-up #56). Returns an
// immutable, signed bundle of audit-chain entries + journal records +
// regulatory metadata for the requested time window. Designed for SOC2
// CC7.2 (audit log review) + ISO 27001 A.12.4 + FDL 10/2025 Art.24.
//
// Output: JSON bundle with HMAC-SHA256 signature on the canonicalised
// payload — verifiable independently by the auditor.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getStore } from "@netlify/blobs";
import { createHmac, createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEEDBACK_STORE = "hawkeye-feedback-journal";
const FEEDBACK_KEY = "all-records.json";
const AUDIT_STORE = "hawkeye-audit-chain";
const AUDIT_KEY = "chain.json";

interface ExportBundle {
  meta: {
    tenant: string;
    generatedAt: string;
    windowSince?: string;
    windowUntil?: string;
    productVersion: string;
    standardsCovered: string[];
  };
  feedbackRecords: unknown[];
  auditChain: unknown[];
  counts: {
    feedbackRecords: number;
    auditEntries: number;
  };
  hashes: {
    feedbackSha256: string;
    auditSha256: string;
    bundleSha256: string;
  };
  signature?: string;     // HMAC-SHA256 over bundleSha256, when WEBHOOK_HMAC_SECRET is set
}

async function readJsonBlob(store: string, key: string): Promise<unknown[]> {
  try {
    const s = getStore(store);
    const raw = await s.get(key, { type: "text" });
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inWindow(at: string | undefined, since: number, until: number): boolean {
  if (!at) return true;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return true;
  return t >= since && t <= until;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");
  const since = sinceParam ? Date.parse(sinceParam) : Number.NEGATIVE_INFINITY;
  const until = untilParam ? Date.parse(untilParam) : Number.POSITIVE_INFINITY;

  const allFeedback = await readJsonBlob(FEEDBACK_STORE, FEEDBACK_KEY);
  const allAudit = await readJsonBlob(AUDIT_STORE, AUDIT_KEY);

  const feedback = allFeedback.filter((r) => {
    if (typeof r === "object" && r !== null && "at" in r) {
      return inWindow((r as { at?: string }).at, since, until);
    }
    return true;
  });
  const audit = allAudit.filter((r) => {
    if (typeof r === "object" && r !== null && "at" in r) {
      return inWindow((r as { at?: string }).at, since, until);
    }
    return true;
  });

  const feedbackJson = JSON.stringify(feedback);
  const auditJson = JSON.stringify(audit);
  const feedbackSha = createHash("sha256").update(feedbackJson).digest("hex");
  const auditSha = createHash("sha256").update(auditJson).digest("hex");
  const bundleSha = createHash("sha256").update(feedbackSha + ":" + auditSha).digest("hex");

  const bundle: ExportBundle = {
    meta: {
      tenant,
      generatedAt: new Date().toISOString(),
      ...(sinceParam ? { windowSince: sinceParam } : {}),
      ...(untilParam ? { windowUntil: untilParam } : {}),
      productVersion: "0.2.0",
      standardsCovered: [
        "SOC2 CC7.2 (audit log review)",
        "ISO 27001 A.12.4 (logging and monitoring)",
        "UAE FDL 10/2025 Art.20-24 (record retention + tamper-evident)",
        "PDPL Art.13 (right of access)",
      ],
    },
    feedbackRecords: feedback,
    auditChain: audit,
    counts: { feedbackRecords: feedback.length, auditEntries: audit.length },
    hashes: { feedbackSha256: feedbackSha, auditSha256: auditSha, bundleSha256: bundleSha },
  };

  const secret = process.env["WEBHOOK_HMAC_SECRET"];
  if (secret) {
    bundle.signature = `sha256=${createHmac("sha256", secret).update(bundleSha).digest("hex")}`;
  }

  return NextResponse.json(bundle, {
    headers: {
      ...gate.headers,
      "content-type": "application/json",
      "content-disposition": `attachment; filename="hawkeye-soc2-${tenant}-${Date.now()}.json"`,
    },
  });
}

export const GET = handleGet;
