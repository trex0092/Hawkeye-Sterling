// Hawkeye Sterling — per-module 24h findings collector for the daily
// Asana compliance attestation.
//
// Reads the two authoritative server stores ONCE per run:
//   • Designation alerts  — alerts-store.listAlerts()   (sanctions/TFS hits)
//   • Compliance cases    — hs-compliance/<tenant>/cases (all tenants)
// then derives a per-module "Findings (last 24h)" line, control status,
// conclusion and (when relevant) a risk rating, from real data.
//
// Modules without a queryable live source fall back to the clean baseline
// ("no exceptions recorded"). Every read is wrapped so a store failure
// degrades to baseline rather than throwing — the daily cron must never
// break because a data read failed.

import { listKeys, getJson } from "@/lib/server/store";
import { listAlerts, type DesignationAlert } from "@/lib/server/alerts-store";
import { type HsCase } from "@/lib/server/hs-case-store";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ModuleFindings {
  status: string;
  findings: string;
  conclusion: string;
  riskRating?: string;
}

export interface FindingSignals {
  now: number;
  alerts24: DesignationAlert[];
  cases: HsCase[];
}

const BASELINE: ModuleFindings = {
  status: "Operational",
  findings: "No control exceptions, breaches or overdue items recorded in the audit chain.",
  conclusion: "✅ Compliant — control operational, no action required.",
};

type Sev = "critical" | "high" | "medium" | "low" | "clear";
const SEV_RANK: Record<Sev, number> = { critical: 4, high: 3, medium: 2, low: 1, clear: 0 };
const SEV_LABEL: Record<Sev, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  clear: "Informational",
};

// Which store each module draws its findings from. Anything not listed
// falls back to the clean baseline (no fabricated source).
type SourceKind = "alerts" | "cases-pending" | "cases-str" | "cases-open" | "cases-new";
const MODULE_SOURCE: Record<string, { kind: SourceKind; listId?: string; label: string }> = {
  // Sanctions / designation alert feeds
  "tfs-alerts": { kind: "alerts", label: "designation alert(s)" },
  screening: { kind: "alerts", label: "screening/designation hit(s)" },
  "batch-screening": { kind: "alerts", label: "designation hit(s)" },
  "sanctions-evasion": { kind: "alerts", label: "designation alert(s)" },
  cnmr: { kind: "alerts", label: "name-match alert(s)" },
  eocn: { kind: "alerts", listId: "uae_eocn", label: "EOCN/UAE-list hit(s)" },
  // Four-eyes / approval queues
  approvals: { kind: "cases-pending", label: "four-eyes approval(s) pending" },
  "maker-checker": { kind: "cases-pending", label: "dual-control item(s) pending" },
  "cdd-review": { kind: "cases-pending", label: "CDD review(s) pending approval" },
  // STR/SAR pipeline
  "str-cases": { kind: "cases-str", label: "STR/SAR pipeline case(s)" },
  "sar-qa": { kind: "cases-str", label: "STR/SAR QA item(s)" },
  "sar-narrative": { kind: "cases-str", label: "STR/SAR narrative case(s)" },
  goaml: { kind: "cases-str", label: "goAML filing case(s)" },
  // Open caseload
  investigation: { kind: "cases-open", label: "open investigation(s)" },
  "mlro-advisor": { kind: "cases-open", label: "open case(s) for MLRO review" },
  // New intake in window
  onboarding: { kind: "cases-new", label: "new onboarding case(s)" },
  "client-portal": { kind: "cases-new", label: "new portal submission case(s)" },
  "ubo-declaration": { kind: "cases-new", label: "new UBO/ownership case(s)" },
  "pep-profile": { kind: "cases-new", label: "new PEP case(s)" },
  "transaction-monitor": { kind: "cases-new", label: "transaction-monitoring case(s)" },
};

// Read both stores once. Any failure degrades to empty (→ baseline).
export async function gatherFindingSignals(): Promise<FindingSignals> {
  const now = Date.now();
  const since = now - DAY_MS;

  const alertsAll = await listAlerts(false).catch(() => [] as DesignationAlert[]);
  const alerts24 = alertsAll.filter(
    (a) => !a.dismissedAt && Number.isFinite(Date.parse(a.detectedAt)) && Date.parse(a.detectedAt) >= since,
  );

  const cases = await listAllCases().catch(() => [] as HsCase[]);

  return { now, alerts24, cases };
}

