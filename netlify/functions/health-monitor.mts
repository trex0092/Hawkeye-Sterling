// Netlify Scheduled Function — HAWKEYE STERLING system health monitor.
//
// Schedule: every 6 hours ("0 */6 * * *").
// Checks sanctions list freshness directly from hawkeye-list-reports blobs
// (not via /api/status HTTP call — one unreachable route must not make all
// lists appear unhealthy). If fewer than REQUIRED_HEALTHY_COUNT lists are
// current or any scheduled function is overdue:
//   1. POSTs to ALERT_WEBHOOK_URL (if set)
//   2. Creates an Asana task in the Master Inbox project assigned to the MLRO

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";
import { checkListSources } from "../lib/list-source-check.js";

const MASTER_INBOX = "1214148630166524";
const DEFAULT_WORKSPACE = "1213645083721316";
const DEFAULT_ASSIGNEE = "1213645083721304";

const ALERT_TITLE = "SYSTEM ALERT: Sanctions lists degraded — immediate action required";
const REQUIRED_HEALTHY_COUNT = 6;

async function postWebhookAlert(webhookUrl: string, body: Record<string, unknown>): Promise<void> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn("[health-monitor] webhook POST failed:", err instanceof Error ? err.message : err);
  }
}

async function createAsanaAlert(notes: string): Promise<void> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    console.warn("[health-monitor] ASANA_TOKEN not set — skipping Asana task creation");
    return;
  }
  const projectGid = process.env["ASANA_MLRO_PROJECT_GID"] ?? MASTER_INBOX;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    try {
      const res = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: ALERT_TITLE,
            notes,
            projects: [projectGid],
            workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE,
            assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE,
          },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        console.warn("[health-monitor] Asana task creation returned HTTP", res.status);
      } else {
        const payload = (await res.json().catch(() => null)) as { data?: { gid?: string } } | null;
        console.info("[health-monitor] Asana alert task created:", payload?.data?.gid ?? "unknown gid");
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn("[health-monitor] Asana task creation failed:", err instanceof Error ? err.message : err);
  }
}

// Scheduled functions that write heartbeats and their max allowed silence in hours
// (1.5× their cron interval, rounded up).
const HEARTBEAT_SPECS: Array<{ label: string; maxSilenceHours: number }> = [
  { label: "sanctions-watch-15min",  maxSilenceHours: 1  }, // every 15 min → alert after 1h
  { label: "warm-pool",              maxSilenceHours: 1  }, // every 4 min → alert after 1h
  { label: "transaction-monitor",    maxSilenceHours: 2  }, // every 1h → alert after 2h
  { label: "audit-chain-probe",      maxSilenceHours: 2  }, // every 1h → alert after 2h
  { label: "adverse-media-rss",      maxSilenceHours: 2  }, // every 30 min → alert after 2h
  { label: "designation-alert-check",maxSilenceHours: 2  }, // every 1h → alert after 2h
  { label: "sanctions-ingest",       maxSilenceHours: 9  }, // every 4h → alert after 9h
  { label: "eocn-poll",              maxSilenceHours: 10 }, // every 6h → alert after 10h
  { label: "goods-control-ingest",   maxSilenceHours: 10 }, // every 6h → alert after 10h
  { label: "lseg-cfs-poll",          maxSilenceHours: 10 }, // every 6h → alert after 10h
  { label: "pkyc-monitor",           maxSilenceHours: 10 }, // every 6h → alert after 10h
  { label: "health-monitor",         maxSilenceHours: 10 }, // every 6h → alert after 10h
  { label: "refresh-lists",          maxSilenceHours: 10 }, // daily 03:00 → alert after 10h
  { label: "sanctions-watch-cron",   maxSilenceHours: 26 }, // daily 04:30 UTC → alert after 26h
  { label: "retention-scheduler",    maxSilenceHours: 26 }, // daily 23:15 UTC → alert after 26h
  { label: "sanctions-watch-1100",   maxSilenceHours: 26 }, // daily 11:00 UTC → alert after 26h
  { label: "sanctions-watch-1330",   maxSilenceHours: 26 }, // daily 13:30 UTC → alert after 26h
  { label: "sanctions-daily-0830",   maxSilenceHours: 26 }, // daily 04:30 UTC → alert after 26h
  { label: "sanctions-daily-1300",   maxSilenceHours: 26 }, // daily 09:00 UTC → alert after 26h
  { label: "sanctions-daily-1730",   maxSilenceHours: 26 }, // daily 13:30 UTC → alert after 26h
];

interface HeartbeatEntry {
  lastSuccess: string;
  label: string;
}

async function checkHeartbeats(): Promise<string[]> {
  const overdueAlerts: string[] = [];
  try {
    const store = getStore("hawkeye-function-heartbeats");
    const now = Date.now();
    for (const spec of HEARTBEAT_SPECS) {
      try {
        const raw = await store.get(spec.label, { type: "json" }) as HeartbeatEntry | null;
        if (!raw?.lastSuccess) {
          overdueAlerts.push(`${spec.label}: no heartbeat recorded — function may never have run successfully`);
          continue;
        }
        const lastMs = new Date(raw.lastSuccess).getTime();
        const ageHours = (now - lastMs) / 3_600_000;
        if (ageHours > spec.maxSilenceHours) {
          overdueAlerts.push(
            `${spec.label}: last success ${ageHours.toFixed(1)}h ago (limit ${spec.maxSilenceHours}h) — scheduled function may be failing silently`,
          );
        }
      } catch {
        overdueAlerts.push(`${spec.label}: heartbeat read failed — cannot verify function health`);
      }
    }
  } catch (err) {
    console.warn("[health-monitor] heartbeat store unavailable:", err instanceof Error ? err.message : err);
  }
  return overdueAlerts;
}

