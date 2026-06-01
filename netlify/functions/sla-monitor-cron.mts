// I-04 + I-14 — SLA breach + approach-deadline scheduled cron.
//
// Runs every hour. For each tenant chain in `hawkeye-hs-cases`:
//   1. Loads the case list.
//   2. Calls classifyCasesBySla → buckets into {breached, approaching}.
//   3. Flips `breachLogged: true` on each newly-breached case so the
//      next tick doesn't re-alert (same pattern as the existing
//      checkSlaBreach in web/lib/server/hs-case-store.ts).
//   4. Writes an HMAC audit-chain entry per newly-breached case
//      (event: "sla.breach") and per approaching case
//      (event: "sla.approaching"). Approaching entries also carry a
//      hoursRemaining field so the audit reader can derive a timeline.
//   5. Optionally POSTs a single summary webhook to ALERT_WEBHOOK_URL /
//      WEBHOOK_ALERT_URL containing the formatted alert text.
//
// Wired by netlify.toml — see the `[functions]` block. The schedule
// is `0 * * * *` (top of every hour). Each tenant's processing is
// bounded so one bad tenant cannot starve the others.
//
// Idempotency: the breachLogged flip is the dedup key for breach
// events. For approaching events we re-emit every tick (the MLRO
// is expected to act, so re-surfacing every hour during the 48-hour
// window is intentional — but the webhook payload says "approaching"
// so downstream automation can dedup by caseId+date if needed).

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import {
  classifyCasesBySla,
  formatSlaAlert,
  type SlaCaseShape,
} from '../../web/lib/server/sla-monitor.js';
import { writeHeartbeat } from '../lib/heartbeat.js';

const LABEL = 'sla-monitor';

// Mirror of hs-case-store's persisted shape — we only consume what we need.
interface PersistedCase extends SlaCaseShape {
  tenantId?: string;
}

async function listTenants(): Promise<string[]> {
  // hs-cases are stored at `tenant/<tenantId>/cases.json` in the
  // hawkeye-hs-cases store. Discover tenants via list.
  try {
    const store = getStore('hawkeye-hs-cases');
    const r = await store.list({ prefix: 'tenant/' });
    const tenants = new Set<string>();
    for (const b of r.blobs) {
      const parts = b.key.split('/');
      if (parts.length >= 3 && parts[0] === 'tenant') tenants.add(parts[1] ?? '');
    }
    return [...tenants].filter(Boolean);
  } catch (err) {
    console.warn(`[${LABEL}] tenant list failed (proceeding with 'default' only):`, err instanceof Error ? err.message : String(err));
    return ['default'];
  }
}

