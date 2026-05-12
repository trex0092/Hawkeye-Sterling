// POST /api/regulatory-deadline-engine
//
// UAE DPMS Regulatory Deadline Engine.
// Computes all upcoming AML/CFT regulatory filing and review deadlines
// for a gold/precious metals dealer based on their profile.
//
// Deadline categories:
//   - CTR filing (FDL Art.16): within 2 business days of qualifying cash transaction
//   - STR/SAR filing (FDL Art.15): within 35 days of suspicion
//   - CDD refresh (FDL Art.8): risk-based, annually for high-risk, 2-3y for others
//   - pKYC review cadence: based on risk band
//   - Annual EWRA (FDL Art.7): risk assessment update
//   - goAML registration renewal: per UAEFIU directive
//   - DPMS registration renewal (MoE): annual
//   - AML training refresh (FDL Art.22): annually
//   - Record retention checkpoint (FDL Art.19): 10-year obligation
//   - Board AML report (FDL Art.23): annually
//   - Beneficial owner verification (FDL Art.8): at onboarding + triggers

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface EntityProfile {
  entityType?: "individual" | "corporate" | "dpms";
  licenseType?: "gold_trader" | "jeweller" | "refinery" | "broker" | "auction_house";
  riskClassification?: "low" | "medium" | "high" | "critical";
  jurisdiction?: string;           // default "AE"
  lastCddRefreshDate?: string;     // ISO date
  lastEwraDate?: string;
  lastBoardReportDate?: string;
  lastTrainingDate?: string;
  lastGoAmlRenewalDate?: string;
  lastDpmsRenewalDate?: string;
  pendingCtrs?: number;            // number of CTRs awaiting filing
  pendingStrs?: number;            // number of STRs awaiting filing
  openCases?: number;
  referenceDate?: string;          // defaults to today
}

interface Deadline {
  id: string;
  title: string;
  category: "ctr" | "str" | "cdd" | "pkyc" | "ewra" | "goaml" | "dpms_reg" | "training" | "records" | "board" | "ubo";
  dueDate: string;                 // ISO date
  daysRemaining: number;
  priority: "urgent" | "soon" | "scheduled" | "planned";
  status: "overdue" | "due_today" | "upcoming" | "planned";
  regulatoryBasis: string;
  penaltyExposure?: string;
  action: string;
}

const DAY_MS = 86_400_000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function daysUntil(dueDate: Date, ref: Date): number {
  return Math.round((dueDate.getTime() - ref.getTime()) / DAY_MS);
}

function priorityFor(days: number): Deadline["priority"] {
  if (days < 0) return "urgent";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  if (days <= 90) return "scheduled";
  return "planned";
}

function statusFor(days: number): Deadline["status"] {
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= 90) return "upcoming";
  return "planned";
}