export default async (_req: Request): Promise<Response> => {
  const timestamp = new Date().toISOString();
  console.info("[health-monitor] entry at", timestamp);

  try {
    // Fail fast if required env vars are absent — blob reads will fail anyway.
    const missingEnv: string[] = [];
    if (!process.env["NETLIFY_SITE_ID"] && !process.env["SITE_ID"]) missingEnv.push("NETLIFY_SITE_ID");
    if (
      !process.env["NETLIFY_BLOBS_TOKEN"] &&
      !process.env["NETLIFY_API_TOKEN"] &&
      !process.env["NETLIFY_AUTH_TOKEN"] &&
      !process.env["NETLIFY_BLOBS_CONTEXT"]
    ) {
      missingEnv.push("NETLIFY_BLOBS_TOKEN");
    }
    if (missingEnv.length > 0) {
      const reason = `missing_env: ${missingEnv.join(", ")}`;
      console.error("[health-monitor]", reason);
      return new Response(
        JSON.stringify({ healthy: false, reason, lists: [], timestamp }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // Run source checks and heartbeat checks in parallel.
    const [lists, heartbeatAlerts] = await Promise.all([
      checkListSources(),
      checkHeartbeats(),
    ]);

    const healthyCount = lists.filter((l) => l.healthy).length;
    const unhealthyLists = lists.filter((l) => !l.healthy);
    const degraded = healthyCount < REQUIRED_HEALTHY_COUNT || heartbeatAlerts.length > 0;

    console.info(
      `[health-monitor] exit healthy=${healthyCount}/${REQUIRED_HEALTHY_COUNT} unhealthy=${unhealthyLists.length} heartbeatAlerts=${heartbeatAlerts.length} degraded=${degraded}`,
    );

    if (!degraded) {
      await writeHeartbeat("health-monitor");
      return new Response(
        JSON.stringify({ ok: true, healthy: true, healthyCount, lists, heartbeatAlerts: [], timestamp }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // System is degraded — send alerts.
    const freshnessLines = lists.map((l) =>
      `  ${l.id.padEnd(18)}: healthy=${l.healthy} ageHours=${l.ageHours ?? "null"} recordCount=${l.recordCount ?? "null"}${l.reason ? ` [${l.reason}]` : ""}`,
    );
    const staleLists = unhealthyLists.filter((l) => l.reason === "stale").map((l) => l.id);
    const missingLists = unhealthyLists.filter((l) => l.reason === "never_fetched").map((l) => l.id);

    const alertNotes = [
      `⚠️  HAWKEYE STERLING — SYSTEM HEALTH DEGRADED`,
      ``,
      `Alert    : ${ALERT_TITLE}`,
      `Time     : ${timestamp}`,
      ``,
      `HEALTH SUMMARY`,
      `  Healthy lists  : ${healthyCount} / ${REQUIRED_HEALTHY_COUNT}`,
      `  Stale lists    : ${staleLists.join(", ") || "none"}`,
      `  Missing lists  : ${missingLists.join(", ") || "none"}`,
      `  Function alerts: ${heartbeatAlerts.length}`,
      ``,
      `LIST FRESHNESS`,
      ...freshnessLines,
      ``,
      ...(heartbeatAlerts.length > 0
        ? [
            `SCHEDULED FUNCTION ALERTS`,
            ...heartbeatAlerts.map((a) => `  ${a}`),
            ``,
          ]
        : []),
      `IMPACT`,
      `  Screening tools are blocked by the sanctions gate until all critical lists are loaded.`,
      `  Affected tools: screen, super_brain, disposition, generate_report,`,
      `                  generate_sar_report, pep, vessel_check`,
      ``,
      `REMEDIATION`,
      `  1. Check Netlify Blobs for hawkeye-lists store`,
      `  2. Trigger manual refresh: GET /api/admin/trigger-list-refresh with ADMIN_TOKEN`,
      `  3. Verify NETLIFY_BLOBS_TOKEN is set and has write permissions`,
      `  4. Check Netlify Functions dashboard for scheduled function failures`,
      ``,
      `Legal basis: FDL No. 10/2025 Art. 15 — screening is prohibited on incomplete corpus`,
      `Auto-created by health-monitor scheduled function (0 */6 * * *)`,
    ].join("\n");

    const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
    const alertPayload = {
      alert: ALERT_TITLE,
      healthyCount,
      requiredCount: REQUIRED_HEALTHY_COUNT,
      staleLists,
      missingLists,
      heartbeatAlerts,
      lists,
      timestamp,
    };

    const tasks: Promise<void>[] = [];
    if (webhookUrl) tasks.push(postWebhookAlert(webhookUrl, alertPayload));
    tasks.push(createAsanaAlert(alertNotes));
    await Promise.allSettled(tasks);

    await writeHeartbeat("health-monitor");
    return new Response(
      JSON.stringify({ ok: false, healthy: false, degraded: true, healthyCount, lists, heartbeatAlerts, timestamp }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[health-monitor] unhandled error:", reason);
    // Best-effort heartbeat so health-monitor doesn't appear stale in its own report.
    await writeHeartbeat("health-monitor").catch(() => {});
    return new Response(
      JSON.stringify({ healthy: false, reason, lists: [], timestamp }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
