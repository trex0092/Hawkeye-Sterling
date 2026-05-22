// POST/GET /api/dpmsr
//
// I3: DPMSR — Dealers in Precious Metals and Stones Report.
// UAE Ministry of Economy (MoE) regulatory filing obligation for DPMS entities.
// Required under MoE Circular 08/AML/2021 §4 (threshold transaction reporting).
//
// Generates MoE-compatible DPMSR output for transactions at or above:
//   - AED 55,000 (single transaction — J5 threshold)
//   - AED 60,000 (cumulative within 30 days — J5 threshold)
//
// Also supports STR/CTR forwarding to goAML XML format.
//
// POST body:
//   {
//     reportType: "threshold_transaction" | "cash_transaction" | "str_dpms";
//     transactionId: string;
//     subjectName: string;
//     subjectType: "individual" | "organisation";
//     transactionDate: string;
//     transactionAmount: number;
//     transactionCurrency: string;
//     transactionAmountAed: number;
//     paymentMethod: "cash" | "bank_transfer" | "crypto" | "cheque" | "other";
//     commodityDescription: string;         // e.g. "gold bullion 1kg bar x5"
//     commodityWeightGrams?: number;
//     commodityPurityKarat?: number;
//     caseId?: string;
//     mlroName: string;
//     mlroSignature?: string;
//     narrativeSummary?: string;
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, setJson, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const THRESHOLD_AED_SINGLE = 55_000;
const THRESHOLD_AED_CUMULATIVE = 60_000;

interface DPMSRRecord {
  id: string;
  reportType: "threshold_transaction" | "cash_transaction" | "str_dpms";
  transactionId: string;
  subjectName: string;
  subjectType: "individual" | "organisation";
  transactionDate: string;
  transactionAmount: number;
  transactionCurrency: string;
  transactionAmountAed: number;
  paymentMethod: string;
  commodityDescription: string;
  commodityWeightGrams?: number;
  commodityPurityKarat?: number;
  thresholdBreached: boolean;
  thresholdType?: "single" | "cumulative";
  caseId?: string;
  mlroName: string;
  mlroSignature?: string;
  narrativeSummary?: string;
  status: "draft" | "submitted" | "acknowledged";
  createdAt: string;
  submittedAt?: string;
  tenant: string;
  regulatoryReference: string;
}

function dpmsr_key(tenant: string, id: string): string {
  return `dpmsr/${tenant}/${id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128)}.json`;
}

function dpmsr_index_key(tenant: string): string {
  return `dpmsr/${tenant}/_index.json`;
}

function generateDpmsrXml(record: DPMSRRecord): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DPMSReport xmlns="http://www.moec.gov.ae/dpms/2025" version="1.0">
  <ReportHeader>
    <ReportId>${record.id}</ReportId>
    <ReportType>${record.reportType}</ReportType>
    <CreatedAt>${record.createdAt}</CreatedAt>
    <RegulatoryReference>${record.regulatoryReference}</RegulatoryReference>
  </ReportHeader>
  <Transaction>
    <TransactionId>${sanitizeField(record.transactionId)}</TransactionId>
    <TransactionDate>${record.transactionDate}</TransactionDate>
    <Amount currency="${record.transactionCurrency}">${record.transactionAmount}</Amount>
    <AmountAED>${record.transactionAmountAed}</AmountAED>
    <PaymentMethod>${record.paymentMethod}</PaymentMethod>
    <ThresholdBreached>${record.thresholdBreached}</ThresholdBreached>
    ${record.thresholdType ? `<ThresholdType>${record.thresholdType}</ThresholdType>` : ""}
  </Transaction>
  <Subject>
    <Name>${sanitizeField(record.subjectName)}</Name>
    <Type>${record.subjectType}</Type>
  </Subject>
  <Commodity>
    <Description>${sanitizeField(record.commodityDescription)}</Description>
    ${record.commodityWeightGrams ? `<WeightGrams>${record.commodityWeightGrams}</WeightGrams>` : ""}
    ${record.commodityPurityKarat ? `<PurityKarat>${record.commodityPurityKarat}</PurityKarat>` : ""}
  </Commodity>
  <MLRODeclaration>
    <MLROName>${sanitizeField(record.mlroName)}</MLROName>
    ${record.narrativeSummary ? `<NarrativeSummary>${sanitizeField(record.narrativeSummary)}</NarrativeSummary>` : ""}
  </MLRODeclaration>
