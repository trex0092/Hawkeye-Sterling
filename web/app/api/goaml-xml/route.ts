// POST /api/goaml-xml
//
// Generates a goAML-compliant STR/SAR XML file for download by the
// MLRO.  No FIU credentials are required — this endpoint produces the
// correctly-formatted XML so the operator can:
//   1.  Review and save to the case file.
//   2.  Submit manually through the UAE FIU goAML portal.
//
// Input schema: GoAmlXmlInput (see below).
// Output:       GoAmlXmlResult (JSON — XML string embedded as a field).
//
// Regulatory basis: UAE FDL 10/2025 Art.17 (48-hour STR obligation);
// UAE FIU goAML Technical Guide v3.1; goAML XML schema v4.0/5.x.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────
//  Public type contracts
// ────────────────────────────────────────────────────────────────────

export interface GoAmlXmlResult {
  ok: true;
  xml: string;                  // Full goAML-compliant XML string
  validationErrors: string[];
  validationWarnings: string[];
  reportRef: string;            // e.g. UAE-STR-2025-{timestamp}
  submissionChecklist: string[];
}

interface Transaction {
  date: string;         // YYYY-MM-DD
  amount: number;       // positive number, AED
  currency: string;     // e.g. "AED"
  type: string;         // e.g. "cash_deposit"
  description: string;
}

interface GoAmlXmlInput {
  mlroName: string;
  mlroEmail: string;
  mlroPhone: string;
  reportingEntityId: string;
  subjectName: string;
  subjectDob: string;
  subjectNationality: string;
  subjectPassport: string;
  subjectPassportCountry: string;
  subjectCountry: string;
  accountNumber: string;
  narrativeText: string;
  transactions: Transaction[];
  suspectedOffence: string;
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: full, last: full };
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function splitMlroName(full: string): { first: string; last: string } {
  return splitName(full);
}

// ────────────────────────────────────────────────────────────────────
//  Validation
// ────────────────────────────────────────────────────────────────────

function validate(b: GoAmlXmlInput): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!b.mlroName?.trim()) errors.push("MLRO name is required.");
  if (!b.mlroEmail?.trim() || !b.mlroEmail.includes("@")) errors.push("MLRO email must be a valid email address.");
  if (!b.mlroPhone?.trim()) errors.push("MLRO phone is required.");
  if (!b.reportingEntityId?.trim()) errors.push("Reporting Entity ID is required.");

  if (!b.subjectName?.trim()) {
    errors.push("Subject name is required.");
  } else if (b.subjectName.trim().split(/\s+/).length < 2) {
    warnings.push("Subject name appears to be a single word — full name (first + last) expected.");
  }

  if (!b.subjectDob?.trim()) {
    errors.push("Subject date of birth is required.");
  } else if (!YYYY_MM_DD.test(b.subjectDob.trim())) {
    errors.push("Subject date of birth must be in YYYY-MM-DD format.");
  } else {
    const dob = Date.parse(b.subjectDob.trim());
    if (Number.isNaN(dob)) {
      errors.push("Subject date of birth is not a valid date.");
    } else if (dob > Date.now()) {
      errors.push("Subject date of birth cannot be in the future.");
    }
  }

  if (!b.subjectNationality?.trim()) errors.push("Subject nationality is required.");
  if (!b.subjectPassport?.trim()) errors.push("Subject passport / ID number is required.");
  if (!b.subjectPassportCountry?.trim()) errors.push("Passport issuing country is required.");
  if (!b.subjectCountry?.trim()) errors.push("Subject country of residence is required.");

  if (!b.accountNumber?.trim()) errors.push("Account number is required.");

  const narrative = b.narrativeText?.trim() ?? "";
  if (narrative.length === 0) {
    errors.push("Narrative text is required.");
  } else if (narrative.length < 100) {
    errors.push("Narrative must be at least 100 characters — describe who, what, when, where, why.");
  } else if (narrative.length < 200) {
    warnings.push("Narratives under 200 characters are routinely returned by UAE FIU reviewers as insufficient.");
  }
  if (narrative.length > 4000) {
    errors.push("Narrative exceeds the 4,000-character goAML <reason> field cap.");
  }

  if (!b.suspectedOffence?.trim()) {
    warnings.push("Suspected offence not specified — recommended for complete STR filing.");
  }

  if (!b.transactions || b.transactions.length === 0) {
    warnings.push("No transactions provided — the goAML transactions block will be empty.");
  } else {
    b.transactions.forEach((tx, i) => {
      const idx = i + 1;
      if (!tx.date) {
        errors.push(`Transaction ${idx}: date is required.`);
      } else if (!YYYY_MM_DD.test(tx.date)) {
        errors.push(`Transaction ${idx}: date must be YYYY-MM-DD (got "${tx.date}").`);
      }
      if (tx.amount === undefined || tx.amount === null) {
        errors.push(`Transaction ${idx}: amount is required.`);
      } else if (!Number.isFinite(tx.amount) || tx.amount <= 0) {
        errors.push(`Transaction ${idx}: amount must be a positive number.`);
      }
      if (!tx.currency?.trim()) {
        warnings.push(`Transaction ${idx}: currency not specified; defaulting to AED.`);
      }
    });
  }

  return { errors, warnings };
}

