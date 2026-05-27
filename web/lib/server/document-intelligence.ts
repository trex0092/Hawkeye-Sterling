// Hawkeye Sterling — Document Intelligence
//
// Provides keyword-based document classification, regex entity extraction,
// cross-reference against a screening subject, and connector stubs for
// Jumio and Onfido identity verification APIs.
//
// Activated via env vars:
//   JUMIO_API_KEY + JUMIO_API_SECRET  → Jumio connector
//   ONFIDO_API_TOKEN                  → Onfido connector

import type { Subject } from "@/lib/types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type DocumentType =
  | "passport"
  | "national_id"
  | "driving_license"
  | "utility_bill"
  | "bank_statement"
  | "corporate_certificate"
  | "tax_document"
  | "source_of_wealth"
  | "unknown";

export interface ExtractedEntity {
  type: "person_name" | "date" | "amount" | "address" | "id_number" | "company_name" | "country";
  value: string;
  confidence: number; // 0-1
}

export interface DocumentAnalysis {
  documentType: DocumentType;
  extractedEntities: ExtractedEntity[];
  rawText: string;
  language: string;
  pageCount: number;
  validationFlags: string[]; // e.g. "EXPIRY_DATE_PAST", "LOW_CONFIDENCE", "POSSIBLE_ALTERATION"
  crossReferenceMatches: {
    field: string;
    documentValue: string;
    subjectValue: string;
    match: boolean;
  }[];
  analysisAt: string;
  provider: "internal" | "jumio" | "onfido";
}

export interface KycConnectorConfig {
  provider: "jumio" | "onfido";
  apiKey: string;
  baseUrl: string;
}

export interface KycVerifyResult {
  verified: boolean;
  score: number;
  details: unknown;
}

export interface KycConnector {
  verifyIdentity(_documentBase64: string, _faceBase64?: string): Promise<KycVerifyResult>;
}

// ─── Known country list ───────────────────────────────────────────────────────

const KNOWN_COUNTRIES = new Set([
  "afghanistan", "albania", "algeria", "andorra", "angola", "argentina", "armenia", "australia",
  "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "belarus", "belgium", "belize",
  "benin", "bolivia", "bosnia", "botswana", "brazil", "brunei", "bulgaria", "burkina faso",
  "burundi", "cambodia", "cameroon", "canada", "cape verde", "chad", "chile", "china",
  "colombia", "comoros", "congo", "costa rica", "croatia", "cuba", "cyprus", "czech republic",
  "denmark", "djibouti", "dominican republic", "ecuador", "egypt", "el salvador", "eritrea",
  "estonia", "ethiopia", "fiji", "finland", "france", "gabon", "gambia", "georgia", "germany",
  "ghana", "greece", "guatemala", "guinea", "guyana", "haiti", "honduras", "hungary", "iceland",
  "india", "indonesia", "iran", "iraq", "ireland", "israel", "italy", "jamaica", "japan",
  "jordan", "kazakhstan", "kenya", "kuwait", "kyrgyzstan", "laos", "latvia", "lebanon",
  "lesotho", "liberia", "libya", "liechtenstein", "lithuania", "luxembourg", "madagascar",
  "malawi", "malaysia", "maldives", "mali", "malta", "mauritania", "mauritius", "mexico",
  "moldova", "monaco", "mongolia", "morocco", "mozambique", "myanmar", "namibia", "nepal",
  "netherlands", "new zealand", "nicaragua", "niger", "nigeria", "north korea", "norway",
  "oman", "pakistan", "palestine", "panama", "paraguay", "peru", "philippines", "poland",
  "portugal", "qatar", "romania", "russia", "rwanda", "saudi arabia", "senegal", "serbia",
  "sierra leone", "singapore", "slovakia", "slovenia", "somalia", "south africa", "south korea",
  "south sudan", "spain", "sri lanka", "sudan", "sweden", "switzerland", "syria", "taiwan",
  "tajikistan", "tanzania", "thailand", "togo", "trinidad and tobago", "tunisia", "turkey",
  "turkmenistan", "uganda", "ukraine", "united arab emirates", "uae", "united kingdom", "uk",
  "united states", "usa", "uruguay", "uzbekistan", "venezuela", "vietnam", "yemen", "zambia",
  "zimbabwe",
]);

// ─── classifyDocument ─────────────────────────────────────────────────────────

