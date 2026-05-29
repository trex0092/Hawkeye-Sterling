// Hawkeye Sterling — stale four-eyes pending items alert.
//
// UAE FDL 10/2025 Art.16 + FATF R.26 require that dual-control approvals
// are not left unactioned indefinitely. This function runs hourly and
// fires alerts for any four-eyes item pending ≥ ALERT_AFTER_HOURS, plus
// creates Asana escalation tasks and writes audit chain entries.
//
// Alert thresholds:
//   ALERT_AFTER_HOURS  (default 20) — fire alert when pending ≥ this many hours
//   EXPIRE_AFTER_HOURS (default 48) — items pending beyond this are also flagged
//   BLOCK_AFTER_HOURS  (default 72) — items pending beyond this block STR/SAR/EDD

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-sterling";
const PREFIX = "four-eyes/";
const RUN_LABEL = "four-eyes-stale-alert";

const ALERT_AFTER_HOURS = Number(process.env["FOUR_EYES_ALERT_HOURS"] ?? "20");
const EXPIRE_AFTER_HOURS = Number(process.env["FOUR_EYES_EXPIRE_HOURS"] ?? "48");
const BLOCK_AFTER_HOURS = Number(process.env["FOUR_EYES_BLOCK_HOURS"] ?? "72");

// Asana hardcoded fallbacks (mirrors asanaConfig.ts)
const ASANA_PROJECT_GID = process.env["ASANA_PROJECT_GID"] ?? "1214148630166524";
const ASANA_ASSIGNEE_GID = process.env["ASANA_ASSIGNEE_GID"] ?? "1213645083721304";
const ASANA_WORKSPACE_GID = process.env["ASANA_WORKSPACE_GID"] ?? "1213645083721316";

interface FourEyesItem {
  id?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  action: string;
  initiatedBy: string;
  initiatedAt?: string;
  subjectName?: string;
  caseId?: string;
  tenantId?: string;
  /** Set by this alert when age > BLOCK_AFTER_HOURS to block filing routes. */
  filingBlocked?: boolean;
  filingBlockedAt?: string;
}

function ageHours(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return (now - t) / 3_600_000;
}

async function emitWebhook(url: string, payload: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Non-fatal — webhook delivery failure logged via heartbeat.
  }
}