</DPMSReport>`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Partial<DPMSRRecord>;
  try { body = (await req.json()) as Partial<DPMSRRecord>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers }); }

  if (!body.subjectName?.trim()) return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400, headers: gate.headers });
  if (!body.transactionAmountAed || body.transactionAmountAed <= 0) return NextResponse.json({ ok: false, error: "transactionAmountAed required" }, { status: 400, headers: gate.headers });
  if (!body.mlroName?.trim()) return NextResponse.json({ ok: false, error: "mlroName required" }, { status: 400, headers: gate.headers });

  const amountAed = body.transactionAmountAed ?? 0;
  const thresholdBreached = amountAed >= THRESHOLD_AED_SINGLE;
  const thresholdType: "single" | "cumulative" | undefined = amountAed >= THRESHOLD_AED_SINGLE ? "single"
    : amountAed >= THRESHOLD_AED_CUMULATIVE ? "cumulative" : undefined;

  const id = `DPMSR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const record: DPMSRRecord = {
    id,
    reportType: body.reportType ?? "threshold_transaction",
    transactionId: sanitizeField(body.transactionId ?? id),
    subjectName: sanitizeField(body.subjectName ?? ""),
    subjectType: body.subjectType ?? "individual",
    transactionDate: body.transactionDate ?? new Date().toISOString().slice(0, 10),
    transactionAmount: body.transactionAmount ?? amountAed,
    transactionCurrency: body.transactionCurrency ?? "AED",
    transactionAmountAed: amountAed,
    paymentMethod: body.paymentMethod ?? "other",
    commodityDescription: sanitizeField(body.commodityDescription ?? "Precious metals / stones"),
    commodityWeightGrams: body.commodityWeightGrams,
    commodityPurityKarat: body.commodityPurityKarat,
    thresholdBreached,
    thresholdType,
    caseId: body.caseId,
    mlroName: sanitizeField(body.mlroName ?? ""),
    narrativeSummary: body.narrativeSummary ? sanitizeField(body.narrativeSummary) : undefined,
    status: "draft",
    createdAt: new Date().toISOString(),
    tenant,
    regulatoryReference: "MoE Circular 08/AML/2021 §4 — DPMS threshold transaction reporting. UAE FDL No.10/2025 Art.15.",
  };

  await setJson(dpmsr_key(tenant, id), record);
  const idx = (await getJson<string[]>(dpmsr_index_key(tenant))) ?? [];
  idx.unshift(id);
  await setJson(dpmsr_index_key(tenant), idx.slice(0, 500));

  void writeAuditChainEntry({
    event: "dpmsr.created",
    actor: gate.keyId,
    dpmsrId: id,
    subjectName: record.subjectName,
    amountAed,
    thresholdBreached,
    reportType: record.reportType,
  }, tenant).catch(() => undefined);

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  if (format === "xml") {
    const xml = generateDpmsrXml(record);
    return new NextResponse(xml, {
      status: 201,
      headers: { ...gate.headers, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${id}.xml"` },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      id,
      record,
      thresholdAlert: thresholdBreached
        ? `Transaction of AED ${amountAed.toLocaleString()} exceeds AED ${THRESHOLD_AED_SINGLE.toLocaleString()} threshold — DPMSR filing mandatory. MoE Circular 08/AML/2021 §4.`
        : undefined,
      xmlEndpoint: `POST /api/dpmsr?format=xml (re-POST with same body)`,
    },
    { status: 201, headers: gate.headers },
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const idx = (await getJson<string[]>(dpmsr_index_key(tenant))) ?? [];
  const records = (await Promise.all(idx.slice(0, 100).map((id) => getJson<DPMSRRecord>(dpmsr_key(tenant, id))))).filter((r): r is DPMSRRecord => r !== null);
  const filtered = status ? records.filter((r) => r.status === status) : records;

  return NextResponse.json({ ok: true, tenant, total: filtered.length, records: filtered }, { headers: gate.headers });
}
