// GET /api/admin/billing
//
// Multi-tenant billing surface (audit follow-up #55). Returns per-tenant
// usage + quota counters for billing rollup. Designed to be polled by
// the billing system (Stripe / Chargebee / internal) on a schedule;
// the route is intentionally read-only — it does NOT create invoices.
//
// Counters tracked (via Netlify Blobs):
//   · screensRun         — POST /api/super-brain calls
//   · agentScreensRun    — POST /api/agent/screen calls (LLM tool-use)
//   · advisorCallsRun    — POST /api/mlro-advisor calls
//   · dispositionsLogged — POST /api/cases/[id]/disposition
//   · str_drafts         — POST /api/sar-report drafts
//   · agent_extractions  — POST /api/agent/extract
//   · soc2_exports       — GET  /api/compliance/soc2-export
//
// The producing routes increment counters via incrementUsage() (also
// in this file as a helper). Quota enforcement is delegated to the
// existing `enforce` gate; this surface is for visibility + billing.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  type BillingMetric,
  type UsageBucket,
  monthKey,
  bucketKey,
  getBillingStore,
} from "@/lib/server/billing";
import { timingSafeEqual } from "node:crypto";

// Fail-closed: ADMIN_TOKEN must be set and must match the bearer token.
function requireAdminToken(req: Request): NextResponse | null {
  const adminToken = process.env["ADMIN_TOKEN"];
  if (!adminToken) {
    return NextResponse.json(
      { ok: false, error: "Admin billing endpoint is not configured (ADMIN_TOKEN not set)" },
      { status: 503, headers: {} }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  const enc = new TextEncoder();
  const a = enc.encode(adminToken);
  const b = enc.encode(bearer);
  const match = a.byteLength === b.byteLength && timingSafeEqual(a, b);
  if (!match) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 , headers: {} });
  }
  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BillingReport {
  tenant: string | null;
  month: string;
  buckets: UsageBucket[];
  totals: Record<BillingMetric, number>;
  asOf: string;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const adminDeny = requireAdminToken(req);
  if (adminDeny) return adminDeny;

  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenantFilter = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month") ?? monthKey();
  const allTenants = url.searchParams.get("all") === "1";

  const buckets: UsageBucket[] = [];
  const totals: Record<BillingMetric, number> = {
    screensRun: 0,
    agentScreensRun: 0,
    advisorCallsRun: 0,
    dispositionsLogged: 0,
    str_drafts: 0,
    agent_extractions: 0,
    soc2_exports: 0,
  };

  // Initialising the Blobs store throws synchronously when the platform did
  // not auto-inject Blobs context AND we lack explicit siteID/token env vars.
  // Treat that as "no usage data yet" and return empty counters rather than
  // letting the route 500.
  try {
    const store = getBillingStore();
    if (allTenants) {
      // List all tenant usage for the month — production should restrict this to admin tokens.
      try {
        const list = await store.list({ prefix: `usage/` });
        for (const item of list.blobs) {
          if (!item.key.endsWith(`${monthParam}.json`)) continue;
          try {
            const raw = await store.get(item.key, { type: "text" });
            if (raw) {
              const b = JSON.parse(raw) as UsageBucket;
              buckets.push(b);
              for (const [m, n] of Object.entries(b.counters)) {
                totals[m as BillingMetric] = (totals[m as BillingMetric] ?? 0) + (n ?? 0);
              }
            }
          } catch (err) { console.warn("[hawkeye] admin/billing: bucket parse failed (skipping):", err); }
        }
      } catch { /* list failed; return empty */ }
    } else {
      // Single-tenant view.
      try {
        const raw = await store.get(bucketKey(tenantFilter, monthParam), { type: "text" });
        if (raw) {
          const b = JSON.parse(raw) as UsageBucket;
          buckets.push(b);
          for (const [m, n] of Object.entries(b.counters)) {
            totals[m as BillingMetric] = (totals[m as BillingMetric] ?? 0) + (n ?? 0);
          }
        }
      } catch (err) { console.warn("[hawkeye] admin/billing: bucket parse failed (skipping):", err); }
    }
  } catch (err) {
    console.error("[hawkeye] admin/billing: getBillingStore() threw — returning empty counters:", err);
  }

  const report: BillingReport = {
    tenant: allTenants ? null : tenantFilter,
    month: monthParam,
    buckets,
    totals,
    asOf: new Date().toISOString(),
  };

  return NextResponse.json(report, { headers: gate.headers });
}

export const GET = handleGet;
