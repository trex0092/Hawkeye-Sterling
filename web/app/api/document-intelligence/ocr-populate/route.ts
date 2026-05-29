// POST /api/document-intelligence/ocr-populate
//
// Document OCR auto-population endpoint.
// Takes a base64-encoded document image and returns structured extracted fields
// to auto-populate a subject onboarding form.
//
// Uses the existing document-intelligence library (analyzeDocument +
// extractEntities) to parse text content and map it to canonical fields.
// Normalises dates to YYYY-MM-DD and nationality to ISO-2.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  analyzeDocument,
  extractEntities,
  type DocumentType,
} from "@/lib/server/document-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type InputDocumentType = "passport" | "national_id" | "drivers_license" | "corporate_cert";

interface OcrPopulateRequest {
  documentBase64: string;
  documentType?: InputDocumentType;
}

interface ExtractedFields {
  name?: string;
  dob?: string;               // YYYY-MM-DD
  nationality?: string;       // ISO-2
  documentNumber?: string;
  expiryDate?: string;        // YYYY-MM-DD
  issueDate?: string;         // YYYY-MM-DD
  address?: string;
  entityName?: string;        // for corporate docs
  registrationNumber?: string;
}

interface OcrPopulateResponse {
  ok: true;
  extractedFields: ExtractedFields;
  confidence: number;
  documentType: string;
  warnings: string[];
}

// ─── Country name → ISO-2 mapping ─────────────────────────────────────────────

const COUNTRY_ISO2: Record<string, string> = {
  "United Arab Emirates": "AE",
  UAE: "AE",
  "United Kingdom": "GB",
  UK: "GB",
  "United States": "US",
  USA: "US",
  Australia: "AU",
  Singapore: "SG",
  India: "IN",
  Pakistan: "PK",
  China: "CN",
  France: "FR",
  Germany: "DE",
  Italy: "IT",
  Spain: "ES",
  Canada: "CA",
  Brazil: "BR",
  Russia: "RU",
  Turkey: "TR",
  Egypt: "EG",
  Nigeria: "NG",
  "Saudi Arabia": "SA",
  Jordan: "JO",
  Lebanon: "LB",
  Iran: "IR",
  Iraq: "IQ",
  Syria: "SY",
  Morocco: "MA",
  Tunisia: "TN",
  Algeria: "DZ",
  Kenya: "KE",
  "South Africa": "ZA",
  Philippines: "PH",
  Malaysia: "MY",
  Indonesia: "ID",
  Thailand: "TH",
  Vietnam: "VN",
  Bangladesh: "BD",
  "Sri Lanka": "LK",
  Nepal: "NP",
  Ethiopia: "ET",
  Ghana: "GH",
  Cameroon: "CM",
  Zimbabwe: "ZW",
  Uganda: "UG",
  Tanzania: "TZ",
  Qatar: "QA",
  Kuwait: "KW",
  Bahrain: "BH",
  Oman: "OM",
  Yemen: "YE",
  Switzerland: "CH",
  Netherlands: "NL",
  Belgium: "BE",
  Sweden: "SE",
  Norway: "NO",
  Denmark: "DK",
  Finland: "FI",
  Poland: "PL",
  Portugal: "PT",
  Greece: "GR",
  Romania: "RO",
  Ukraine: "UA",
  "Czech Republic": "CZ",
  Hungary: "HU",
  Austria: "AT",
  Japan: "JP",
  "South Korea": "KR",
  "North Korea": "KP",
  Taiwan: "TW",
  "New Zealand": "NZ",
  Mexico: "MX",
  Argentina: "AR",
  Colombia: "CO",
  Chile: "CL",
  Peru: "PE",
  Venezuela: "VE",
  Cuba: "CU",
  Israel: "IL",
  Afghanistan: "AF",
  Kazakhstan: "KZ",
  Uzbekistan: "UZ",
  Myanmar: "MM",
  Cambodia: "KH",
};

// ─── Date normalisation ───────────────────────────────────────────────────────

function normaliseDate(raw: string): string | undefined {
  if (!raw) return undefined;

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1]!.padStart(2, "0");
    const m = dmy[2]!.padStart(2, "0");
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  // DD Mon YYYY (e.g. 12 Jan 2020, 01 February 2023)
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const monthDate = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (monthDate) {
    const d = monthDate[1]!.padStart(2, "0");
    const mKey = monthDate[2]!.toLowerCase();
    const m = months[mKey];
    const y = monthDate[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // Try native parse as last resort
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  } catch {
    // ignore
  }

  return undefined;
}

// ─── Map document type ────────────────────────────────────────────────────────

