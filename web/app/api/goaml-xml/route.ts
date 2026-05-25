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
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { validateGoamlXmlStructure, getGoamlSchemaVersion } from "@/lib/goaml-xsd-validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  // Audit DR-04: when buildXml() throws (unexpected schema field), the
  // route used to silently substitute a [REPLACE_BEFORE_FILING] placeholder
  // XML. MLROs could submit that broken XML to UAE FIU without realising.
  // This flag is now lifted to the top level so the UI/MCP wrapper can
  // refuse to surface the XML as final and humanReviewRequired stays true.
  degraded?: true;
  degradedReason?: string;
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
  // Optional: subject country of birth (alternative to nationality for pre-flight)
  subjectCountryOfBirth?: string;
  // MLRO decision date (ISO YYYY-MM-DD) — required for goAML filing
  decisionDate?: string;
  // Action code: "initial" (1) or "supplementary" (2). Defaults to "initial".
  actionCode?: "initial" | "supplementary";
  // CBUAE registration number override (falls back to env CBUAE_REGISTRATION_NUMBER)
  cbuaeRegistrationNumber?: string;
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
//  Environment variable resolution
// ────────────────────────────────────────────────────────────────────

interface EnvResolution {
  reportingEntityCode: string;
  cbuaeRegistrationNumber: string;
  mlroEmail: string;
  missingVars: string[];
}

function resolveEnvVars(body: GoAmlXmlInput): EnvResolution {
  const missingVars: string[] = [];

  // REPORTING_ENTITY_CODE: body override → env var → error
  const reportingEntityCode =
    body.reportingEntityId?.trim() ||
    process.env["REPORTING_ENTITY_CODE"]?.trim() ||
    "";
  if (!reportingEntityCode) {
    missingVars.push("REPORTING_ENTITY_CODE");
  }

  // CBUAE_REGISTRATION_NUMBER: body override → env var → error
  const cbuaeRegistrationNumber =
    body.cbuaeRegistrationNumber?.trim() ||
    process.env["CBUAE_REGISTRATION_NUMBER"]?.trim() ||
    "";
  if (!cbuaeRegistrationNumber) {
    missingVars.push("CBUAE_REGISTRATION_NUMBER");
  }

  // MLRO_EMAIL: body → env var → error
  const mlroEmail =
    body.mlroEmail?.trim() ||
    process.env["MLRO_EMAIL"]?.trim() ||
    "";
  if (!mlroEmail || !mlroEmail.includes("@")) {
    missingVars.push("MLRO_EMAIL");
  }

  return { reportingEntityCode, cbuaeRegistrationNumber, mlroEmail, missingVars };
}

// ────────────────────────────────────────────────────────────────────
//  Pre-flight validation (Task 3)
// ────────────────────────────────────────────────────────────────────

interface PreflightError {
  field: string;
  message: string;
}

