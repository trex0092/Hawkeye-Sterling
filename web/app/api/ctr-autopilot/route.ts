// POST /api/ctr-autopilot
//
// Cash Transaction Report (CTR) Autopilot for UAE DPMS institutions.
//
// UAE reporting threshold: AED 55,000 (or equivalent) per transaction
// or aggregated within a calendar day by or for the same person.
//
// Pipeline:
//   1. Aggregate transactions by day / person to detect threshold crossings
//   2. Determine if CTR obligation is triggered
//   3. Generate goAML-compatible CTR XML
//   4. Produce completeness checklist
//   5. Return filing-ready package
//
// Regulatory basis: FDL 10/2025 Art.16; CBUAE AML Standards §10; goAML CTR Guide

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface CtrTransaction {
  date: string;            // ISO date YYYY-MM-DD
  amount: number;          // in transaction currency
  currency: string;        // AED, USD, EUR, etc.
  amountAed?: number;      // pre-converted to AED if available
  type: "cash_in" | "cash_out";
  channel?: "branch" | "atm" | "agent";
  counterparty?: string;
  reference?: string;
}

interface CtrRequest {
  // Reporting party
  institutionName?: string;
  branchCode?: string;
  reportingOfficerName?: string;
  // Subject
  subjectName: string;
  subjectType?: "individual" | "corporate";
  nationality?: string;
  identityNumber?: string;   // passport / EID
  address?: string;
  // Transactions
  transactions: CtrTransaction[];
  // Optional override
  exchangeRateToAed?: Record<string, number>; // currency → AED rate
  reportingThresholdAed?: number;              // default 55000
}

const DEFAULT_THRESHOLD = 55_000;
const DEFAULT_RATES: Record<string, number> = {
  "AED": 1, "USD": 3.67, "EUR": 4.02, "GBP": 4.68,
  "SAR": 0.98, "KWD": 11.95, "BHD": 9.73, "OMR": 9.52,
  "QAR": 1.01, "CHF": 4.15, "JPY": 0.025, "CNY": 0.51,
};

function toAed(amount: number, currency: string, rates: Record<string, number>): number {
  const rate = rates[currency.toUpperCase()] ?? rates["USD"] ?? 3.67;
  return amount * rate;
}

interface DailyAggregate {
  date: string;
  cashIn: number;
  cashOut: number;
  total: number;
  transactions: CtrTransaction[];
  thresholdBreached: boolean;
  excessAed: number;
}