async function loadCases(tenantId: string): Promise<PersistedCase[]> {
  try {
    const store = getStore('hawkeye-hs-cases');
    const raw = await store.get(`tenant/${tenantId}/cases.json`, { type: 'json' }) as PersistedCase[] | null;
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn(`[${LABEL}] case load failed for tenant ${tenantId}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function persistCases(tenantId: string, cases: PersistedCase[]): Promise<void> {
  try {
    const store = getStore('hawkeye-hs-cases');
    await store.setJSON(`tenant/${tenantId}/cases.json`, cases);
  } catch (err) {
    console.warn(`[${LABEL}] case persist failed for tenant ${tenantId}:`, err instanceof Error ? err.message : String(err));
  }
}

async function postWebhook(text: string, payload: Record<string, unknown>): Promise<void> {
  const url = process.env['WEBHOOK_ALERT_URL'] ?? process.env['ALERT_WEBHOOK_URL'];
  if (!url) return;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8_000);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...payload }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn(`[${LABEL}] webhook fan-out failed:`, err instanceof Error ? err.message : String(err));
  }
}

// We import writeAuditChainEntry lazily so a failing audit-chain module
// (missing AUDIT_CHAIN_SECRET in some environments) cannot stop the cron
// from running its primary breach-detection job.
async function writeBreachAudits(
  tenantId: string,
  breached: ReturnType<typeof classifyCasesBySla<PersistedCase>>['breached'],
  approaching: ReturnType<typeof classifyCasesBySla<PersistedCase>>['approaching'],
): Promise<void> {
  if (breached.length === 0 && approaching.length === 0) return;
  let writer: typeof import('../../web/lib/server/audit-chain.js') | null = null;
  try {
    writer = await import('../../web/lib/server/audit-chain.js');
  } catch (err) {
    console.warn(`[${LABEL}] audit-chain module unavailable:`, err instanceof Error ? err.message : String(err));
    return;
  }
  for (const b of breached) {
    void writer.writeAuditChainEntry({
      event: 'sla.breach',
      actor: 'system:sla-monitor',
      caseId: b.case_.caseId,
      subjectName: b.case_.subjectName,
      riskCategory: b.case_.riskCategory,
      slaDeadline: b.case_.slaDeadline,
      hoursOverdue: b.hoursOverdue,
    }, tenantId).catch(() => undefined);
  }
  for (const a of approaching) {
    void writer.writeAuditChainEntry({
      event: 'sla.approaching',
      actor: 'system:sla-monitor',
      caseId: a.case_.caseId,
      subjectName: a.case_.subjectName,
      riskCategory: a.case_.riskCategory,
      slaDeadline: a.case_.slaDeadline,
      hoursRemaining: a.hoursRemaining,
    }, tenantId).catch(() => undefined);
  }
}

export default async (req: Request): Promise<Response> => {
  // AML-11: make Netlify's implicit scheduled-function protection explicit
  // in the handler. In production, refuse any invocation that lacks the
  // x-netlify-scheduled-function header — even a legitimate operator
  // hitting this URL by mistake should be redirected to the admin tooling
  // rather than blindly triggering SLA recompute across all tenants.
  const isScheduled = req.headers.get("x-netlify-scheduled-function") === "true";
  if (process.env["NODE_ENV"] === "production" && !isScheduled) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const startedAt = Date.now();
  const now = new Date();
  const tenants = await listTenants();

  let totalBreached = 0;
  let totalApproaching = 0;
  const tenantSummaries: Array<{ tenantId: string; breached: number; approaching: number }> = [];

  for (const tenantId of tenants) {
    const cases = await loadCases(tenantId);
    if (cases.length === 0) continue;

    const cls = classifyCasesBySla<PersistedCase>(cases, now);

    // Flip breachLogged on newly-breached cases — the same flag the
    // case-store's own checkSlaBreach uses, kept consistent so a future
    // ad-hoc /api call won't re-emit.
    if (cls.breached.length > 0) {
      const breachedIds = new Set(cls.breached.map((b) => b.case_.caseId));
      const updated = cases.map((c) =>
        breachedIds.has(c.caseId)
          ? { ...c, breachLogged: true, slaBreach: true }
          : c,
      );
      await persistCases(tenantId, updated);
    }

    await writeBreachAudits(tenantId, cls.breached, cls.approaching);

    if (cls.breached.length > 0 || cls.approaching.length > 0) {
      const summary = formatSlaAlert(cls, now);
      await postWebhook(summary.text, {
        event: 'sla_alert',
        tenantId,
        totalBreached: summary.totalBreached,
        totalApproaching: summary.totalApproaching,
        detectedAt: summary.detectedAt,
      });
    }

    totalBreached += cls.breached.length;
    totalApproaching += cls.approaching.length;
    tenantSummaries.push({
      tenantId,
      breached: cls.breached.length,
      approaching: cls.approaching.length,
    });
  }

  await writeHeartbeat(LABEL);

  const body = {
    ok: true,
    label: LABEL,
    at: now.toISOString(),
    durationMs: Date.now() - startedAt,
    totalBreached,
    totalApproaching,
    tenantCount: tenants.length,
    tenants: tenantSummaries,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

export const config: Config = { schedule: '0 * * * *' };