async function createAsanaTask(
  title: string,
  notes: string,
  priority: "P1" | "P2",
): Promise<string | null> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return null;
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
          name: title,
          notes,
          projects: [ASANA_PROJECT_GID],
          workspace: ASANA_WORKSPACE_GID,
          assignee: ASANA_ASSIGNEE_GID,
          ...(priority === "P1" ? { tags: [] } : {}),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: { gid?: string; permalink_url?: string };
    } | null;
    return payload?.data?.permalink_url ?? null;
  } catch (err) {
    console.warn("[four-eyes-stale-alert] Asana task creation failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function writeAuditEntry(
  base: string,
  cronToken: string,
  event: string,
  extra: Record<string, unknown>,
): Promise<void> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cronToken) headers.authorization = `Bearer ${cronToken}`;
    await fetch(`${base}/api/audit/chain`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, actor: "system:four-eyes-stale-alert", ...extra }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Audit write failures are non-fatal for the cron itself.
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

  const base =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";
  const cronToken = process.env["SANCTIONS_CRON_TOKEN"] ?? "";
  const webhookUrl = process.env["WEBHOOK_ALERT_URL"] ?? process.env["ALERT_WEBHOOK_URL"];

  const now = Date.now();
  type StaleEntry = { id: string; ageHours: number; action: string; initiatedBy: string; subjectName?: string; caseId?: string };
  const stale: StaleEntry[] = [];
  const expired: Array<{ id: string; ageHours: number }> = [];
  const blocked: StaleEntry[] = [];

  for (const key of keys) {
    try {
      const raw = await store.get(key, { type: "json" }) as FourEyesItem | null;
      if (!raw || raw.status !== "pending" || !raw.initiatedAt) continue;
      const age = ageHours(raw.initiatedAt, now);
      const id = raw.id ?? key.replace(PREFIX, "");
      const entry: StaleEntry = {
        id,
        ageHours: Math.round(age),
        action: raw.action,
        initiatedBy: raw.initiatedBy,
        subjectName: raw.subjectName,
        caseId: raw.caseId,
      };

      if (age >= BLOCK_AFTER_HOURS && !raw.filingBlocked) {
        // Mark item as filing-blocked in blob store so SAR/STR routes can check.
        const updated: FourEyesItem = { ...raw, filingBlocked: true, filingBlockedAt: new Date().toISOString() };
        await store.setJSON(key, updated).catch((err: unknown) =>
          console.warn("[four-eyes-stale-alert] block-flag write failed:", err instanceof Error ? err.message : String(err)),
        );
        blocked.push(entry);
      }

      if (age >= EXPIRE_AFTER_HOURS) {
        expired.push({ id, ageHours: Math.round(age) });
      } else if (age >= ALERT_AFTER_HOURS) {
        stale.push(entry);
      }
    } catch (err) {
      console.warn(`[four-eyes-stale-alert] unreadable blob at ${key} — skipping:`, err instanceof Error ? err.message : String(err));
    }
  }

  const hasAlerts = stale.length > 0 || expired.length > 0 || blocked.length > 0;

  // Create Asana tasks for newly blocked items (P1) and stale items (P2).
  const asanaTasks: string[] = [];
  for (const item of blocked) {
    const title = `[P1 FILING BLOCKED] Four-eyes overdue ${item.ageHours}h — ${item.subjectName ?? item.id} — ${item.action}`;
    const notes = [
      `FOUR-EYES OVERDUE FILING BLOCK`,
      ``,
      `Item ID     : ${item.id}`,
      `Subject     : ${item.subjectName ?? "unknown"}`,
      `Case ID     : ${item.caseId ?? "n/a"}`,
      `Action      : ${item.action}`,
      `Initiated by: ${item.initiatedBy}`,
      `Age         : ${item.ageHours} hours`,
      ``,
      `STR/SAR/EDD filings for this subject are BLOCKED until this item is resolved.`,
      `Legal basis : UAE FDL 10/2025 Art.16 · FATF R.26 — dual-control approval required.`,
    ].join("\n");
    const url = await createAsanaTask(title, notes, "P1");
    if (url) asanaTasks.push(url);
    await writeAuditEntry(base, cronToken, "four_eyes.filing_blocked", {
      itemId: item.id,
      subjectName: item.subjectName,
      caseId: item.caseId,
      ageHours: item.ageHours,
      asanaTaskUrl: url ?? undefined,
    });
  }

  if (stale.length > 0) {
    const title = `[FOUR-EYES ALERT] ${stale.length} stale approval(s) — action required · ${new Date().toISOString().slice(0, 10)}`;
    const lines = [
      `FOUR-EYES STALE PENDING ALERT`,
      ``,
      `${stale.length} item(s) pending ≥ ${ALERT_AFTER_HOURS}h without a second approver.`,
      ``,
      ...stale.slice(0, 10).map((s) =>
        `• ${s.id} | ${s.subjectName ?? "?"} | ${s.action} | ${s.ageHours}h old | by ${s.initiatedBy}`,
      ),
      ``,
      `Legal basis: UAE FDL 10/2025 Art.16 · FATF R.26`,
    ];
    const url = await createAsanaTask(title, lines.join("\n"), "P2");
    if (url) asanaTasks.push(url);
    await writeAuditEntry(base, cronToken, "four_eyes.stale_alert_fired", {
      staleCount: stale.length,
      expiredCount: expired.length,
      alertAfterHours: ALERT_AFTER_HOURS,
      asanaTaskUrl: url ?? undefined,
    });
  }

  if (hasAlerts && webhookUrl) {
    await emitWebhook(webhookUrl, {
      event: "four_eyes.stale_pending_alert",
      at: new Date().toISOString(),
      staleCount: stale.length,
      expiredCount: expired.length,
      blockedCount: blocked.length,
      alertAfterHours: ALERT_AFTER_HOURS,
      expireAfterHours: EXPIRE_AFTER_HOURS,
      blockAfterHours: BLOCK_AFTER_HOURS,
      staleItems: stale.slice(0, 20),
      expiredItems: expired.slice(0, 20),
      blockedItems: blocked.slice(0, 20),
      asanaTasks,
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
    blockedCount: blocked.length,
    alertFired: hasAlerts,
    asanaTasksCreated: asanaTasks.length,
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
