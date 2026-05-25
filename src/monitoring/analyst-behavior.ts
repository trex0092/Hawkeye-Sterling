// Hawkeye Sterling — UEBA: Analyst Behavior Analytics
//
// Monitors analyst/operator activity patterns and surfaces insider-threat
// signals. Complements the entity-facing AML engine with user-facing
// behavioral detection.
//
// Threat model: a compliance analyst who:
//   - Bulk-exports sensitive records for exfiltration
//   - Queries far outside their normal subject types (scope creep)
//   - Overrides risk verdicts at an elevated rate (verdict manipulation)
//   - Accesses the system at unusual hours (hijacked session / after-hours data access)
//   - Consistently clears cases immediately after creation (systematic whitewashing)
//
// Architecture:
//   recordAnalystEvent()   — write a single activity event (fire-and-forget)
//   computeAnalystProfile() — aggregate events into a behavioral profile
//   detectAnomalies()      — rule engine that fires UEBAAlerts from profiles

export type AnalystEventKind =
  | "screen"           // Subject screened
  | "case_open"        // Case file opened
  | "case_dispose"     // Case cleared / escalated / blocked
  | "export"           // Data exported (CSV, PDF, JSON)
  | "override"         // Risk verdict overridden
  | "bulk_screen"      // Batch screening request
  | "audit_read"       // Audit trail read
  | "admin_action"     // Admin operation (user management, config)
  | "login"            // Session started
  | "report_generate"; // SCR / SAR report generated

export interface AnalystEvent {
  id: string;
  at: string;          // ISO-8601
  actor: string;       // opaque operator ID or API key ID
  kind: AnalystEventKind;
  meta?: {
    subjectCount?: number;  // records in bulk op
    exportFormat?: string;  // "csv" | "pdf" | "json"
    riskLevel?: string;     // risk level of the case acted on
    hourOfDay?: number;     // 0–23 (UTC)
    dayOfWeek?: number;     // 0=Sun … 6=Sat
    fromVerdict?: string;   // before override
    toVerdict?: string;     // after override
  };
}

export interface AnalystProfile {
  actor: string;
  windowStart: string;         // ISO start of the analysis window
  windowEnd: string;
  totalEvents: number;
  byKind: Partial<Record<AnalystEventKind, number>>;
  exportRecordCount: number;   // total records exported in window
  overrideCount: number;
  overrideClearRate: number;   // % of overrides that cleared a case
  offHoursEventCount: number;  // events outside 07:00–20:00 UTC
  offHoursRate: number;        // offHoursEventCount / totalEvents
  peakHour: number;            // hour with most events (0–23)
  adminActionOffHoursCount: number;  // admin_action events outside 07:00–20:00 UTC
  bulkScreenCount: number;
  averageBulkSize: number;
}

export type UEBASeverity = "low" | "medium" | "high" | "critical";

export interface UEBAAlert {
  id: string;
  at: string;
  actor: string;
  ruleId: string;
  severity: UEBASeverity;
  title: string;
  detail: string;
  evidence: string[];
}

// ── Event construction ────────────────────────────────────────────────────────