// ────────────────────────────────────────────────────────────────────
//  XML serialisation
// ────────────────────────────────────────────────────────────────────

function buildXml(b: GoAmlXmlInput, reportRef: string, submissionDate: string): string {
  const { first: mlroFirst, last: mlroLast } = splitMlroName(b.mlroName.trim());
  const { first: subjectFirst, last: subjectLast } = splitName(b.subjectName.trim());

  const txLines = (b.transactions ?? [])
    .map((tx, i) => {
      const txNum = `${reportRef}-TXN-${i + 1}`;
      const currency = (tx.currency?.trim() || "AED").toUpperCase();
      const txType = escXml(tx.type?.trim() || "cash");
      const desc = escXml(tx.description?.trim() || "");
      return `      <transaction>
        <transaction_number>${escXml(txNum)}</transaction_number>
        <transaction_date>${escXml(tx.date)}</transaction_date>
        <teller>1</teller>
        <transmode_code>C</transmode_code>
        <amount_local>${tx.amount.toFixed(2)}</amount_local>
        <transaction_type>${txType}</transaction_type>
        <currency_amount>
          <currency_code>${currency}</currency_code>
          <amount>${tx.amount.toFixed(2)}</amount>
        </currency_amount>${desc ? `\n        <description>${desc}</description>` : ""}
      </transaction>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rentity_id>${escXml(b.reportingEntityId.trim())}</rentity_id>
  <rentity_branch>HQ</rentity_branch>
  <submission_code>E</submission_code>
  <report_code>STR</report_code>
  <submission_date>${escXml(submissionDate)}</submission_date>
  <currency_code_local>AED</currency_code_local>
  <reporting_person>
    <title>Mr</title>
    <firstname>${escXml(mlroFirst)}</firstname>
    <surname>${escXml(mlroLast)}</surname>
    <positions>
      <position>
        <occupation>MLRO</occupation>
      </position>
    </positions>
    <phones>
      <phone>
        <tph_communication_type>M</tph_communication_type>
        <tph_number>${escXml(b.mlroPhone.trim())}</tph_number>
      </phone>
    </phones>
    <email>${escXml(b.mlroEmail.trim())}</email>
  </reporting_person>
  <location>UAE</location>
  <report>
    <has_financial_activity>true</has_financial_activity>
    <suspicious_activity_text>${escXml(b.narrativeText.trim())}</suspicious_activity_text>
    <actioned>Y</actioned>
    <report_subject_id>1</report_subject_id>
    <report_subjects>
      <subject>
        <subject_id>1</subject_id>
        <subject_type>P</subject_type>
        <role>S</role>
        <first_name>${escXml(subjectFirst)}</first_name>
        <last_name>${escXml(subjectLast)}</last_name>
        <nationality>${escXml(b.subjectNationality.trim().toUpperCase())}</nationality>
        <id_type>P</id_type>
        <id_number>${escXml(b.subjectPassport.trim())}</id_number>
        <id_issuer>${escXml(b.subjectPassportCountry.trim().toUpperCase())}</id_issuer>
        <birth_date>${escXml(b.subjectDob.trim())}</birth_date>
        <gender>U</gender>
        <addresses>
          <address>
            <address_type>H</address_type>
            <country>${escXml(b.subjectCountry.trim().toUpperCase())}</country>
          </address>
        </addresses>
      </subject>
    </report_subjects>
    <involved_accounts>
      <account>
        <institution_name>Hawkeye Sterling DPMS</institution_name>
        <account_number>${escXml(b.accountNumber.trim())}</account_number>
        <currency_code>AED</currency_code>
        <account_type>G</account_type>
      </account>
    </involved_accounts>
    <transactions>
${txLines}
    </transactions>
  </report>
</Report>`;
}

// ────────────────────────────────────────────────────────────────────
//  Fallback XML (all fields set to placeholders)
// ────────────────────────────────────────────────────────────────────

function buildFallbackXml(reportRef: string, submissionDate: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- FALLBACK TEMPLATE — Replace all [REPLACE_BEFORE_FILING] values before submitting to UAE FIU goAML portal -->
<Report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rentity_id>[REPLACE_BEFORE_FILING:FIU_ENTITY_ID]</rentity_id>
  <rentity_branch>HQ</rentity_branch>
  <submission_code>E</submission_code>
  <report_code>STR</report_code>
  <submission_date>${submissionDate}</submission_date>
  <currency_code_local>AED</currency_code_local>
  <reporting_person>
    <title>Mr</title>
    <firstname>[REPLACE_BEFORE_FILING:MLRO_FIRSTNAME]</firstname>
    <surname>[REPLACE_BEFORE_FILING:MLRO_LASTNAME]</surname>
    <positions>
      <position>
        <occupation>MLRO</occupation>
      </position>
    </positions>
    <phones>
      <phone>
        <tph_communication_type>M</tph_communication_type>
        <tph_number>[REPLACE_BEFORE_FILING:MLRO_PHONE]</tph_number>
      </phone>
    </phones>
    <email>[REPLACE_BEFORE_FILING:MLRO_EMAIL]</email>
  </reporting_person>
  <location>UAE</location>
  <report>
    <has_financial_activity>true</has_financial_activity>
    <suspicious_activity_text>[REPLACE_BEFORE_FILING:NARRATIVE_TEXT]</suspicious_activity_text>
    <actioned>Y</actioned>
    <report_subject_id>1</report_subject_id>
    <report_subjects>
      <subject>
        <subject_id>1</subject_id>
        <subject_type>P</subject_type>
        <role>S</role>
        <first_name>[REPLACE_BEFORE_FILING:SUBJECT_FIRSTNAME]</first_name>
        <last_name>[REPLACE_BEFORE_FILING:SUBJECT_LASTNAME]</last_name>
        <nationality>[REPLACE_BEFORE_FILING:ISO2_NATIONALITY]</nationality>
        <id_type>P</id_type>
        <id_number>[REPLACE_BEFORE_FILING:PASSPORT_NUMBER]</id_number>
        <id_issuer>[REPLACE_BEFORE_FILING:PASSPORT_COUNTRY_ISO2]</id_issuer>
        <birth_date>[REPLACE_BEFORE_FILING:YYYY-MM-DD]</birth_date>
        <gender>U</gender>
        <addresses>
          <address>
            <address_type>H</address_type>
            <country>[REPLACE_BEFORE_FILING:COUNTRY_ISO2]</country>
          </address>
        </addresses>
      </subject>
    </report_subjects>
    <involved_accounts>
      <account>
        <institution_name>Hawkeye Sterling DPMS</institution_name>
        <account_number>[REPLACE_BEFORE_FILING:ACCOUNT_NUMBER]</account_number>
        <currency_code>AED</currency_code>
        <account_type>G</account_type>
      </account>
    </involved_accounts>
    <transactions>
      <transaction>
        <transaction_number>${reportRef}-TXN-1</transaction_number>
        <transaction_date>[REPLACE_BEFORE_FILING:YYYY-MM-DD]</transaction_date>
        <teller>1</teller>
        <transmode_code>C</transmode_code>
        <amount_local>[REPLACE_BEFORE_FILING:AMOUNT]</amount_local>
        <transaction_type>[REPLACE_BEFORE_FILING:TX_TYPE]</transaction_type>
        <currency_amount>
          <currency_code>AED</currency_code>
          <amount>[REPLACE_BEFORE_FILING:AMOUNT]</amount>
        </currency_amount>
      </transaction>
    </transactions>
  </report>
</Report>`;
}

// ────────────────────────────────────────────────────────────────────
//  Route handler
// ────────────────────────────────────────────────────────────────────

const SUBMISSION_CHECKLIST = [
  "MLRO has reviewed the narrative and confirms it accurately describes the suspicious activity.",
  "Subject identity has been verified against CDD file and KYC documents.",
  "All transactions listed have been verified against core-system records.",
  "Legal counsel has been notified if required (e.g. parallel law-enforcement referral).",
  "XML file has been downloaded and saved to the case file with date-stamp.",
  "Draft has been validated and no critical errors remain before portal submission.",
  "Filing is within the 48-hour deadline mandated by UAE FDL 10/2025 Art.17.",
];

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: GoAmlXmlInput;
  try {
    body = (await req.json()) as GoAmlXmlInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const now = new Date();
  const submissionDate = now.toISOString().split("T")[0]!;
  const ts = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const reportRef = `UAE-STR-${now.getUTCFullYear()}-${ts}`;

  const { errors, warnings } = validate(body ?? ({} as GoAmlXmlInput));

  let xml: string;
  if (errors.length > 0) {
    xml = buildFallbackXml(reportRef, submissionDate);
  } else {
    try {
      xml = buildXml(body, reportRef, submissionDate);
    } catch (err) {
      console.error("[goaml-xml] serialise error", err);
      xml = buildFallbackXml(reportRef, submissionDate);
    }
  }

  const result: GoAmlXmlResult = {
    ok: true,
    xml,
    validationErrors: errors,
    validationWarnings: warnings,
    reportRef,
    submissionChecklist: SUBMISSION_CHECKLIST,
  };

  return NextResponse.json(result, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