function cddRefreshDays(risk: string): number {
  switch (risk) {
    case "critical": return 90;    // quarterly
    case "high": return 365;       // annual
    case "medium": return 730;     // 2-year
    default: return 1095;          // 3-year (low)
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: EntityProfile;
  try { body = await req.json() as EntityProfile; } catch {
    body = {};
  }

  const ref = body.referenceDate ? new Date(body.referenceDate) : new Date();
  const risk = body.riskClassification ?? "medium";
  const deadlines: Deadline[] = [];

  // ── CTR filing ────────────────────────────────────────────────────────────
  if ((body.pendingCtrs ?? 0) > 0) {
    const due = addDays(ref, 2);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "ctr-pending",
      title: `${body.pendingCtrs} Cash Transaction Report(s) pending filing`,
      category: "ctr",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.16; CBUAE CTR Circular",
      penaltyExposure: "AED 100,000–1,000,000 per unreported transaction",
      action: "Submit goAML CTR XML via UAE FIU portal within 2 business days of the cash transaction date",
    });
  }

  // ── STR/SAR filing ────────────────────────────────────────────────────────
  if ((body.pendingStrs ?? 0) > 0) {
    const due = addDays(ref, 35);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "str-pending",
      title: `${body.pendingStrs} Suspicious Transaction Report(s) pending filing`,
      category: "str",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.15; goAML STR Guide",
      penaltyExposure: "Criminal liability; AED 200,000–1,000,000",
      action: "File STR via goAML portal; do not tip off customer; document suspicion basis",
    });
  }

  // ── CDD refresh ───────────────────────────────────────────────────────────
  if (body.lastCddRefreshDate) {
    const last = new Date(body.lastCddRefreshDate);
    const intervalDays = cddRefreshDays(risk);
    const due = addDays(last, intervalDays);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "cdd-refresh",
      title: `CDD Refresh — ${risk.toUpperCase()} risk (every ${intervalDays} days)`,
      category: "cdd",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.8; CBUAE AML Standards §4",
      penaltyExposure: "AED 100,000–500,000 for inadequate CDD",
      action: "Complete CDD refresh: verify documents, re-run sanctions screening, update risk score",
    });
  }

  // ── Annual EWRA ───────────────────────────────────────────────────────────
  if (body.lastEwraDate) {
    const last = new Date(body.lastEwraDate);
    const due = addDays(last, 365);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "ewra-annual",
      title: "Enterprise-Wide Risk Assessment (EWRA) Annual Update",
      category: "ewra",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.7; CBUAE AML Standards §2",
      penaltyExposure: "AED 300,000–1,000,000 for absence of risk assessment",
      action: "Update EWRA: reassess product/customer/geographic/channel risks; board approval required",
    });
  } else {
    deadlines.push({
      id: "ewra-initial",
      title: "Enterprise-Wide Risk Assessment (EWRA) — Initial Assessment Required",
      category: "ewra",
      dueDate: isoDate(addDays(ref, 30)),
      daysRemaining: 30,
      priority: "urgent",
      status: "upcoming",
      regulatoryBasis: "FDL 10/2025 Art.7; CBUAE AML Standards §2",
      penaltyExposure: "AED 300,000–1,000,000",
      action: "Complete initial EWRA and submit to board for approval",
    });
  }

  // ── AML Training ──────────────────────────────────────────────────────────
  if (body.lastTrainingDate) {
    const last = new Date(body.lastTrainingDate);
    const due = addDays(last, 365);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "training-annual",
      title: "AML/CFT Staff Training Annual Refresh",
      category: "training",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.22; CBUAE AML Standards §14",
      penaltyExposure: "AED 100,000–500,000 for untrained staff",
      action: "Complete annual AML/CFT training for all relevant staff; record attendance and assessment scores",
    });
  }

  // ── Board AML Report ──────────────────────────────────────────────────────
  if (body.lastBoardReportDate) {
    const last = new Date(body.lastBoardReportDate);
    const due = addDays(last, 365);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "board-report",
      title: "Board AML/CFT Annual Compliance Report",
      category: "board",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.23; CBUAE AML Standards §3",
      penaltyExposure: "AED 200,000–1,000,000",
      action: "Prepare annual AML/CFT report for board: STR/CTR statistics, training completion, audit findings, remediation",
    });
  }

  // ── DPMS Registration Renewal ─────────────────────────────────────────────
  if (body.lastDpmsRenewalDate) {
    const last = new Date(body.lastDpmsRenewalDate);
    const due = addDays(last, 365);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "dpms-renewal",
      title: "DPMS Trade Licence Renewal (Ministry of Economy)",
      category: "dpms_reg",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "FDL 10/2025 Art.4; CR 134/2025 Art.14",
      penaltyExposure: "Business closure; AED 50,000–500,000",
      action: "Renew DPMS registration via MoE portal; update AML Policy and Procedure documents",
    });
  }

  // ── goAML Registration Renewal ────────────────────────────────────────────
  if (body.lastGoAmlRenewalDate) {
    const last = new Date(body.lastGoAmlRenewalDate);
    const due = addDays(last, 365);
    const days = daysUntil(due, ref);
    deadlines.push({
      id: "goaml-renewal",
      title: "goAML Registration Renewal (UAE FIU)",
      category: "goaml",
      dueDate: isoDate(due),
      daysRemaining: days,
      priority: priorityFor(days),
      status: statusFor(days),
      regulatoryBasis: "UAEFIU Directive on goAML Registration",
      penaltyExposure: "Loss of goAML access; inability to file CTR/STR",
      action: "Renew goAML registration at goaml.uaefiu.gov.ae; update reporting officer details",
    });
  }

  // ── Record Retention Checkpoints ──────────────────────────────────────────
  deadlines.push({
    id: "records-10yr",
    title: "10-Year Record Retention Compliance Checkpoint",
    category: "records",
    dueDate: isoDate(addDays(ref, 180)),
    daysRemaining: 180,
    priority: "scheduled",
    status: "upcoming",
    regulatoryBasis: "FDL 10/2025 Art.19; FATF R.11",
    penaltyExposure: "AED 200,000–1,000,000",
    action: "Audit document archive: ensure all CDD, transaction records, screening evidence retained ≥10 years from relationship end",
  });

  // ── pKYC Review ───────────────────────────────────────────────────────────
  const pkcyDays = risk === "high" || risk === "critical" ? 90 : risk === "medium" ? 180 : 365;
  deadlines.push({
    id: "pkyc-review",
    title: `Perpetual KYC Review — ${risk.toUpperCase()} risk (${pkcyDays}-day cadence)`,
    category: "pkyc",
    dueDate: isoDate(addDays(ref, pkcyDays)),
    daysRemaining: pkcyDays,
    priority: priorityFor(pkcyDays),
    status: statusFor(pkcyDays),
    regulatoryBasis: "FDL 10/2025 Art.14; CBUAE AML Standards §7.2 (ongoing monitoring)",
    action: `Run pKYC sweep for all ${risk}-risk customers; escalate material changes to MLRO`,
  });

  // Sort by days remaining (overdue first, then soonest)
  deadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const overdue = deadlines.filter((d) => d.status === "overdue").length;
  const urgent = deadlines.filter((d) => d.priority === "urgent").length;
  const soon = deadlines.filter((d) => d.priority === "soon").length;

  return NextResponse.json({
    ok: true,
    entityProfile: {
      riskClassification: risk,
      jurisdiction: body.jurisdiction ?? "AE",
      licenseType: body.licenseType ?? "gold_trader",
    },
    summary: {
      totalDeadlines: deadlines.length,
      overdue,
      urgent,
      soon,
      scheduled: deadlines.filter((d) => d.priority === "scheduled").length,
      planned: deadlines.filter((d) => d.priority === "planned").length,
    },
    deadlines,
    regulatoryFramework: "FDL 10/2025; CR 134/2025; CBUAE AML Standards; UAEFIU goAML Directives",
    generatedAt: new Date().toISOString(),
    referenceDate: isoDate(ref),
  }, { headers: gate.headers });
}