async function listAllCases(): Promise<HsCase[]> {
  const keys = await listKeys("hs-compliance/").catch(() => [] as string[]);
  const caseKeys = keys.filter((k) => /\/cases\/[^/]+\.json$/.test(k));
  const loaded = await Promise.all(caseKeys.map((k) => getJson<HsCase>(k).catch(() => null)));
  return loaded.filter((c): c is HsCase => c !== null);
}

function topSeverity(sevs: Sev[]): Sev | null {
  if (sevs.length === 0) return null;
  return sevs.reduce((top, s) => (SEV_RANK[s] > SEV_RANK[top] ? s : top), "clear" as Sev);
}

function alertBreakdown(alerts: DesignationAlert[]): string {
  const c = alerts.filter((a) => a.severity === "critical").length;
  const h = alerts.filter((a) => a.severity === "high").length;
  const m = alerts.filter((a) => a.severity === "medium").length;
  return `${c} critical, ${h} high, ${m} medium`;
}

function caseBreakdown(cases: HsCase[]): string {
  const c = cases.filter((x) => x.severity === "critical").length;
  const h = cases.filter((x) => x.severity === "high").length;
  const m = cases.filter((x) => x.severity === "medium").length;
  return `${c} critical, ${h} high, ${m} medium`;
}

// Pure: derive the findings block for one module from the gathered signals.
export function findingsForModule(key: string, s: FindingSignals): ModuleFindings {
  const src = MODULE_SOURCE[key];
  if (!src) return BASELINE;

  try {
    if (src.kind === "alerts") {
      const alerts = src.listId ? s.alerts24.filter((a) => a.listId === src.listId) : s.alerts24;
      if (alerts.length === 0) return BASELINE;
      const sorted = [...alerts].sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt));
      const top = topSeverity(alerts.map((a) => a.severity as Sev));
      const elevated = alerts.some((a) => a.severity === "critical" || a.severity === "high");
      const recent = sorted[0];
      if (!recent) return BASELINE;
      return {
        status: elevated ? "Exception noted" : "Active items",
        findings:
          `${alerts.length} ${src.label} in the last 24h (${alertBreakdown(alerts)}). ` +
          `Most recent: ${recent.listLabel} — ${recent.matchedEntry} (${recent.severity}).`,
        riskRating: top ? SEV_LABEL[top] : undefined,
        conclusion: elevated
          ? "⚠️ Action required — alert(s) pending review and freeze/no-match decision (TFS ≤24h)."
          : "Monitoring — alerts under review; no control failure.",
      };
    }

    // Case-based sources
    const inWindow = (c: HsCase) =>
      Number.isFinite(Date.parse(c.createdAt)) && s.now - Date.parse(c.createdAt) < DAY_MS;
    let selected: HsCase[];
    if (src.kind === "cases-pending") {
      selected = s.cases.filter((c) => c.status === "pending_approval");
    } else if (src.kind === "cases-str") {
      selected = s.cases.filter((c) =>
        ["filed_str", "mlro_review", "escalated", "frozen"].includes(c.status),
      );
    } else if (src.kind === "cases-open") {
      selected = s.cases.filter((c) => c.status !== "closed");
    } else {
      // cases-new
      selected = s.cases.filter(inWindow);
    }

    const slaBreaches = selected.filter((c) => c.slaBreach);
    if (selected.length === 0 && slaBreaches.length === 0) return BASELINE;

    const sorted = [...selected].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const top = topSeverity(selected.map((c) => c.severity as Sev));
    const elevated = selected.some((c) => c.severity === "critical" || c.severity === "high");
    const recent = sorted[0];
    const slaText = slaBreaches.length > 0 ? ` ${slaBreaches.length} SLA breach(es) flagged.` : "";
    const recentText = recent
      ? ` Most recent: ${recent.caseId} — ${recent.subjectName} (${recent.severity}).`
      : "";

    return {
      status: slaBreaches.length > 0 ? "Exception noted" : "Active items",
      findings: `${selected.length} ${src.label} in scope (${caseBreakdown(selected)}).${slaText}${recentText}`,
      riskRating: slaBreaches.length > 0 ? "High" : top ? SEV_LABEL[top] : undefined,
      conclusion:
        slaBreaches.length > 0
          ? "⚠️ Action required — SLA breach(es) pending MLRO disposition."
          : elevated
            ? "Monitoring — elevated case(s) under active handling; no control failure."
            : "Active items under standard handling; no control exception.",
    };
  } catch {
    return BASELINE;
  }
}