export function classifyDocument(text: string): DocumentType {
  const lower = text.toLowerCase();

  // Passport signals
  if (/passport\s+number|type\s+p\b|machine\s+readable\s+travel|mrz|biometric\s+passport/.test(lower)) {
    return "passport";
  }

  // Driving licence signals
  if (/driving\s+licen[cs]e|driver['s]*\s+licen[cs]e|driving\s+permit|motor\s+vehicle\s+licen/.test(lower)) {
    return "driving_license";
  }

  // National ID
  if (/national\s+id(?:entity)?\s+card|emirates\s+id|national\s+identification|id\s+number|identity\s+card/.test(lower)) {
    return "national_id";
  }

  // Corporate certificate
  if (/certificate\s+of\s+incorp(?:oration)?|articles\s+of\s+(?:incorp|assoc)|memorandum\s+of\s+association|commercial\s+register|trade\s+licen/.test(lower)) {
    return "corporate_certificate";
  }

  // Bank statement
  if (/bank\s+statement|account\s+statement|statement\s+of\s+account/.test(lower) ||
      (/\bbank\b/.test(lower) && /\bstatement\b/.test(lower))) {
    return "bank_statement";
  }

  // Tax document
  if (/tax\s+return|tax\s+clearance|income\s+tax|vat\s+certificate|tax\s+identification|tin\b|irs\s+form/.test(lower)) {
    return "tax_document";
  }

  // Utility bill
  if (/utility\s+bill|electricity\s+bill|water\s+bill|gas\s+bill|dewa|addc|phone\s+bill|telecom\s+invoice/.test(lower)) {
    return "utility_bill";
  }

  // Source of wealth
  if (/source\s+of\s+(?:wealth|funds)|wealth\s+declaration|sow\b|sof\b|declaration\s+of\s+(?:wealth|income)/.test(lower)) {
    return "source_of_wealth";
  }

  return "unknown";
}

// ─── extractEntities ──────────────────────────────────────────────────────────

export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Dates — ISO 8601 (YYYY-MM-DD)
  const isoDate = /\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/g;
  for (const m of text.matchAll(isoDate)) {
    entities.push({ type: "date", value: m[1]!, confidence: 0.95 });
  }

  // Dates — DD/MM/YYYY or DD-MM-YYYY
  const dmy = /\b((?:0[1-9]|[12]\d|3[01])[\/\-](?:0[1-9]|1[0-2])[\/\-](?:19|20)\d{2})\b/g;
  for (const m of text.matchAll(dmy)) {
    entities.push({ type: "date", value: m[1]!, confidence: 0.9 });
  }

  // Dates — DD-Mon-YYYY (e.g. 12-Jan-2020, 01 February 2023)
  const monDate = /\b((?:0[1-9]|[12]\d|3[01])[\s\-](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s\-]((?:19|20)\d{2}))\b/gi;
  for (const m of text.matchAll(monDate)) {
    entities.push({ type: "date", value: m[1]!, confidence: 0.9 });
  }

  // Person names — 2-4 consecutive ALL-CAPS words (>=2 chars each), not common keywords
  const namePattern = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b/g;
  const nameStopWords = new Set([
    "UAE", "USA", "UK", "ID", "DOB", "MRZ", "ATM", "PO", "CO", "LTD", "LLC",
    "INC", "PLC", "THE", "AND", "FOR", "OF", "AT", "BY", "TO", "IN",
  ]);
  for (const m of text.matchAll(namePattern)) {
    const candidate = m[1]!;
    const words = candidate.split(/\s+/);
    if (words.every((w) => !nameStopWords.has(w))) {
      entities.push({ type: "person_name", value: candidate, confidence: 0.75 });
    }
  }

  // Amounts — currency prefix or suffix + number
  const amountPattern = /\b((?:AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR|CHF|JPY|CNY|INR)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR|CHF|JPY|CNY|INR))\b/g;
  for (const m of text.matchAll(amountPattern)) {
    entities.push({ type: "amount", value: m[1]!, confidence: 0.9 });
  }

  // ID numbers — alphanumeric codes matching passport/ID patterns
  // Passport: 1-2 letters + 6-9 digits, or 9 alphanumeric chars
  const idPattern = /\b([A-Z]{1,2}[0-9]{6,9}|[A-Z0-9]{8,12})\b/g;
  const idStopWords = new Set(["ABCDEFGHIJ", "XXXXXXXXXX"]);
  for (const m of text.matchAll(idPattern)) {
    const val = m[1]!;
    // Must contain at least one digit and one letter; skip pure alpha
    if (/[A-Z]/.test(val) && /[0-9]/.test(val) && !idStopWords.has(val)) {
      entities.push({ type: "id_number", value: val, confidence: 0.7 });
    }
  }

  // Countries — from fixed list
  const lower = text.toLowerCase();
  for (const country of KNOWN_COUNTRIES) {
    // Check word-boundary match
    const re = new RegExp(`\\b${country.replace(/\s+/g, "\\s+")}\\b`, "i"); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
    if (re.test(lower)) {
      entities.push({
        type: "country",
        value: country.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        confidence: 0.85,
      });
    }
  }

  // Deduplicate by type+value
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.type}:${e.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── crossReferenceWithSubject ────────────────────────────────────────────────

export function crossReferenceWithSubject(
  entities: ExtractedEntity[],
  subject: Subject,
): DocumentAnalysis["crossReferenceMatches"] {
  const matches: DocumentAnalysis["crossReferenceMatches"] = [];

  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

  const subjectNorm = normalise(subject.name);
  const aliases = (subject.aliases ?? []).map(normalise);
  const subjectCountryNorm = normalise(subject.country);

  // Match person names against subject.name and aliases
  const nameEntities = entities.filter((e) => e.type === "person_name");
  for (const entity of nameEntities) {
    const docNorm = normalise(entity.value);
    const nameMatch =
      docNorm === subjectNorm ||
      aliases.some((a) => a === docNorm) ||
      subjectNorm.includes(docNorm) ||
      docNorm.includes(subjectNorm);
    matches.push({
      field: "name",
      documentValue: entity.value,
      subjectValue: subject.name,
      match: nameMatch,
    });
  }

  // Match countries against subject.country
  const countryEntities = entities.filter((e) => e.type === "country");
  for (const entity of countryEntities) {
    const docNorm = normalise(entity.value);
    const countryMatch = docNorm === subjectCountryNorm || subjectCountryNorm.includes(docNorm);
    matches.push({
      field: "country",
      documentValue: entity.value,
      subjectValue: subject.country,
      match: countryMatch,
    });
  }

  // Match against subject.meta (may contain DOB, nationality, etc.)
  if (subject.meta) {
    const metaNorm = normalise(subject.meta);
    // Check if any date entities appear in meta
    const dateEntities = entities.filter((e) => e.type === "date");
    for (const entity of dateEntities) {
      const docDateNorm = normalise(entity.value);
      if (metaNorm.includes(docDateNorm)) {
        matches.push({
          field: "date",
          documentValue: entity.value,
          subjectValue: subject.meta,
          match: true,
        });
      }
    }
  }

  return matches;
}

// ─── Validation flags ─────────────────────────────────────────────────────────

function computeValidationFlags(
  entities: ExtractedEntity[],
  documentType: DocumentType,
): string[] {
  const flags: string[] = [];

  // Check overall confidence
  const avgConfidence =
    entities.length > 0
      ? entities.reduce((s, e) => s + e.confidence, 0) / entities.length
      : 0;
  if (avgConfidence < 0.6) flags.push("LOW_CONFIDENCE");

  // Check for past expiry dates in date fields
  const dateEntities = entities.filter((e) => e.type === "date");
  for (const entity of dateEntities) {
    // Try to parse the date value
    const d = new Date(entity.value);
    if (!isNaN(d.getTime()) && d < new Date()) {
      // Could be DOB (past is normal) or expiry (past is a flag)
      // Heuristic: if doc type is passport/id/driving_license and date is < now, flag
      if (
        (documentType === "passport" ||
          documentType === "national_id" ||
          documentType === "driving_license") &&
        d.getFullYear() > 1970
      ) {
        // Only flag if it looks like a future-oriented date (expiry)
        // that happened to be in the past (year > current - 15)
        const yearsAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (yearsAgo < 15 && yearsAgo > 0) {
          flags.push("EXPIRY_DATE_PAST");
          break;
        }
      }
    }
  }

  // Unknown doc type
  if (documentType === "unknown") flags.push("UNCLASSIFIED_DOCUMENT");

  return [...new Set(flags)];
}

// ─── Detect language heuristic ────────────────────────────────────────────────

function detectLanguage(text: string): string {
  // Simple heuristic: check for Arabic characters
  if (/[؀-ۿ]/.test(text)) return "ar";
  // Check for common French words
  if (/\b(?:le|la|les|de|du|des|et|ou|un|une)\b/i.test(text)) return "fr";
  // Default English
  return "en";
}

// ─── analyzeDocument ──────────────────────────────────────────────────────────

export function analyzeDocument(text: string, subject?: Subject): DocumentAnalysis {
  const documentType = classifyDocument(text);
  const extractedEntities = extractEntities(text);
  const validationFlags = computeValidationFlags(extractedEntities, documentType);
  const crossReferenceMatches = subject
    ? crossReferenceWithSubject(extractedEntities, subject)
    : [];
  const language = detectLanguage(text);

  // Estimate page count from form feeds or double newlines
  const pageCount = Math.max(1, (text.match(/\f/g) ?? []).length + 1);

  return {
    documentType,
    extractedEntities,
    rawText: text,
    language,
    pageCount,
    validationFlags,
    crossReferenceMatches,
    analysisAt: new Date().toISOString(),
    provider: "internal",
  };
}

// ─── KYC Connectors ───────────────────────────────────────────────────────────

export function buildJumioConnector(config: KycConnectorConfig): KycConnector {
  return {
    async verifyIdentity(documentBase64: string, faceBase64?: string): Promise<KycVerifyResult> {
      try {
        const credentials = Buffer.from(
          `${config.apiKey}:${process.env["JUMIO_API_SECRET"] ?? ""}`,
        ).toString("base64");

        const payload = {
          type: "IDCARD",
          country: "XXX",
          ...(faceBase64 ? { face: faceBase64 } : {}),
          document: documentBase64,
        };

        const res = await fetch(`${config.baseUrl}/api/netverify/v2/initiateVerification`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          return { verified: false, score: 0, details: { error: errText, status: res.status } };
        }

        const data = (await res.json()) as Record<string, unknown>;
        const verified = data["decision"] === "PASSED" || data["status"] === "APPROVED";
        const score = typeof data["similarity"] === "number" ? (data["similarity"] as number) : 0;
        return { verified, score, details: data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { verified: false, score: 0, details: { error: message } };
      }
    },
  };
}

export function buildOnfidoConnector(config: KycConnectorConfig): KycConnector {
  return {
    async verifyIdentity(documentBase64: string, faceBase64?: string): Promise<KycVerifyResult> {
      try {
        const payload = {
          applicant_id: "hawkeye-kyc",
          document_ids: [documentBase64],
          ...(faceBase64 ? { live_photo_ids: [faceBase64] } : {}),
          report_names: ["document", ...(faceBase64 ? ["facial_similarity_photo"] : [])],
        };

        const res = await fetch(`${config.baseUrl}/v3/checks`, {
          method: "POST",
          headers: {
            Authorization: `Token token=${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          return { verified: false, score: 0, details: { error: errText, status: res.status } };
        }

        const data = (await res.json()) as Record<string, unknown>;
        const result = data["result"] as string | undefined;
        const verified = result === "clear" || result === "consider";
        const score =
          typeof data["properties"] === "object" &&
          data["properties"] !== null &&
          typeof (data["properties"] as Record<string, unknown>)["facial_similarity_score"] === "number"
            ? (data["properties"] as Record<string, unknown>)["facial_similarity_score"] as number
            : 0;
        return { verified, score, details: data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { verified: false, score: 0, details: { error: message } };
      }
    },
  };
}

// ─── getActiveKycProvider ─────────────────────────────────────────────────────

export function getActiveKycProvider(): { connector: KycConnector; provider: "jumio" | "onfido" } | null {
  const jumioKey = process.env["JUMIO_API_KEY"];
  const jumioSecret = process.env["JUMIO_API_SECRET"];
  if (jumioKey && jumioSecret) {
    const connector = buildJumioConnector({
      provider: "jumio",
      apiKey: jumioKey,
      baseUrl: process.env["JUMIO_BASE_URL"] ?? "https://netverify.com",
    });
    return { connector, provider: "jumio" };
  }

  const onfidoToken = process.env["ONFIDO_API_TOKEN"];
  if (onfidoToken) {
    const connector = buildOnfidoConnector({
      provider: "onfido",
      apiKey: onfidoToken,
      baseUrl: process.env["ONFIDO_BASE_URL"] ?? "https://api.onfido.com",
    });
    return { connector, provider: "onfido" };
  }

  return null;
}
