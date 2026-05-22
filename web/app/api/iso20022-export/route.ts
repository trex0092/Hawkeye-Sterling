// POST /api/iso20022-export
//
// H4: ISO 20022 pacs.008 (FIToFICustomerCreditTransfer) message generator.
// Produces structured XML for wire transfer SAR/STR narratives.
//
// Used to attach machine-readable ISO 20022 payment instruction data to
// Suspicious Transaction Reports so FIU analysts and correspondent banks
// can process the underlying transaction using SWIFT GPI tooling.
//
// Body:
//   {
//     msgId: string;                 // unique message identifier
//     creationDateTime?: string;     // ISO 8601; defaults to now
//     instructionId?: string;
//     endToEndId?: string;
//     transactionId?: string;
//     amount: number;                // instructed amount
//     currency: string;              // ISO 4217
//     chargeBearer?: "DEBT"|"CRED"|"SHAR"|"SLEV";  // default SHAR
//     debtorName: string;
//     debtorAccount?: string;        // IBAN or account number
//     debtorBic?: string;
//     debtorAddress?: string;
//     creditorName: string;
//     creditorAccount?: string;
//     creditorBic?: string;
//     creditorAddress?: string;
//     remittanceInfo?: string;       // unstructured remittance info
//     regulatoryReason?: string;     // SAR/STR reference
//     caseId?: string;
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Pacs008Body {
  msgId: string;
  creationDateTime?: string;
  instructionId?: string;
  endToEndId?: string;
  transactionId?: string;
  amount: number;
  currency: string;
  chargeBearer?: "DEBT" | "CRED" | "SHAR" | "SLEV";
  debtorName: string;
  debtorAccount?: string;
  debtorBic?: string;
  debtorAddress?: string;
  creditorName: string;
  creditorAccount?: string;
  creditorBic?: string;
  creditorAddress?: string;
  remittanceInfo?: string;
  regulatoryReason?: string;
  caseId?: string;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function amountStr(n: number): string {
  return n.toFixed(2);
}

function generatePacs008Xml(b: Pacs008Body): string {
  const now = b.creationDateTime ?? new Date().toISOString().slice(0, 19);
  const instrId = b.instructionId ?? b.msgId;
  const e2eId = b.endToEndId ?? b.msgId;
  const txId = b.transactionId ?? b.msgId;
  const bearer = b.chargeBearer ?? "SHAR";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.11"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.11 pacs.008.001.11.xsd">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${escXml(b.msgId)}</MsgId>
      <CreDtTm>${escXml(now)}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>${b.caseId ? `
      <InstgAgt>
        <FinInstnId>
          <Othr>
            <Id>HAWKEYE-STERLING</Id>
            <SchmeNm><Prtry>AML-CASE-REF</Prtry></SchmeNm>
            <Issr>${escXml(b.caseId)}</Issr>
          </Othr>
        </FinInstnId>
      </InstgAgt>` : ""}
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${escXml(instrId)}</InstrId>
        <EndToEndId>${escXml(e2eId)}</EndToEndId>
        <TxId>${escXml(txId)}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${escXml(b.currency)}">${escXml(amountStr(b.amount))}</IntrBkSttlmAmt>
      <ChrgBr>${bearer}</ChrgBr>
      <Dbtr>
        <Nm>${escXml(b.debtorName)}</Nm>${b.debtorAddress ? `
        <PstlAdr>
          <AdrLine>${escXml(b.debtorAddress)}</AdrLine>
        </PstlAdr>` : ""}
      </Dbtr>${b.debtorAccount ? `
      <DbtrAcct>
        <Id>
          ${b.debtorAccount.replace(/\s/g, "").match(/^[A-Z]{2}\d{2}/) ?
            `<IBAN>${escXml(b.debtorAccount)}</IBAN>` :
            `<Othr><Id>${escXml(b.debtorAccount)}</Id></Othr>`}
        </Id>
      </DbtrAcct>` : ""}${b.debtorBic ? `
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${escXml(b.debtorBic)}</BICFI>
        </FinInstnId>
      </DbtrAgt>` : ""}
      <Cdtr>
        <Nm>${escXml(b.creditorName)}</Nm>${b.creditorAddress ? `
        <PstlAdr>
          <AdrLine>${escXml(b.creditorAddress)}</AdrLine>
        </PstlAdr>` : ""}
      </Cdtr>${b.creditorAccount ? `
      <CdtrAcct>
        <Id>
          ${b.creditorAccount.replace(/\s/g, "").match(/^[A-Z]{2}\d{2}/) ?
            `<IBAN>${escXml(b.creditorAccount)}</IBAN>` :
            `<Othr><Id>${escXml(b.creditorAccount)}</Id></Othr>`}
        </Id>
      </CdtrAcct>` : ""}${b.creditorBic ? `
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${escXml(b.creditorBic)}</BICFI>
        </FinInstnId>
      </CdtrAgt>` : ""}${b.remittanceInfo || b.regulatoryReason ? `
      <RmtInf>
        <Ustrd>${escXml([b.remittanceInfo, b.regulatoryReason ? `REF:${b.regulatoryReason}` : ""].filter(Boolean).join(" | "))}</Ustrd>
      </RmtInf>` : ""}
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Partial<Pacs008Body>;
  try { body = (await req.json()) as Partial<Pacs008Body>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers }); }

  if (!body.msgId?.trim()) return NextResponse.json({ ok: false, error: "msgId required" }, { status: 400, headers: gate.headers });
  if (!body.debtorName?.trim()) return NextResponse.json({ ok: false, error: "debtorName required" }, { status: 400, headers: gate.headers });
  if (!body.creditorName?.trim()) return NextResponse.json({ ok: false, error: "creditorName required" }, { status: 400, headers: gate.headers });
  if (!body.amount || body.amount <= 0) return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400, headers: gate.headers });
  if (!body.currency?.trim()) return NextResponse.json({ ok: false, error: "currency (ISO 4217) required" }, { status: 400, headers: gate.headers });

  const sanitised: Pacs008Body = {
    msgId: sanitizeField(body.msgId),
    creationDateTime: body.creationDateTime,
    instructionId: body.instructionId ? sanitizeField(body.instructionId) : undefined,
    endToEndId: body.endToEndId ? sanitizeField(body.endToEndId) : undefined,
    transactionId: body.transactionId ? sanitizeField(body.transactionId) : undefined,
    amount: body.amount,
    currency: sanitizeField(body.currency, 3).toUpperCase(),
    chargeBearer: body.chargeBearer,
    debtorName: sanitizeField(body.debtorName),
    debtorAccount: body.debtorAccount ? sanitizeField(body.debtorAccount, 34) : undefined,
    debtorBic: body.debtorBic ? sanitizeField(body.debtorBic, 11) : undefined,
    debtorAddress: body.debtorAddress ? sanitizeField(body.debtorAddress) : undefined,
    creditorName: sanitizeField(body.creditorName),
    creditorAccount: body.creditorAccount ? sanitizeField(body.creditorAccount, 34) : undefined,
    creditorBic: body.creditorBic ? sanitizeField(body.creditorBic, 11) : undefined,
    creditorAddress: body.creditorAddress ? sanitizeField(body.creditorAddress) : undefined,
    remittanceInfo: body.remittanceInfo ? sanitizeField(body.remittanceInfo, 140) : undefined,
    regulatoryReason: body.regulatoryReason ? sanitizeField(body.regulatoryReason) : undefined,
    caseId: body.caseId ? sanitizeField(body.caseId) : undefined,
  };

  const xml = generatePacs008Xml(sanitised);
  const filename = `${sanitised.msgId.replace(/[^A-Za-z0-9_-]/g, "_")}.xml`;

  return new NextResponse(xml, {
    status: 201,
    headers: {
      ...gate.headers,
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-ISO20022-Version": "pacs.008.001.11",
      "X-Regulatory-Note": "ISO 20022 pacs.008 FIToFICustomerCreditTransfer — for attachment to SAR/STR filings",
    },
  });
}