function mapDocumentType(
  hint: InputDocumentType | undefined,
  detected: DocumentType,
): string {
  if (hint) {
    const hintMap: Record<InputDocumentType, string> = {
      passport: "passport",
      national_id: "national_id",
      drivers_license: "driving_license",
      corporate_cert: "corporate_certificate",
    };
    return hintMap[hint];
  }
  return detected;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, cost: 2 });
  if (!gate.ok) return gate.response;

  let body: OcrPopulateRequest;
  try {
    body = (await req.json()) as OcrPopulateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.documentBase64?.trim()) {
    return NextResponse.json({ ok: false, error: "documentBase64 is required" }, { status: 400, headers: gate.headers });
  }

  // Decode base64 → text. For a real production system this would run OCR
  // (Tesseract, Google Vision, AWS Textract). Here we decode the base64 which
  // may contain pre-extracted text content or a text-encoded document.
  let documentText: string;
  const warnings: string[] = [];

  try {
    const decoded = Buffer.from(body.documentBase64, "base64").toString("utf8");
    documentText = decoded;
  } catch {
    return NextResponse.json(
      { ok: false, error: "documentBase64 is not valid base64 data" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!documentText.trim()) {
    warnings.push("Decoded document content is empty — OCR extraction yielded no text.");
    const empty: OcrPopulateResponse = {
      ok: true,
      extractedFields: {},
      confidence: 0,
      documentType: body.documentType ? mapDocumentType(body.documentType, "unknown") : "unknown",
      warnings,
    };
    return NextResponse.json(empty, { headers: gate.headers });
  }

  // Run document analysis
  const analysis = analyzeDocument(documentText);
  const entities = extractEntities(documentText);

  const resolvedType = mapDocumentType(body.documentType, analysis.documentType);
  const isCorporate = resolvedType === "corporate_certificate";

  const extractedFields: ExtractedFields = {};

  // ── Extract person name or entity name ────────────────────────────────────
  const nameEntities = entities.filter((e) => e.type === "person_name");
  const companyEntities = entities.filter((e) => e.type === "company_name");

  if (isCorporate) {
    if (companyEntities.length > 0) {
      extractedFields.entityName = companyEntities[0]!.value;
    } else if (nameEntities.length > 0) {
      extractedFields.entityName = nameEntities[0]!.value;
    }
  } else {
    if (nameEntities.length > 0) {
      extractedFields.name = nameEntities[0]!.value;
    }
  }

  // ── Extract ID / document numbers ─────────────────────────────────────────
  const idEntities = entities.filter((e) => e.type === "id_number");
  if (idEntities.length > 0) {
    if (isCorporate) {
      extractedFields.registrationNumber = idEntities[0]!.value;
    } else {
      extractedFields.documentNumber = idEntities[0]!.value;
    }
  }

  // ── Extract dates ─────────────────────────────────────────────────────────
  const dateEntities = entities.filter((e) => e.type === "date");
  const normalisedDates = dateEntities
    .map((e) => normaliseDate(e.value))
    .filter((d): d is string => d !== undefined);

  // Heuristic: sort dates by year desc; first = most recent (likely expiry),
  // last = earliest (likely DOB or issue date).
  const sortedDates = [...normalisedDates].sort().reverse();

  if (!isCorporate) {
    if (sortedDates.length >= 2) {
      extractedFields.expiryDate = sortedDates[0];
      extractedFields.dob = sortedDates[sortedDates.length - 1];
      if (sortedDates.length >= 3) {
        extractedFields.issueDate = sortedDates[1];
      }
    } else if (sortedDates.length === 1) {
      // Single date: if it's in the future it's an expiry; otherwise DOB
      const year = parseInt(sortedDates[0]!.slice(0, 4), 10);
      if (year > new Date().getFullYear()) {
        extractedFields.expiryDate = sortedDates[0];
      } else {
        extractedFields.dob = sortedDates[0];
      }
    }
  } else {
    if (sortedDates.length > 0) {
      extractedFields.issueDate = sortedDates[sortedDates.length - 1];
    }
  }

  // ── Extract nationality (country → ISO-2) ─────────────────────────────────
  const countryEntities = entities.filter((e) => e.type === "country");
  if (countryEntities.length > 0 && !isCorporate) {
    const countryName = countryEntities[0]!.value;
    extractedFields.nationality = COUNTRY_ISO2[countryName] ?? countryName.slice(0, 2).toUpperCase();
  }

  // ── Extract address ───────────────────────────────────────────────────────
  const addrEntities = entities.filter((e) => e.type === "address");
  if (addrEntities.length > 0) {
    extractedFields.address = addrEntities[0]!.value;
  }

  // ── Compute overall confidence ────────────────────────────────────────────
  const relevantEntities = isCorporate
    ? [...companyEntities, ...nameEntities, ...idEntities]
    : [...nameEntities, ...idEntities, ...dateEntities];

  const avgConfidence =
    relevantEntities.length > 0
      ? relevantEntities.reduce((s, e) => s + e.confidence, 0) / relevantEntities.length
      : 0;

  // Add warnings for low-confidence or missing fields
  if (avgConfidence < 0.6) {
    warnings.push("Low confidence extraction — manual review of all fields is recommended.");
  }
  if (analysis.validationFlags.includes("EXPIRY_DATE_PAST")) {
    warnings.push("Document may be expired — expiry date appears to be in the past.");
  }
  if (analysis.validationFlags.includes("UNCLASSIFIED_DOCUMENT")) {
    warnings.push("Document type could not be determined from content.");
  }
  if (!isCorporate && !extractedFields.name) {
    warnings.push("Subject name could not be extracted — please enter manually.");
  }
  if (!isCorporate && !extractedFields.documentNumber) {
    warnings.push("Document number could not be extracted — please enter manually.");
  }
  if (isCorporate && !extractedFields.entityName) {
    warnings.push("Entity name could not be extracted — please enter manually.");
  }

  const response: OcrPopulateResponse = {
    ok: true,
    extractedFields,
    confidence: Math.round(avgConfidence * 100) / 100,
    documentType: resolvedType,
    warnings,
  };

  return NextResponse.json(response, { headers: gate.headers });
}
