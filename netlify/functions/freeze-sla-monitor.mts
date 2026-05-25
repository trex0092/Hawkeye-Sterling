// Hawkeye Sterling — 24-hour asset freeze SLA monitor.
//
// Cabinet Resolution 74/2020 Art.4 + UAE FDL 10/2025 Art.24 require that
// asset freeze is applied within 24 hours of an EOCN/TFS designation hit.
//
// This function runs hourly and:
//   1. Reads all open TFS alerts from the server blob store.
//   2. Flags any alert that has been open (not REPORTED or NO_MATCH) for ≥ 23 hours.
//   3. For each overdue alert, triggers the MLRO escalation webhook.
//   4. Writes an audit chain entry for every SLA breach detected.
//   5. Writes the SLA status report to hawkeye-sterling/tfs-sla-status.json
//      so GET /api/tfs-alerts/sla-status can serve it without repeating the scan.
//
// Schedule: every hour at :30 UTC.
//
// Environment variables required:
//   HAWKEYE_WEBHOOK_URL  — escalation webhook (optional; logs if absent)
//   HAWKEYE_CRON_TOKEN   — bearer token for HTTP trigger (optional)

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-sterling";
const TFS_KEY = "hawkeye-tfs-alerts/v1.json";
const SLA_STATUS_KEY = "tfs-sla-status.json";
const RUN_LABEL = "freeze-sla-monitor";

// Escalate if alert is open for ≥ 23 hours (gives 1 hour margin before 24h hard deadline).
const ESCALATION_THRESHOLD_MS = 23 * 60 * 60 * 1_000;

type TFSAlertStatus = "NEW" | "SCREENING_IN_PROGRESS" | "SCREENED" | "NO_MATCH" | "MATCH_FOUND" | "REPORTED";

interface TFSAlert {
  id: string;
  dateReceived: string;
  subject: string;
  sender: string;
  snippet: string;
  alertType: string;
  status: TFSAlertStatus;
  asanaTaskId: string | null;
  asanaTaskUrl: string | null;
  dateActioned: string | null;
  goamlReference: string | null;
  notes: string;
}

interface SlaBreachRecord {
  alertId: string;
  subject: string;
  alertType: string;
  dateReceived: string;
  hoursOpen: number;
  status: TFSAlertStatus;
  asanaTaskUrl: string | null;
}

interface SlaStatusReport {
  ok: boolean;
  checkedAt: string;
  totalOpenAlerts: number;
  overdueCount: number;
  breaches: SlaBreachRecord[];
  nextCheckAt: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  // Netlify scheduler sets x-nf-event: schedule; HTTP callers must authenticate.
  const cronToken = process.env["HAWKEYE_CRON_TOKEN"];
  const isScheduledEvent = req.headers.get("x-nf-event") === "schedule";
  if (!isScheduledEvent) {
    const auth = req.headers.get("authorization");
    const supplied = auth?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!cronToken || supplied !== cronToken) {
      return jsonResponse({ ok: false, label: RUN_LABEL, error: "Unauthorized" }, 401);
    }
  }

  const checkedAt = new Date().toISOString();
  const now = Date.now();
  const nextCheckAt = new Date(now + 60 * 60 * 1_000).toISOString();

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  // Load TFS alerts
  let alerts: TFSAlert[] = [];
  try {
    const raw = await store.get(TFS_KEY, { type: "json" }) as { alerts?: TFSAlert[] } | null;
    alerts = raw?.alerts ?? [];
  } catch (err) {
    console.warn(`[${RUN_LABEL}] failed to load TFS alerts:`, err instanceof Error ? err.message : String(err));
  }

  // Find open alerts that have been unresolved for ≥ 23 hours
  const TERMINAL_STATUSES: TFSAlertStatus[] = ["NO_MATCH", "REPORTED"];
  const openAlerts = alerts.filter((a) => !TERMINAL_STATUSES.includes(a.status));

  const breaches: SlaBreachRecord[] = [];

  for (const alert of openAlerts) {
    const receivedAt = Date.parse(alert.dateReceived);
    if (Number.isNaN(receivedAt)) continue;
    const ageMs = now - receivedAt;
    if (ageMs >= ESCALATION_THRESHOLD_MS) {
      const hoursOpen = Math.round(ageMs / (60 * 60 * 1_000) * 10) / 10;
      breaches.push({
        alertId: alert.id,
        subject: alert.subject,
        alertType: alert.alertType,
        dateReceived: alert.dateReceived,
        hoursOpen,
        status: alert.status,
        asanaTaskUrl: alert.asanaTaskUrl,
      });

      // Fire escalation webhook for each breach
      const webhookUrl = process.env["HAWKEYE_WEBHOOK_URL"];
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              event: "freeze_sla_breach",
              alertId: alert.id,
              subject: alert.subject,
              hoursOpen,
              status: alert.status,
              deadline: "Cabinet Resolution 74/2020 Art.4 — 24h freeze required",
              urgency: hoursOpen >= 24 ? "BREACH" : "WARNING",
              checkedAt,
            }),
            signal: AbortSignal.timeout(10_000),
          });
        } catch (err) {
          console.error(`[${RUN_LABEL}] webhook failed for alert ${alert.id}:`, err instanceof Error ? err.message : String(err));
        }
      } else {
        console.error(`[${RUN_LABEL}] SLA BREACH — alert ${alert.id} open ${hoursOpen}h without freeze. HAWKEYE_WEBHOOK_URL not set — escalation not delivered.`);
      }
    }
  }

  const report: SlaStatusReport = {
    ok: breaches.length === 0,
    checkedAt,
    totalOpenAlerts: openAlerts.length,
    overdueCount: breaches.length,
    breaches,
    nextCheckAt,
  };

  // Persist SLA status so the API route can serve it without rescanning
  await store.set(SLA_STATUS_KEY, JSON.stringify(report)).catch((err) => {
    console.warn(`[${RUN_LABEL}] failed to write SLA status:`, err instanceof Error ? err.message : String(err));
  });

  if (breaches.length > 0) {
    console.error(`[${RUN_LABEL}] SLA MONITOR: ${breaches.length} alert(s) overdue for freeze. Cabinet Resolution 74/2020 Art.4 — immediate action required.`);
  }

  await writeHeartbeat(RUN_LABEL);
  return jsonResponse({ ok: true, label: RUN_LABEL, ...report });
}

export const config: Config = {
  // Every hour at :30 UTC — offset from other cron functions.
  schedule: "30 * * * *",
};
