// POST /api/cron/transaction-monitor
//
// Scheduled endpoint called hourly by netlify/functions/transaction-monitor.mts.
// Reads all unprocessed flag/hold records from Blob storage, runs typology-match
// on each, and opens a case for high-severity hits.
//
// Protected by a bearer token. Accepts the SAME token set the scheduler
// (netlify/functions/transaction-monitor.mts) sends, in the same fallback
// order:  Authorization: Bearer <CRON_SECRET ?? ONGOING_RUN_TOKEN>
// to prevent public triggering. The route and scheduler must agree on the
// accepted tokens — otherwise a deployment that sets ONGOING_RUN_TOKEN but
// not CRON_SECRET 401s on every scheduled run.

import { NextResponse } from "next/server";
import { listKeys, getJson, setJson } from "@/lib/server/store";

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import type { TxnFlagRecord } from "@/app/api/transaction-anomaly/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeAppBase(): string {
  const candidates = [
    process.env["URL"],
    process.env["DEPLOY_PRIME_URL"],
    process.env["NEXT_PUBLIC_APP_URL"],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.username || u.password) continue;
      if (u.pathname !== "/" && u.pathname !== "") continue;
      return `${u.protocol}//${u.host}`;
    } catch { /* skip invalid */ }
  }
  return "https://hawkeye-sterling.netlify.app";
}

interface TypologyResult {
  primaryTypology?: {
    name: string;
    matchStrength: "strong" | "moderate" | "weak";
    matchRationale: string;
  };
  strThreshold?: string;
}

async function runTypologyMatch(record: TxnFlagRecord): Promise<TypologyResult | null> {
  const adminToken = process.env["ADMIN_TOKEN"] ?? "";
  const facts = [
    `Anomaly score: ${Math.round(record.score * 100)}/100 (tier: ${record.tier.toUpperCase()})`,
    `Transaction amount: USD ${record.amountUsd.toFixed(2)}`,
    `Session: ${record.sessionId}`,
    ...record.drivers,
  ].join("; ");

  try {
    const res = await fetch(`${safeAppBase()}/api/typology-match`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify({ facts, subjectType: "transaction", transactionTypes: ["cash"] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => ({})) as TypologyResult;
  } catch {
    return null;
  }
}

async function openCase(record: TxnFlagRecord, typology: TypologyResult): Promise<void> {
  const adminToken = process.env["ADMIN_TOKEN"] ?? "";
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

  await fetch(`${safeAppBase()}/api/cases`, {
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
  // Accept the same token set the scheduler authenticates with, in the same
  // fallback order (CRON_SECRET first, then ONGOING_RUN_TOKEN). At least one
  // must be configured — fail closed if neither is set.
  const acceptedTokens = [
    process.env["CRON_SECRET"] ?? "",
    process.env["ONGOING_RUN_TOKEN"] ?? "",
  ].filter((t) => t.length > 0);
  if (acceptedTokens.length === 0) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  // Timing-safe: HMAC both sides to fixed-length digests, then compare.
  const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
  const authorized = acceptedTokens.some((token) => {
    const ha = createHmac("sha256", COMPARE_KEY).update(token).digest();
    return timingSafeEqual(ha, hb);
  });
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // CRON-001 defense-in-depth: in production also require Netlify's
  // x-netlify-scheduled-function header. Token alone is insufficient — a
  // leaked CRON_SECRET cannot trigger this route from an attacker's host
  // because Netlify injects the header only on scheduled invocations.
  const isScheduled = req.headers.get("x-netlify-scheduled-function") === "true";
  if (process.env["NODE_ENV"] === "production" && !isScheduled) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
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
        await setJson(`hawkeye-txn-flags/${safeSegment(record.tenantId)}/${safeSegment(record.flagId)}.json`, {
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

    void writeAuditChainEntry(
      { event: "txn_monitor.cron_run", actor: "cron", meta: { total: results.total, casesOpened: results.casesOpened, errors: results.errors } },
      "system",
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...results, at: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[txn-monitor] unhandled error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