function preflightValidate(b: GoAmlXmlInput, resolvedMlroEmail: string): PreflightError[] {
  const errs: PreflightError[] = [];

  // Subject must have name AND (nationality OR country_of_birth)
  if (!b.subjectName?.trim()) {
    errs.push({ field: "subjectName", message: "Subject name is required." });
  }
  if (!b.subjectNationality?.trim() && !b.subjectCountryOfBirth?.trim()) {
    errs.push({
      field: "subjectNationality",
      message: "Subject must have at least a nationality or country_of_birth.",
    });
  }

  // At least 1 transaction with amount > 0, date, currency, type
  if (!b.transactions || b.transactions.length === 0) {
    errs.push({
      field: "transactions",
      message: "At least one transaction with amount, date, currency, and type is required.",
    });
  } else {
    const validTx = b.transactions.filter(
      (tx) =>
        tx.amount > 0 &&
        tx.date &&
        YYYY_MM_DD.test(tx.date) &&
        tx.currency?.trim() &&
        tx.type?.trim(),
    );
    if (validTx.length === 0) {
      errs.push({
        field: "transactions[0]",
        message:
          "At least one transaction must have: amount > 0, date (YYYY-MM-DD), currency, and type.",
      });
    }
  }

  // Narrative minimum 200 characters
  const narrative = b.narrativeText?.trim() ?? "";
  if (narrative.length < 200) {
    errs.push({
      field: "narrativeText",
      message: `Narrative must be at least 200 characters (current: ${narrative.length}). Describe who, what, when, where, and why.`,
    });
  }

  // MLRO email must be configured
  if (!resolvedMlroEmail || !resolvedMlroEmail.includes("@")) {
    errs.push({
      field: "mlroEmail",
      message:
        "MLRO email is required. Set the MLRO_EMAIL environment variable or supply mlroEmail in the request body.",
    });
  }

  return errs;
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
  if (!b.reportingEntityId?.trim() && !process.env["REPORTING_ENTITY_CODE"]?.trim()) {
    errors.push("Reporting Entity ID is required (set REPORTING_ENTITY_CODE env var or supply reportingEntityId).");
  }

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
    if (!Number.isFinite(dob)) {
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
    errors.push("Narrative must be at least 200 characters — UAE FIU reviewers routinely reject shorter narratives as insufficient.");
  }
  if (narrative.length > 4000) {
    errors.push("Narrative exceeds the 4,000-character goAML <reason> field cap.");
  }

  if (!b.suspectedOffence?.trim()) {
    warnings.push("Suspected offence not specified — recommended for complete STR filing.");
  }

  // decision_date validation
  if (b.decisionDate) {
    if (!YYYY_MM_DD.test(b.decisionDate.trim())) {
      errors.push("decisionDate must be in YYYY-MM-DD format.");
    }
  } else {
    warnings.push("decisionDate (MLRO decision date) not provided — will default to today. Set explicitly for accurate goAML filing.");
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

function buildXml(
  b: GoAmlXmlInput,
  reportRef: string,
  submissionDate: string,
  resolvedEntityCode: string,
  resolvedCbuaeRegNumber: string,
  resolvedMlroEmail: string,
): string {
  const { first: mlroFirst, last: mlroLast } = splitMlroName(b.mlroName.trim());
  const { first: subjectFirst, last: subjectLast } = splitName(b.subjectName.trim());

  // action_code: Initial=1, Supplementary=2 (UAE FIU goAML Technical Guide v3.1)
  const actionCodeValue = b.actionCode === "supplementary" ? "2" : "1";
  const actionCodeLabel = b.actionCode === "supplementary" ? "supplementary" : "new";

  // decision_date: MLRO decision date; defaults to today if not provided
  const decisionDate = b.decisionDate?.trim() || submissionDate;

  const txLines = (b.transactions ?? [])
    .map((tx, i) => {
      const txNum = `${reportRef}-TXN-${i + 1}`;
      const currency = (tx.currency?.trim() || "AED").toUpperCase();
      const txType = escXml(tx.type?.trim() || "cash");
      const desc = escXml(tx.description?.trim() || "");
      return `      <transaction>
        <transactionnumber>${escXml(txNum)}</transactionnumber>
        <transaction_number>${escXml(txNum)}</transaction_number>
        <transaction_date>${escXml(tx.date)}</transaction_date>
        <teller>1</teller>
        <transmode_code>C</transmode_code>
        <transaction_location>UAE</transaction_location>
        <t_from_my_client>1</t_from_my_client>
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
  <rentity_id>${escXml(resolvedEntityCode)}</rentity_id>
  <rentity_branch>HQ</rentity_branch>
  <submission_code>E</submission_code>
  <report_code>STR</report_code>
  <action>${actionCodeLabel}</action>
  <action_code>${actionCodeValue}</action_code>
  <filing_institution>${escXml(resolvedCbuaeRegNumber)}</filing_institution>
  <internal_reference>${escXml(reportRef)}</internal_reference>
  <submission_date>${escXml(submissionDate)}</submission_date>
  <decision_date>${escXml(decisionDate)}</decision_date>
  <currency_code_local>AED</currency_code_local>
  <reporting_person>
    <title>Mr</title>
    <first_name>${escXml(mlroFirst)}</first_name>
    <last_name>${escXml(mlroLast)}</last_name>
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
    <email>${escXml(resolvedMlroEmail)}</email>
  </reporting_person>
  <location>UAE</location>
  <report>
    <has_financial_activity>true</has_financial_activity>
    <suspicious_activity_text>${escXml(b.narrativeText.trim())}</suspicious_activity_text>
    <actioned>Y</actioned>
    <report_subject_id>1</report_subject_id>
    <report_subjects>
      <subject>
        <subjectid>1</subjectid>
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
  <action>new</action>
  <action_code>1</action_code>
  <filing_institution>[REPLACE_BEFORE_FILING:CBUAE_REGISTRATION_NUMBER]</filing_institution>
  <internal_reference>${reportRef}</internal_reference>
  <submission_date>${submissionDate}</submission_date>
  <decision_date>[REPLACE_BEFORE_FILING:YYYY-MM-DD]</decision_date>
  <currency_code_local>AED</currency_code_local>
  <reporting_person>
    <title>Mr</title>
    <first_name>[REPLACE_BEFORE_FILING:MLRO_FIRSTNAME]</first_name>
    <last_name>[REPLACE_BEFORE_FILING:MLRO_LASTNAME]</last_name>
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
        <subjectid>1</subjectid>
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
        <transactionnumber>${reportRef}-TXN-1</transactionnumber>
        <transaction_number>${reportRef}-TXN-1</transaction_number>
        <transaction_date>[REPLACE_BEFORE_FILING:YYYY-MM-DD]</transaction_date>
        <teller>1</teller>
        <transmode_code>C</transmode_code>
        <transaction_location>UAE</transaction_location>
        <t_from_my_client>1</t_from_my_client>
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
  "CBUAE registration number (filing_institution) has been verified against the goAML portal.",
  "decision_date reflects the date the MLRO formally decided to file the STR.",
  "action_code is set to 1 (Initial) or 2 (Supplementary) as appropriate.",
];

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req, { cost: 2 });
  if (!gate.ok) return gate.response;

  let body: GoAmlXmlInput;
  try {
    body = (await req.json()) as GoAmlXmlInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: gate.headers });
  }

  const now = new Date();
  const submissionDate = now.toISOString().split("T")[0]!;
  const ts = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const reportRef = `UAE-STR-${now.getUTCFullYear()}-${ts}`;

  // ── TASK 2: Resolve env vars and check required ones are present ──
  const { reportingEntityCode, cbuaeRegistrationNumber, mlroEmail, missingVars } =
    resolveEnvVars(body ?? ({} as GoAmlXmlInput));

  if (missingVars.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_env_vars",
        message:
          "Cannot generate goAML XML: required environment variables are not configured. " +
          "Set the following variables in your deployment environment before filing:",
        missingVars,
        hint: {
          REPORTING_ENTITY_CODE: "Your UAE FIU-assigned goAML reporting entity ID (e.g. UAE-DPMS-00123)",
          CBUAE_REGISTRATION_NUMBER: "Your CBUAE registration number as it appears on your licence",
          MLRO_EMAIL: "The MLRO email address registered with the UAE FIU goAML portal",
        },
      },
      { status: 400, headers: gate.headers },
    );
  }

  // ── TASK 3: Pre-flight validation before XML generation ──────────
  const preflightErrors = preflightValidate(body ?? ({} as GoAmlXmlInput), mlroEmail);
  if (preflightErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "preflight_validation_failed",
        message:
          "goAML XML generation blocked: the submission data does not meet minimum UAE FIU filing requirements. " +
          "Resolve all field errors before retrying.",
        fieldErrors: preflightErrors,
        regulatoryBasis: "UAE FDL 10/2025 Art.17; UAE FIU goAML Technical Guide v3.1; FATF R.20",
      },
      { status: 422, headers: gate.headers },
    );
  }

  const { errors, warnings } = validate(body ?? ({} as GoAmlXmlInput));

  let xml: string;
  let degradedReason: string | undefined;
  if (errors.length > 0) {
    // Return fallback with placeholders so the operator can see the structure
    // even when validation fails. The checklist calls out the errors explicitly.
    xml = buildFallbackXml(reportRef, submissionDate);
    degradedReason = `validation produced ${errors.length} error(s) — placeholder XML emitted; do NOT submit until fixed`;
  } else {
    try {
      xml = buildXml(body, reportRef, submissionDate, reportingEntityCode, cbuaeRegistrationNumber, mlroEmail);
    } catch (err) {
      console.error("[goaml-xml] serialise error", err instanceof Error ? err.message : String(err));
      xml = buildFallbackXml(reportRef, submissionDate);
      degradedReason = "XML serialisation failed — placeholder XML emitted; do NOT submit until fixed";
    }
  }

  // XSD structural validation — only run against successfully built XML (not fallback/degraded).
  if (!degradedReason) {
    const xsdErrors = validateGoamlXmlStructure(xml);
    const xsdErrorsOnly = xsdErrors.filter(e => e.severity === 'error');
    if (xsdErrorsOnly.length > 0) {
      return NextResponse.json({
        ok: false,
        error: 'GOAML_XSD_INVALID',
        message: 'Generated XML fails structural validation. Correct the envelope data before filing.',
        errors: xsdErrors,
        errorCount: xsdErrorsOnly.length,
        warningCount: xsdErrors.filter(e => e.severity === 'warning').length,
      }, { status: 422, headers: gate.headers });
    }
  }

  const result: GoAmlXmlResult = {
    ok: true,
    xml,
    validationErrors: errors,
    validationWarnings: warnings,
    reportRef,
    submissionChecklist: SUBMISSION_CHECKLIST,
    ...(degradedReason ? { degraded: true as const, degradedReason } : {}),
  };

  void writeAuditChainEntry(
    { event: "goaml.xml_generated", actor: gate.keyId, meta: { reportRef, subjectName: body.subjectName } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(result, {
    status: 200,
    headers: {
      ...gate.headers,
      "cache-control": "no-store",
      "x-goaml-schema-version": getGoamlSchemaVersion(),
    },
  });
}
