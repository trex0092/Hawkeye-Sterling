// I-04 + I-14 — SLA state classifier for compliance cases.
//
// I-04 requires SLA timers that fire breach alerts when a high-severity
// case passes its deadline. I-14 requires a proactive 48-hour-pre-deadline
// alert so the MLRO never finds out about a breach AFTER it happens.
// hs-case-store already computes `slaDeadline` per case (categorize.ts);
// this module is the pure state classifier that turns a case list +
// "now" into actionable {breached, approaching} buckets.
//
// Channel-agnostic: the scheduler that owns webhook / Gmail / Asana
// fan-out calls this and receives structured data. Easier to test, and
// the same classifier serves the in-app dashboard widget that flags
// cases needing immediate attention.

export type CaseSlaCategory = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CaseSlaStatus = "open" | "in_progress" | "escalated" | "closed";

export interface SlaCaseShape {
  caseId: string;
  subjectName: string;
  riskCategory: CaseSlaCategory;
  status: CaseSlaStatus;
  slaDeadline: string;
  breachLogged?: boolean;
}

export interface SlaBreached<C extends SlaCaseShape = SlaCaseShape> {
  case_: C;
  /** Hours the deadline has been passed at evaluation time. Always > 0. */
  hoursOverdue: number;
}

export interface SlaApproaching<C extends SlaCaseShape = SlaCaseShape> {
  case_: C;
  /** Hours remaining until deadline. Always in (0, approachWindowHours]. */
  hoursRemaining: number;
}

export interface SlaClassification<C extends SlaCaseShape = SlaCaseShape> {
  breached: SlaBreached<C>[];
  approaching: SlaApproaching<C>[];
  /** Cases skipped because status === "closed" or because the
   *  riskCategory falls outside the alert-eligible set. Surfaced for
   *  metrics — the caller usually ignores. */
  skipped: number;
}

export interface ClassifySlaOptions {
  /** Risk categories that trigger SLA alerts. The default mirrors
   *  hs-case-store's existing breach-write logic (CRITICAL + HIGH only),
   *  which keeps the alert volume tuned for the MLRO. */
  alertCategories?: ReadonlyArray<CaseSlaCategory>;
  /** Hours-before-deadline that count as "approaching". Default 48h
   *  per the I-14 spec. */
  approachWindowHours?: number;
  /** Filter out cases that already had breachLogged set. The scheduled
   *  function must not re-emit the same breach every tick — the case
   *  store flips breachLogged: true on first detection. Default true. */
  skipAlreadyBreached?: boolean;
}

const DEFAULT_OPTIONS: Required<ClassifySlaOptions> = {
  alertCategories: ["CRITICAL", "HIGH"] as const,
  approachWindowHours: 48,
  skipAlreadyBreached: true,
};

/** Pure classifier — no I/O. Takes a list of cases + a `now` clock and
 *  buckets them into {breached, approaching}. Closed cases and cases
 *  outside the alert categories are skipped. Malformed slaDeadline
 *  strings are treated as not-classifiable (skipped) — the function
 *  never throws. */
export function classifyCasesBySla<C extends SlaCaseShape>(
  cases: readonly C[],
  now: Date = new Date(),
  options: ClassifySlaOptions = {},
): SlaClassification<C> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nowMs = now.getTime();
  const approachMs = opts.approachWindowHours * 60 * 60 * 1000;
  const allowedCategories = new Set(opts.alertCategories);

  const breached: SlaBreached<C>[] = [];
  const approaching: SlaApproaching<C>[] = [];
  let skipped = 0;

  for (const c of cases) {
    if (c.status === "closed") { skipped++; continue; }
    if (!allowedCategories.has(c.riskCategory)) { skipped++; continue; }
    if (opts.skipAlreadyBreached && c.breachLogged) { skipped++; continue; }

    const deadlineMs = Date.parse(c.slaDeadline);
    if (!Number.isFinite(deadlineMs)) { skipped++; continue; }

    const deltaMs = deadlineMs - nowMs;
    if (deltaMs <= 0) {
      // Past deadline — breach.
      breached.push({
        case_: c,
        hoursOverdue: -deltaMs / (60 * 60 * 1000),
      });
    } else if (deltaMs <= approachMs) {
      // Inside the proactive window.
      approaching.push({
        case_: c,
        hoursRemaining: deltaMs / (60 * 60 * 1000),
      });
    } else {
      skipped++;
    }
  }

  // Sort so the worst offenders are first — the caller's alert template
  // can show the top-N straight from the head of each array.
  breached.sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  approaching.sort((a, b) => a.hoursRemaining - b.hoursRemaining);

  return { breached, approaching, skipped };
}

/** Format a classification result as a human-readable alert summary
 *  the scheduler can POST to a webhook or email body. Channel-agnostic. */
export interface SlaAlertSummary {
  text: string;
  totalBreached: number;
  totalApproaching: number;
  detectedAt: string;
}

export function formatSlaAlert<C extends SlaCaseShape>(
  classification: SlaClassification<C>,
  now: Date = new Date(),
  sampleSize = 10,
): SlaAlertSummary {
  const { breached, approaching } = classification;
  const lines: string[] = [
    "⚡ HAWKEYE STERLING — COMPLIANCE-CASE SLA ALERT",
    "",
    `Detected at      : ${now.toISOString()}`,
    `Breached (I-04)  : ${breached.length}`,
    `Approaching (I-14): ${approaching.length}`,
    "",
  ];

  if (breached.length > 0) {
    lines.push("BREACHED — IMMEDIATE ACTION REQUIRED");
    lines.push("Case SLAs have already lapsed. UAE Federal Decree-Law No. 10 of 2025 Art.21 STR timelines may be at risk.");
    lines.push("");
    for (const b of breached.slice(0, sampleSize)) {
      const oh = b.hoursOverdue;
      const days = (oh / 24).toFixed(1);
      lines.push(`  · ${b.case_.caseId}  ${b.case_.subjectName}  [${b.case_.riskCategory}]  ${days}d overdue`);
    }
    if (breached.length > sampleSize) lines.push(`  … and ${breached.length - sampleSize} more`);
    lines.push("");
  }

  if (approaching.length > 0) {
    lines.push("APPROACHING DEADLINE — PROACTIVE NOTICE");
    lines.push("Cases below cross their SLA inside the next 48 hours. Assign or escalate now.");
    lines.push("");
    for (const a of approaching.slice(0, sampleSize)) {
      const hr = a.hoursRemaining.toFixed(1);
      lines.push(`  · ${a.case_.caseId}  ${a.case_.subjectName}  [${a.case_.riskCategory}]  ${hr}h remaining`);
    }
    if (approaching.length > sampleSize) lines.push(`  … and ${approaching.length - sampleSize} more`);
    lines.push("");
  }

  return {
    text: lines.join("\n"),
    totalBreached: breached.length,
    totalApproaching: approaching.length,
    detectedAt: now.toISOString(),
  };
}