export function makeAnalystEvent(
  actor: string,
  kind: AnalystEventKind,
  meta?: AnalystEvent["meta"],
): AnalystEvent {
  const now = new Date();
  return {
    id: `ueba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: now.toISOString(),
    actor,
    kind,
    meta: {
      ...meta,
      hourOfDay: meta?.hourOfDay ?? now.getUTCHours(),
      dayOfWeek: meta?.dayOfWeek ?? now.getUTCDay(),
    },
  };
}

// ── Profile computation ───────────────────────────────────────────────────────

export function computeAnalystProfile(
  actor: string,
  events: AnalystEvent[],
  windowStart: string,
  windowEnd: string,
): AnalystProfile {
  const actorEvents = events.filter((e) => e.actor === actor);

  const byKind: Partial<Record<AnalystEventKind, number>> = {};
  for (const e of actorEvents) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  }

  const exports = actorEvents.filter((e) => e.kind === "export");
  const exportRecordCount = exports.reduce((sum, e) => sum + (e.meta?.subjectCount ?? 1), 0);

  const overrides = actorEvents.filter((e) => e.kind === "override");
  const overrideClearCount = overrides.filter((e) => e.meta?.toVerdict === "clear" || e.meta?.toVerdict === "cleared").length;

  const offHoursEvents = actorEvents.filter((e) => {
    const h = e.meta?.hourOfDay ?? new Date(e.at).getUTCHours();
    return h < 7 || h >= 20;
  });

  const hourCounts: Record<number, number> = {};
  for (const e of actorEvents) {
    const h = e.meta?.hourOfDay ?? new Date(e.at).getUTCHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

  const bulkScreens = actorEvents.filter((e) => e.kind === "bulk_screen");
  const totalBulkSize = bulkScreens.reduce((sum, e) => sum + (e.meta?.subjectCount ?? 0), 0);

  const adminActionOffHoursCount = actorEvents.filter((e) => {
    if (e.kind !== "admin_action") return false;
    const h = e.meta?.hourOfDay ?? new Date(e.at).getUTCHours();
    return h < 7 || h >= 20;
  }).length;

  return {
    actor,
    windowStart,
    windowEnd,
    totalEvents: actorEvents.length,
    byKind,
    exportRecordCount,
    overrideCount: overrides.length,
    overrideClearRate: overrides.length > 0 ? (overrideClearCount / overrides.length) * 100 : 0,
    offHoursEventCount: offHoursEvents.length,
    offHoursRate: actorEvents.length > 0 ? (offHoursEvents.length / actorEvents.length) * 100 : 0,
    peakHour: peakHour ? Number(peakHour[0]) : 9,
    adminActionOffHoursCount,
    bulkScreenCount: bulkScreens.length,
    averageBulkSize: bulkScreens.length > 0 ? totalBulkSize / bulkScreens.length : 0,
  };
}

// ── Anomaly detection rules ───────────────────────────────────────────────────

interface Rule {
  id: string;
  severity: UEBASeverity;
  title: string;
  test: (profile: AnalystProfile) => { fired: boolean; detail: string; evidence: string[] };
}

const RULES: Rule[] = [
  {
    id: "UEBA-001",
    severity: "high",
    title: "Bulk data export spike",
    test: (p) => {
      const fired = p.exportRecordCount > 200;
      return {
        fired,
        detail: `Analyst exported ${p.exportRecordCount} records in the analysis window (threshold: 200).`,
        evidence: [`export_record_count=${p.exportRecordCount}`, `export_events=${p.byKind.export ?? 0}`],
      };
    },
  },
  {
    id: "UEBA-002",
    severity: "critical",
    title: "Sustained off-hours access",
    test: (p) => {
      const fired = p.offHoursRate > 50 && p.totalEvents >= 10;
      return {
        fired,
        detail: `${p.offHoursRate.toFixed(0)}% of ${p.totalEvents} events occurred outside 07:00–20:00 UTC.`,
        evidence: [`off_hours_events=${p.offHoursEventCount}`, `off_hours_rate=${p.offHoursRate.toFixed(1)}%`],
      };
    },
  },
  {
    id: "UEBA-003",
    severity: "high",
    title: "Elevated verdict override rate",
    test: (p) => {
      const fired = p.overrideCount >= 5 && p.overrideClearRate > 80;
      return {
        fired,
        detail: `${p.overrideCount} verdict overrides in window; ${p.overrideClearRate.toFixed(0)}% cleared the case (potential whitewashing).`,
        evidence: [`override_count=${p.overrideCount}`, `clear_rate=${p.overrideClearRate.toFixed(1)}%`],
      };
    },
  },
  {
    id: "UEBA-004",
    severity: "medium",
    title: "Abnormal bulk screening volume",
    test: (p) => {
      const fired = p.averageBulkSize > 500;
      return {
        fired,
        detail: `Average bulk screening batch size is ${p.averageBulkSize.toFixed(0)} records (threshold: 500).`,
        evidence: [`bulk_screen_count=${p.bulkScreenCount}`, `avg_batch_size=${p.averageBulkSize.toFixed(0)}`],
      };
    },
  },
  {
    id: "UEBA-005",
    severity: "medium",
    title: "Repeated audit trail reads",
    test: (p) => {
      const auditReads = p.byKind.audit_read ?? 0;
      const fired = auditReads > 20;
      return {
        fired,
        detail: `Analyst accessed the audit trail ${auditReads} times — possible evidence tampering reconnaissance.`,
        evidence: [`audit_read_count=${auditReads}`],
      };
    },
  },
  {
    id: "UEBA-006",
    severity: "low",
    title: "Admin action outside business hours",
    test: (p) => {
      const fired = p.adminActionOffHoursCount > 0;
      return {
        fired,
        detail: `${p.adminActionOffHoursCount} admin action(s) performed outside 07:00–20:00 UTC.`,
        evidence: [`admin_action_off_hours=${p.adminActionOffHoursCount}`, `admin_action_total=${p.byKind.admin_action ?? 0}`],
      };
    },
  },
  {
    id: "UEBA-007",
    severity: "high",
    title: "Mass record export",
    test: (p) => {
      const fired = p.exportRecordCount > 500;
      return {
        fired,
        detail: `${p.exportRecordCount} records exported in window — potential bulk data exfiltration.`,
        evidence: [`export_record_count=${p.exportRecordCount}`, `export_ops=${p.byKind.export ?? 0}`],
      };
    },
  },
  {
    id: "UEBA-008",
    severity: "medium",
    title: "Repeated bulk screening sessions",
    test: (p) => {
      const fired = p.bulkScreenCount > 10;
      return {
        fired,
        detail: `${p.bulkScreenCount} bulk screening sessions in window (avg ${p.averageBulkSize.toFixed(0)} subjects/batch) — unusually high for a single analyst.`,
        evidence: [`bulk_screen_count=${p.bulkScreenCount}`, `avg_bulk_size=${p.averageBulkSize.toFixed(1)}`],
      };
    },
  },
  {
    id: "UEBA-009",
    severity: "high",
    title: "Systematic verdict clearing",
    test: (p) => {
      const fired = p.overrideCount >= 5 && p.overrideClearRate > 80;
      return {
        fired,
        detail: `${p.overrideCount} verdict overrides with ${p.overrideClearRate.toFixed(0)}% clearing rate — pattern consistent with systematic whitewashing.`,
        evidence: [`override_count=${p.overrideCount}`, `override_clear_rate=${p.overrideClearRate.toFixed(1)}%`],
      };
    },
  },
  {
    id: "UEBA-010",
    severity: "medium",
    title: "Off-hours report generation",
    test: (p) => {
      const reportCount = p.byKind.report_generate ?? 0;
      const offHoursReports = Math.round(reportCount * (p.offHoursRate / 100));
      const fired = reportCount > 0 && p.offHoursRate > 50 && reportCount >= 3;
      return {
        fired,
        detail: `${reportCount} report(s) generated with ${p.offHoursRate.toFixed(0)}% off-hours activity — regulatory filings generated outside business hours warrant review.`,
        evidence: [`report_count=${reportCount}`, `off_hours_rate=${p.offHoursRate.toFixed(1)}%`, `est_off_hours_reports=${offHoursReports}`],
      };
    },
  },
];

export function detectAnomalies(profile: AnalystProfile): UEBAAlert[] {
  const alerts: UEBAAlert[] = [];
  for (const rule of RULES) {
    const result = rule.test(profile);
    if (result.fired) {
      alerts.push({
        id: `${rule.id}_${profile.actor}_${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        actor: profile.actor,
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        detail: result.detail,
        evidence: result.evidence,
      });
    }
  }
  return alerts;
}

// ── Convenience: analyse a raw event list ─────────────────────────────────────

export interface UEBAReport {
  windowStart: string;
  windowEnd: string;
  actors: string[];
  profiles: AnalystProfile[];
  alerts: UEBAAlert[];
  alertsByActor: Record<string, UEBAAlert[]>;
}

export function buildUEBAReport(events: AnalystEvent[], windowDays = 30): UEBAReport {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const windowEnd = now.toISOString();

  const windowEvents = events.filter((e) => e.at >= windowStart);
  const actors = [...new Set(windowEvents.map((e) => e.actor))];

  const profiles = actors.map((actor) =>
    computeAnalystProfile(actor, windowEvents, windowStart, windowEnd),
  );

  const allAlerts = profiles.flatMap(detectAnomalies);

  const alertsByActor: Record<string, UEBAAlert[]> = {};
  for (const alert of allAlerts) {
    if (!alertsByActor[alert.actor]) alertsByActor[alert.actor] = [];
    alertsByActor[alert.actor]!.push(alert);
  }

  return { windowStart, windowEnd, actors, profiles, alerts: allAlerts, alertsByActor };
}
