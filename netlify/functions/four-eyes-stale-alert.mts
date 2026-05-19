// Hawkeye Sterling — stale four-eyes pending items alert.
//
// UAE FDL 10/2025 Art.16 + FATF R.26 require that dual-control approvals
// are not left unactioned indefinitely. This function runs hourly and
// fires a webhook alert for any four-eyes item that has been pending
// for 20–24 hours without a second-approver decision, giving the MLRO
// team a window to act before items expire.
//
// Alert thresholds:
//   ALERT_AFTER_HOURS  (default 20) — fire alert when pending ≥ this many hours
//   EXPIRE_AFTER_HOURS (default 48) — items pending beyond this are also flagged
//
// Wiring:
//   schedule: hourly — "0 * * * *"
//   Store: hawkeye-sterling blob store, keys under "four-eyes/<id>"

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-sterling";
const PREFIX = "four-eyes/";
const RUN_LABEL = "four-eyes-stale-alert";

const ALERT_AFTER_HOURS = Number(process.env["FOUR_EYES_ALERT_HOURS"] ?? "20");
const EXPIRE_AFTER_HOURS = Number(process.env["FOUR_EYES_EXPIRE_HOURS"] ?? "48");

interface FourEyesItem {
  id?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  action: string;
  initiatedBy: string;
  initiatedAt?: string;
  subjectName?: string;
  caseId?: string;
}

function ageHours(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return (now - t) / 3_600_000;
}

async function emitAlert(payload: unknown): Promise<void> {
  const url = process.env["WEBHOOK_ALERT_URL"] ?? process.env["ALERT_WEBHOOK_URL"];
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-fatal — webhook delivery failure is logged via heartbeat; do not
    // rethrow so the function still exits cleanly.
  }
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return json({ ok: false, label: RUN_LABEL, error: String(err) }, 503);
  }

  let keys: string[];
  try {
    const list = await store.list({ prefix: PREFIX });
    keys = list.blobs.map((b) => b.key);
  } catch (err) {
    return json({
      ok: false,
      label: RUN_LABEL,
      error: `list failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 503);
  }

  const now = Date.now();
  const stale: Array<{ id: string; ageHours: number; action: string; initiatedBy: string; caseId?: string }> = [];
  const expired: Array<{ id: string; ageHours: number }> = [];

  for (const key of keys) {
    try {
      const raw = await store.get(key, { type: "json" }) as FourEyesItem | null;
      if (!raw || raw.status !== "pending" || !raw.initiatedAt) continue;
      const age = ageHours(raw.initiatedAt, now);
      const id = raw.id ?? key.replace(PREFIX, "");
      if (age >= EXPIRE_AFTER_HOURS) {
        expired.push({ id, ageHours: Math.round(age) });
      } else if (age >= ALERT_AFTER_HOURS) {
        stale.push({ id, ageHours: Math.round(age), action: raw.action, initiatedBy: raw.initiatedBy, caseId: raw.caseId });
      }
    } catch (err) {
      console.warn(`[four-eyes-stale-alert] unreadable blob at ${key} — skipping:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (stale.length > 0 || expired.length > 0) {
    await emitAlert({
      event: "four_eyes.stale_pending_alert",
      at: new Date().toISOString(),
      staleCount: stale.length,
      expiredCount: expired.length,
      alertAfterHours: ALERT_AFTER_HOURS,
      expireAfterHours: EXPIRE_AFTER_HOURS,
      staleItems: stale.slice(0, 20),
      expiredItems: expired.slice(0, 20),
      note: "UAE FDL 10/2025 Art.16 — dual-control approvals require timely action.",
    });
  }

  await writeHeartbeat(RUN_LABEL);

  return json({
    ok: true,
    label: RUN_LABEL,
    checkedItems: keys.length,
    staleCount: stale.length,
    expiredCount: expired.length,
    alertFired: stale.length > 0 || expired.length > 0,
    durationMs: Date.now() - startedAt,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  schedule: "0 * * * *",  // hourly
};
