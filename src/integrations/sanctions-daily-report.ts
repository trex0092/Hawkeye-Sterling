// Shared logic for the 3 daily sanctions status Asana reports.
// Imported by netlify/functions/sanctions-daily-{0830,1300,1730}.mts.
// Compiled to dist/src/integrations/sanctions-daily-report.js by the
// root tsc build; included in function bundles via netlify.toml included_files.

const ASANA_TASK_ENDPOINT = "https://app.asana.com/api/1.0/tasks";
const DEFAULT_MASTER_INBOX = "1214148630166524";
const DEFAULT_WORKSPACE    = "1213645083721316";
const DEFAULT_ASSIGNEE     = "1213645083721304";

// AU DFAT and CA OSFI are excluded from reports — feeds not yet configured.
const REPORT_LIST_IDS = [
  "un_consolidated",
  "ofac_sdn",
  "ofac_cons",
  "eu_fsf",
  "uk_ofsi",
  "uae_eocn",
  "uae_ltl",
  "ch_seco",
  "fatf",
] as const;

interface SanctionsList {
  listId: string;
  displayName: string;
  status: "healthy" | "stale" | "missing" | "unconfigured";
  entityCount: number | null;
  ageHours: number | null;
}

interface SanctionsStatusResponse {
  ok: boolean;
  degraded?: boolean;
  lists?: SanctionsList[];
  summary?: { healthy: number; stale: number; missing: number; unconfigured: number };
  warnings?: string[];
}

function icon(l: SanctionsList): string {
  if (l.status === "missing" || l.status === "unconfigured") return "🔴";
  if ((l.entityCount ?? 0) === 0) return "🔴";
  if (l.status === "stale") return "⚠️ ";
  return "✅";
}

function fmtCount(n: number | null): string {
  if (n === null) return "     —";
  return n.toLocaleString("en-US").padStart(6);
}

function fmtAge(h: number | null): string {
  if (h === null) return "    —";
  return `${h.toFixed(1)}h`.padStart(5);
}

export interface ReportOptions {
  reportLabel: string;     // "08:30 GST"
  nextLabel: string;       // "13:00 GST"
  baseUrl: string;
}

export interface ReportResult {
  ok: boolean;
  asanaTaskGid?: string;
  taskName?: string;
  error?: string;
}

