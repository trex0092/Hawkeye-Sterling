// POST /api/cron/transaction-monitor
//
// Scheduled endpoint called hourly by netlify/functions/transaction-monitor.mts.
// Reads all unprocessed flag/hold records from Blob storage, runs typology-match
// on each, and opens a case for high-severity hits.
//
// Protected by CRON_SECRET — only accepts requests with
//   Authorization: Bearer <CRON_SECRET>
// to prevent public triggering.

import { NextResponse } from "next/server";
import { listKeys, getJson, setJson } from "@/lib/server/store";
import type { TxnFlagRecord } from "@/app/api/transaction-anomaly/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env["URL"] ??
  process.env["DEPLOY_PRIME_URL"] ??
  process.env["NEXT_PUBLIC_APP_URL"] ??
  "https://hawkeye-sterling.netlify.app";

interface TypologyResult {
  primaryTypology?: {
    name: string;
    matchStrength: "strong" | "moderate" | "weak";
    matchRationale: string;
  };
  strThreshold?: string;
}

async function runTypologyMatch(record: TxnFlagRecord): Promise<TypologyResult | null> {
  const adminToken = process.env["ADMIN_TOKEN"] ?? process.env["NEXT_PUBLIC_ADMIN_TOKEN"] ?? "";
  const facts = [
    `Anomaly score: ${Math.round(record.score * 100)}/100 (tier: ${record.tier.toUpperCase()})`,
    `Transaction amount: USD ${record.amountUsd.toFixed(2)}`,
    `Session: ${record.sessionId}`,
    ...record.drivers,
  ].join("; ");

  try {
    const res = await fetch(`${BASE_URL}/api/typology-match`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify({ facts, subjectType: "transaction", transactionTypes: ["cash"] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as TypologyResult;
  } catch {
    return null;
  }
}

async function openCase(record: TxnFlagRecord, typology: TypologyResult): Promise<void> {
  const adminToken = process.env["ADMIN_TOKEN"] ?? process.env["NEXT_PUBLIC_ADMIN_TOKEN"] ?? "";
  const subject = `TXN-ANOMALY · ${record.sessionId} · USD ${record.amountUsd.toFixed(0)}`;
  const now = new Date().toISOString();

  const casePayload = [{
    id: `case-txn-${record.flagId}`,
    badge: record.tier === "hold" ? "HOLD" : "REVIEW",
    badgeTone: record.tier === "hold" ? "orange" : "violet",
    subject,
    meta: `Auto-opened by transaction monitor · score ${Math.round(record.score * 100)}/100`,
    status: "open",
    evidenceCount: "1",
    lastActivity: now,
    opened: now,
    statusLabel: record.tier === "hold" ? "Transaction Hold" : "Review Required",
    statusDetail: `Anomaly tier: ${record.tier.toUpperCase()} · ${typology.primaryTypology?.name ?? "Unknown typology"} (${typology.primaryTypology?.matchStrength ?? "weak"} match)`,
    evidence: [{
      id: `ev-${record.flagId}`,
      type: "transaction_flag",
      summary: `Anomaly score ${Math.round(record.score * 100)}/100 · Drivers: ${record.drivers.join("; ")}`,
      addedAt: now,
    }],
    timeline: [{
      id: `tl-${record.flagId}`,
      type: "auto",
      actor: "Transaction Monitor",
      text: `Case auto-opened by cron · ${typology.primaryTypology?.matchRationale ?? "anomaly detected"}`,
      at: now,
    }],
  }];

  await fetch(`${BASE_URL}/api/cases`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
    },
    body: JSON.stringify({ cases: casePayload }),
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => console.error("[txn-monitor] case open failed:", err));
}

export async function POST(req: Request): Promise<NextResponse> {
  const cronSecret = process.env["CRON_SECRET"] ?? process.env["ONGOING_RUN_TOKEN"] ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const allTenantKeys = await listKeys("hawkeye-txn-flags/");
  const unprocessed: TxnFlagRecord[] = [];

  for (const key of allTenantKeys) {
    const record = await getJson<TxnFlagRecord>(key);
    if (record && !record.processed) unprocessed.push(record);
  }

  const results = { total: unprocessed.length, casesOpened: 0, errors: 0 };

  for (const record of unprocessed) {
    try {
      const typology = await runTypologyMatch(record);
      const strength = typology?.primaryTypology?.matchStrength;

      if (record.tier === "hold" || strength === "strong" || strength === "moderate") {
        await openCase(record, typology ?? {});
        results.casesOpened++;
      }

      // Mark processed regardless — even if we didn't open a case
      await setJson(`hawkeye-txn-flags/${record.tenantId}/${record.flagId}.json`, {
        ...record,
        processed: true,
        processedAt: new Date().toISOString(),
        typologyStrength: strength ?? "none",
      });
    } catch (err) {
      console.error("[txn-monitor] failed to process flag", record.flagId, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results, at: new Date().toISOString() });
}