function aggregateByDay(txns: CtrTransaction[], threshold: number, rates: Record<string, number>): DailyAggregate[] {
  const byDay = new Map<string, CtrTransaction[]>();
  for (const t of txns) {
    const day = t.date.split("T")[0] ?? t.date;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(t);
  }
  return [...byDay.entries()].map(([date, dayTxns]) => {
    const cashIn = dayTxns.filter((t) => t.type === "cash_in").reduce((s, t) => s + (t.amountAed ?? toAed(t.amount, t.currency, rates)), 0);
    const cashOut = dayTxns.filter((t) => t.type === "cash_out").reduce((s, t) => s + (t.amountAed ?? toAed(t.amount, t.currency, rates)), 0);
    const total = cashIn + cashOut;
    return { date, cashIn: Math.round(cashIn), cashOut: Math.round(cashOut), total: Math.round(total), transactions: dayTxns, thresholdBreached: total >= threshold, excessAed: Math.max(0, Math.round(total - threshold)) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function generateCtrXml(data: {
  referenceNumber: string;
  reportDate: string;
  subjectName: string;
  subjectType: string;
  nationality?: string;
  identityNumber?: string;
  institutionName?: string;
  branchCode?: string;
  totalCashIn: number;
  totalCashOut: number;
  transactionDate: string;
}): string {
  const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<goAML xmlns="http://www.goAML.int/FIU/AML/v3.0">
  <report>
    <rentity_id>${e(data.institutionName ?? "REPORTING_INSTITUTION")}</rentity_id>
    <report_code>CTR</report_code>
    <report_date>${data.reportDate}</report_date>
    <currency_code_local>AED</currency_code_local>
    <submission_code>E</submission_code>
    <action>R</action>
    <involved_parties>
      <party seq="1">
        <role>S</role>
        <party_identification>
          <first_name>${e(data.subjectName.split(" ")[0] ?? "")}</first_name>
          <last_name>${e(data.subjectName.split(" ").slice(1).join(" ") || data.subjectName)}</last_name>
          <entity_type>${data.subjectType === "corporate" ? "E" : "P"}</entity_type>
          ${data.nationality ? `<country_of_birth>${e(data.nationality)}</country_of_birth>` : ""}
          ${data.identityNumber ? `<identification><id_number>${e(data.identityNumber)}</id_number></identification>` : ""}
        </party_identification>
      </party>
    </involved_parties>
    <transactions>
      ${data.totalCashIn > 0 ? `<transaction>
        <transactionnumber>${data.referenceNumber}-IN</transactionnumber>
        <transaction_location>${data.branchCode ?? "UAE"}</transaction_location>
        <date_transaction>${data.transactionDate}</date_transaction>
        <amount_local>${data.totalCashIn.toFixed(2)}</amount_local>
        <teller>SYSTEM</teller>
        <mode_of_payment><mode_of_payment_code>C</mode_of_payment_code></mode_of_payment>
      </transaction>` : ""}
      ${data.totalCashOut > 0 ? `<transaction>
        <transactionnumber>${data.referenceNumber}-OUT</transactionnumber>
        <transaction_location>${data.branchCode ?? "UAE"}</transaction_location>
        <date_transaction>${data.transactionDate}</date_transaction>
        <amount_local>${data.totalCashOut.toFixed(2)}</amount_local>
        <teller>SYSTEM</teller>
        <mode_of_payment><mode_of_payment_code>C</mode_of_payment_code></mode_of_payment>
      </transaction>` : ""}
    </transactions>
    <reference_number>${e(data.referenceNumber)}</reference_number>
  </report>
</goAML>`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: CtrRequest;
  try { body = await req.json() as CtrRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400, headers: gate.headers });
  }
  if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
    return NextResponse.json({ ok: false, error: "transactions[] required" }, { status: 400, headers: gate.headers });
  }

  const threshold = body.reportingThresholdAed ?? DEFAULT_THRESHOLD;
  const rates = { ...DEFAULT_RATES, ...(body.exchangeRateToAed ?? {}) };
  const dailyAggregates = aggregateByDay(body.transactions, threshold, rates);
  const breachedDays = dailyAggregates.filter((d) => d.thresholdBreached);
  const ctrRequired = breachedDays.length > 0;
  const referenceNumber = `CTR-${Date.now().toString(36).toUpperCase()}`;
  const reportDate = new Date().toISOString().split("T")[0] ?? new Date().toISOString().slice(0, 10);
  const firstBreachDay = breachedDays[0];

  const completenessChecklist = [
    { field: "subjectName", status: body.subjectName?.trim() ? "complete" : "missing" },
    { field: "nationality", status: body.nationality?.trim() ? "complete" : "missing" },
    { field: "identityDocument", status: body.identityNumber?.trim() ? "complete" : "missing" },
    { field: "institutionName", status: body.institutionName?.trim() ? "complete" : "missing" },
    { field: "reportingOfficer", status: body.reportingOfficerName?.trim() ? "complete" : "missing" },
    { field: "transactions", status: body.transactions.length > 0 ? "complete" : "missing" },
  ];

  const goAmlXml = ctrRequired && firstBreachDay ? generateCtrXml({
    referenceNumber,
    reportDate,
    subjectName: body.subjectName,
    subjectType: body.subjectType ?? "individual",
    nationality: body.nationality,
    identityNumber: body.identityNumber,
    institutionName: body.institutionName,
    branchCode: body.branchCode,
    totalCashIn: firstBreachDay.cashIn,
    totalCashOut: firstBreachDay.cashOut,
    transactionDate: firstBreachDay.date,
  }) : null;

  return NextResponse.json({
    ok: true,
    ctrRequired,
    referenceNumber,
    subjectName: body.subjectName,
    threshold,
    dailyAggregates,
    breachedDays: breachedDays.length,
    firstBreachDate: firstBreachDay?.date ?? null,
    firstBreachTotal: firstBreachDay?.total ?? null,
    goAmlXml,
    completenessChecklist,
    missingFields: completenessChecklist.filter((c) => c.status === "missing").map((c) => c.field),
    readyToSubmit: ctrRequired && completenessChecklist.every((c) => c.status !== "missing"),
    filingDeadline: ctrRequired ? "Within 2 business days of transaction date (CBUAE CTR Circular)" : null,
    submissionInstructions: ctrRequired ? [
      "1. Verify transaction amounts and subject identity",
      "2. Upload goAML XML via UAE FIU goAML portal",
      "3. Retain CTR reference for 10-year record keeping",
      "4. No requirement to notify subject of CTR filing",
    ] : ["CTR threshold not reached — no filing required"],
    regulatoryBasis: "FDL 10/2025 Art.16; CBUAE AML Standards §10; Cabinet Decision No. 10/2019",
    generatedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
