// Netlify Scheduled Function — HAWKEYE STERLING system health monitor.
//
// Schedule: every 6 hours ("0 */6 * * *").
// Checks sanctions list freshness via /api/status; if fewer than 6 lists are
// healthy or any critical list is older than 30 hours:
//   1. POSTs to ALERT_WEBHOOK_URL (if set)
//   2. Creates an Asana task in the Master Inbox project assigned to the MLRO

import type { Config } from "@netlify/functions";

const MASTER_INBOX = "1214148630166524";
const DEFAULT_WORKSPACE = "1213645083721316";
const DEFAULT_ASSIGNEE = "1213645083721304";

const ALERT_TITLE = "SYSTEM ALERT: Sanctions lists degraded — immediate action required";

interface ListFreshness {
  lastRefreshed?: string;
  ageHours?: number;
  entityCount?: number;
  status?: string;
}

interface StatusResponse {
  ok?: boolean;
  listsFreshness?: Record<string, ListFreshness>;
  servicesUp?: string[];
  servicesDown?: Array<{ name: string; status: string; note?: string }>;
}

async function fetchStatus(baseUrl: string): Promise<StatusResponse | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { "content-type": "application/json" },
        signal: ctl.signal,
      });
      if (!res.ok) return null;
      return (await res.json()) as StatusResponse;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn("[health-monitor] /api/status fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

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

export default async (_req: Request): Promise<Response> => {
  const baseUrl =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const checkedAt = new Date().toISOString();
  console.info("[health-monitor] starting health check at", checkedAt);

  const status = await fetchStatus(baseUrl);
  if (!status) {
    console.error("[health-monitor] could not reach /api/status — health check failed");
    const alertBody = {
      alert: ALERT_TITLE,
      reason: "Could not reach /api/status endpoint",
      checkedAt,
      baseUrl,
    };
    const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
    if (webhookUrl) await postWebhookAlert(webhookUrl, alertBody);
    await createAsanaAlert(
      [
        `HAWKEYE STERLING — SYSTEM HEALTH ALERT`,
        ``,
        `Alert    : ${ALERT_TITLE}`,
        `Time     : ${checkedAt}`,
        `Reason   : Could not reach ${baseUrl}/api/status`,
        ``,
        `ACTION REQUIRED: Verify Netlify deployment and function health dashboard.`,
        `Auto-created by health-monitor scheduled function (0 */6 * * *)`,
      ].join("\n"),
    );
    return new Response(JSON.stringify({ ok: false, reason: "status endpoint unreachable", checkedAt }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const freshness = status.listsFreshness ?? {};
  const staleThresholdHours = 30;
  const requiredListCount = 6;

  const listIds = Object.keys(freshness);
  const healthyLists = listIds.filter((id) => freshness[id]?.status === "ok" || freshness[id]?.status === "fresh");
  const staleLists = listIds.filter((id) => {
    const f = freshness[id];
    return f && typeof f.ageHours === "number" && f.ageHours > staleThresholdHours;
  });
  const missingLists = listIds.filter((id) => !freshness[id]?.lastRefreshed);

  const healthyCount = healthyLists.length;
  const degraded = healthyCount < requiredListCount || staleLists.length > 0;

  console.info(
    `[health-monitor] healthy=${healthyCount}/${requiredListCount} stale=${staleLists.length} missing=${missingLists.length} degraded=${degraded}`,
  );

  if (!degraded) {
    return new Response(
      JSON.stringify({ ok: true, healthyLists: healthyCount, staleLists: staleLists.length, checkedAt }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // System is degraded — send alerts
  const freshnessLines = listIds.map((id) => {
    const f = freshness[id];
    return `  ${id.padEnd(18)}: status=${f?.status ?? "unknown"} ageHours=${f?.ageHours ?? "null"} entityCount=${f?.entityCount ?? "null"}`;
  });

  const alertNotes = [
    `⚠️  HAWKEYE STERLING — SANCTIONS LISTS DEGRADED`,
    ``,
    `Alert    : ${ALERT_TITLE}`,
    `Time     : ${checkedAt}`,
    ``,
    `HEALTH SUMMARY`,
    `  Healthy lists  : ${healthyCount} / ${requiredListCount}`,
    `  Stale lists    : ${staleLists.join(", ") || "none"}`,
    `  Missing lists  : ${missingLists.join(", ") || "none"}`,
    ``,
    `LIST FRESHNESS`,
    ...freshnessLines,
    ``,
    `IMPACT`,
    `  Screening tools are blocked by the sanctions gate until all critical lists are loaded.`,
    `  Affected tools: screen_subject, batch_screen, super_brain, ai_decision, compliance_report,`,
    `                  generate_screening_report, generate_sar_report, pep_profile, vessel_check`,
    ``,
    `REMEDIATION`,
    `  1. Check Netlify Blobs for hawkeye-lists store`,
    `  2. Trigger manual refresh: POST /api/sanctions/watch with SANCTIONS_CRON_TOKEN`,
    `  3. Verify NETLIFY_BLOBS_TOKEN is set and has write permissions`,
    ``,
    `Legal basis: FDL No. 10/2025 Art. 15 — screening is prohibited on incomplete corpus`,
    `Auto-created by health-monitor scheduled function (0 */6 * * *)`,
  ].join("\n");

  const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
  const alertPayload = {
    alert: ALERT_TITLE,
    healthyLists: healthyCount,
    requiredListCount,
    staleLists,
    missingLists,
    freshness,
    checkedAt,
  };

  const tasks: Promise<void>[] = [];
  if (webhookUrl) tasks.push(postWebhookAlert(webhookUrl, alertPayload));
  tasks.push(createAsanaAlert(alertNotes));
  await Promise.allSettled(tasks);

  return new Response(
    JSON.stringify({ ok: false, degraded: true, healthyLists: healthyCount, staleLists, missingLists, checkedAt }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