export async function runSanctionsReport(opts: ReportOptions): Promise<ReportResult> {
  const asanaToken = process.env["ASANA_TOKEN"];
  if (!asanaToken) {
    console.warn("[sanctions-daily-report] ASANA_TOKEN not set — skipping");
    return { ok: false, error: "ASANA_TOKEN not set" };
  }

  // Fetch live sanctions status.
  let status: SanctionsStatusResponse | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(`${opts.baseUrl}/api/sanctions/status`, {
        headers: process.env["SANCTIONS_CRON_TOKEN"]
          ? { authorization: `Bearer ${process.env["SANCTIONS_CRON_TOKEN"]}` }
          : {},
        signal: ctl.signal,
      });
      if (res.ok) status = await res.json() as SanctionsStatusResponse;
      else console.warn(`[sanctions-daily-report] status HTTP ${res.status}`);
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn("[sanctions-daily-report] status fetch failed:", err instanceof Error ? err.message : String(err));
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  // Filter to only the lists we report on.
  const allLists = status?.lists ?? [];
  const lists = allLists.filter((l) =>
    (REPORT_LIST_IDS as readonly string[]).includes(l.listId),
  );

  const healthyCount = lists.filter(
    (l) => l.status === "healthy" && (l.entityCount ?? 0) > 0,
  ).length;
  const total = lists.length || REPORT_LIST_IDS.length;

  const healthLabel =
    healthyCount === total
      ? `✅ ALL ${total} HEALTHY`
      : `⚠️ ${healthyCount}/${total} HEALTHY`;

  const taskName = `[SANCTIONS REPORT] ${opts.reportLabel} · ${dateStr} · ${healthLabel}`;

  const lines: string[] = [
    `HAWKEYE STERLING — DAILY SANCTIONS STATUS REPORT`,
    ``,
    `Report time  : ${opts.reportLabel} (${now.toISOString()})`,
    `Next report  : ${opts.nextLabel}`,
    ``,
  ];

  if (!status) {
    lines.push(`⚠️  STATUS UNAVAILABLE — could not reach /api/sanctions/status`);
    lines.push(`Check Netlify deployment health before next report.`);
  } else {
    const staleCount   = lists.filter((l) => l.status === "stale").length;
    const missingCount = lists.filter(
      (l) => l.status === "missing" || l.status === "unconfigured" || (l.entityCount ?? 0) === 0,
    ).length;
    const overallLabel = (staleCount + missingCount) > 0 ? "⚠️  DEGRADED" : "✅ HEALTHY";

    lines.push(`OVERALL STATUS: ${overallLabel}`);
    lines.push(`  Healthy    : ${healthyCount}`);
    lines.push(`  Stale      : ${staleCount}`);
    lines.push(`  Problem    : ${missingCount}`);
    lines.push(``);
    lines.push(`LIST DETAIL`);

    for (const l of lists) {
      const ic   = icon(l);
      const name = (l.displayName ?? l.listId).padEnd(24);
      const cnt  = fmtCount(l.entityCount);
      const age  = fmtAge(l.ageHours);
      lines.push(`  ${ic} ${name} | ${cnt} entities | ${age} old`);
    }

    if (lists.length === 0) {
      lines.push(`  (no list data available)`);
    }

    const degraded = lists.filter(
      (l) => l.status !== "healthy" || (l.entityCount ?? 0) === 0,
    );

    if (degraded.length > 0) {
      lines.push(``);
      lines.push(`DEGRADED LISTS — MLRO ACTION REQUIRED`);
      for (const l of degraded) {
        const reason =
          (l.entityCount ?? 0) === 0 && l.status === "healthy"
            ? "0 entities — silent clear risk"
            : l.status === "stale"
            ? `stale (${fmtAge(l.ageHours).trim()} old)`
            : l.status === "missing" || l.status === "unconfigured"
            ? "not loaded"
            : l.status;
        lines.push(`  • ${l.displayName ?? l.listId}: ${reason}`);
      }
      lines.push(``);
      lines.push(`Customers cleared against these lists should be re-screened`);
      lines.push(`once the affected lists are restored.`);
    }

    if (status.warnings && status.warnings.length > 0) {
      lines.push(``);
      lines.push(`SYSTEM WARNINGS`);
      for (const w of status.warnings) lines.push(`  • ${w}`);
    }
  }

  lines.push(``);
  lines.push(`Legal basis: FDL No. 10/2025 Art. 15 — screening on incomplete corpus is prohibited.`);
  lines.push(`Auto-generated by Hawkeye Sterling.`);

  // Post to Asana.
  const projectGid = process.env["ASANA_MLRO_PROJECT_GID"] ?? DEFAULT_MASTER_INBOX;
  try {
    const res = await fetch(ASANA_TASK_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${asanaToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name: taskName,
          notes: lines.join("\n"),
          projects: [projectGid],
          workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE,
          assignee: process.env["ASANA_ASSIGNEE_GID"]  ?? DEFAULT_ASSIGNEE,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await res.json().catch(() => null) as { data?: { gid?: string } } | null;
    if (res.ok && payload?.data?.gid) {
      console.info(`[sanctions-daily-report] Asana task created: ${payload.data.gid} — "${taskName}"`);
      return { ok: true, asanaTaskGid: payload.data.gid, taskName };
    }
    console.warn(`[sanctions-daily-report] Asana POST HTTP ${res.status}`);
    return { ok: false, taskName, error: `Asana HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[sanctions-daily-report] Asana POST failed:", msg);
    return { ok: false, taskName, error: msg };
  }
}
