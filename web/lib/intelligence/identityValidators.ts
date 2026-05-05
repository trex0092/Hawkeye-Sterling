// Hawkeye Sterling — identity validators (Layers 46-60).
//
// Pure-function validators for the identity-data fields collected on the
// onboarding form. Each returns { ok, reason? } so the caller can fold
// the failure into the disposition engine's red-flag list.

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  detail?: string;
}

// 46. Document liveness / template detector — heuristic on metadata
export function validateLiveness(input: {
  livenessScore?: number;
  templateMatchScore?: number;
}): ValidationResult {
  if (typeof input.livenessScore === "number" && input.livenessScore < 0.7) {
    return { ok: false, reason: "liveness_too_low", detail: `${(input.livenessScore * 100).toFixed(0)}% < 70% threshold` };
  }
  if (typeof input.templateMatchScore === "number" && input.templateMatchScore < 0.7) {
    return { ok: false, reason: "template_mismatch", detail: `${(input.templateMatchScore * 100).toFixed(0)}% < 70% threshold` };
  }
  return { ok: true };
}

// 47. Selfie face match scorer
export function validateFaceMatch(score?: number, threshold = 0.7): ValidationResult {
  if (typeof score !== "number") return { ok: false, reason: "no_face_match", detail: "no face-match score provided" };
  if (score < threshold) return { ok: false, reason: "face_match_too_low", detail: `${(score * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%` };
  return { ok: true };
}

// 48. ID OCR + MRZ checker (ICAO 9303 checksum)
export function validateMrz(mrz: string): ValidationResult {
  if (!mrz) return { ok: false, reason: "no_mrz", detail: "no MRZ provided" };
  // ICAO 9303 weight pattern 7-3-1 over digits + letters (A=10..Z=35) + filler "<"=0
  const value = (c: string): number => {
    if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
    if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
    if (c === "<") return 0;
    return -1;
  };
  const w = [7, 3, 1];
  const checksum = (data: string, expectedDigit: string): boolean => {
    let total = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = value(data[i]!);
      if (v < 0) return false;
      total += v * w[i % 3]!;
    }
    return total % 10 === Number(expectedDigit);
  };
  // Crude: validate doc-number checksum on TD3 (passport) line 2 positions 1-9 + 10
  const lines = mrz.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 2 && lines[0]!.length === 44 && lines[1]!.length === 44) {
    const docNumber = lines[1]!.slice(0, 9);
    const checkDigit = lines[1]!.slice(9, 10);
    if (!checksum(docNumber, checkDigit)) {
      return { ok: false, reason: "mrz_checksum_invalid", detail: "TD3 doc-number checksum failed" };
    }
  } else if (lines.length !== 0) {
    return { ok: false, reason: "mrz_format_unrecognised", detail: `MRZ format not TD3 (got ${lines.length} lines)` };
  }
  return { ok: true };
}

// 49. Date-of-birth plausibility (age 0-120)
export function validateDob(iso: string | null | undefined, nowMs = Date.now()): ValidationResult {
  if (!iso) return { ok: false, reason: "no_dob" };
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { ok: false, reason: "dob_unparseable" };
  const ageMs = nowMs - t;
  const ageY = ageMs / (365.25 * 86400000);
  if (ageY < 0) return { ok: false, reason: "dob_in_future" };
  if (ageY > 120) return { ok: false, reason: "dob_implausible_age", detail: `age ${ageY.toFixed(1)}y > 120` };
  if (ageY < 16) return { ok: false, reason: "below_kyc_age", detail: `age ${ageY.toFixed(1)}y < 16` };
  return { ok: true };
}

// 50. Name script detector
export type NameScript = "latin" | "arabic" | "cyrillic" | "han" | "devanagari" | "hebrew" | "greek" | "thai" | "mixed" | "unknown";
export function detectNameScript(name: string): NameScript {
  if (!name) return "unknown";
  const counts: Record<string, number> = { latin: 0, arabic: 0, cyrillic: 0, han: 0, devanagari: 0, hebrew: 0, greek: 0, thai: 0 };
  for (const ch of name) {
    const c = ch.charCodeAt(0);
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) counts.latin! += 1;
    else if (c >= 0x600 && c <= 0x6ff) counts.arabic! += 1;
    else if (c >= 0x400 && c <= 0x4ff) counts.cyrillic! += 1;
    else if (c >= 0x4e00 && c <= 0x9fff) counts.han! += 1;
    else if (c >= 0x900 && c <= 0x97f) counts.devanagari! += 1;
    else if (c >= 0x590 && c <= 0x5ff) counts.hebrew! += 1;
    else if (c >= 0x370 && c <= 0x3ff) counts.greek! += 1;
    else if (c >= 0xe00 && c <= 0xe7f) counts.thai! += 1;
  }
  const present = Object.entries(counts).filter(([, v]) => v > 0);
  if (present.length === 0) return "unknown";
  if (present.length > 1) return "mixed";
  return present[0]![0] as NameScript;
}

// 51. Name character-set normalizer (for matching)
export function normaliseScript(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ـ]/g, "")  // Arabic tatweel
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// 52. Address normaliser (postal-style)
export function normaliseAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\b(?:street|str\.|st\.)\b/g, "st")
    .replace(/\b(?:road|rd\.)\b/g, "rd")
    .replace(/\b(?:avenue|ave\.)\b/g, "ave")
    .replace(/\b(?:apartment|apt\.)\b/g, "apt")
    .replace(/\b(?:suite|ste\.)\b/g, "ste")
    .replace(/\bp\.?o\.?\s*box\b/g, "po box")
    .replace(/[,.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 53. Phone E.164 + jurisdiction matcher
const COUNTRY_CC: Record<string, string> = {
  AE: "971", PK: "92", IN: "91", US: "1", GB: "44", FR: "33", DE: "49",
  CN: "86", RU: "7", IR: "98", KP: "850", SY: "963", CU: "53",
};
export function validatePhone(phone: string, declaredIso2?: string): ValidationResult {
  if (!phone) return { ok: false, reason: "no_phone" };
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (!cleaned.startsWith("+") || cleaned.length < 7 || cleaned.length > 16) {
    return { ok: false, reason: "phone_format_invalid" };
  }
  if (declaredIso2 && COUNTRY_CC[declaredIso2.toUpperCase()]) {
    const expected = COUNTRY_CC[declaredIso2.toUpperCase()]!;
    if (!cleaned.startsWith(`+${expected}`)) {
      return {
        ok: false,
        reason: "phone_country_mismatch",
        detail: `declared ${declaredIso2} expects +${expected}, phone is ${cleaned.slice(0, 5)}…`,
      };
    }
  }
  return { ok: true };
}

// 54. Disposable / role-account email detectors
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com",
  "trash-mail.com", "yopmail.com", "throwawaymail.com", "maildrop.cc",
  "getnada.com", "fakemail.net", "tempr.email",
]);
const ROLE_LOCAL_PARTS = new Set([
  "admin", "info", "contact", "support", "sales", "billing", "noreply",
  "no-reply", "postmaster", "abuse", "webmaster", "office", "hello",
]);
export function validateEmail(email: string): ValidationResult {
  if (!email) return { ok: false, reason: "no_email" };
  const m = email.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!m) return { ok: false, reason: "email_format_invalid" };
  const local = m[1]!.toLowerCase();
  const domain = m[2]!.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: "email_disposable", detail: domain };
  const baseLocal = local.replace(/\+.*$/, "").replace(/[^a-z]/g, "");
  if (ROLE_LOCAL_PARTS.has(baseLocal)) return { ok: false, reason: "email_role_account", detail: local };
  return { ok: true };
}

// 55. Tax-ID checksum validators
export function validateTaxId(taxId: string, kind: "uae_trn" | "us_ein" | "gb_utr" | "in_pan" | "auto"): ValidationResult {
  if (!taxId) return { ok: false, reason: "no_tax_id" };
  const cleaned = taxId.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  switch (kind) {
    case "uae_trn":
      if (!/^\d{15}$/.test(cleaned)) return { ok: false, reason: "uae_trn_format", detail: "UAE TRN must be 15 digits" };
      return { ok: true };
    case "us_ein":
      if (!/^\d{9}$/.test(cleaned)) return { ok: false, reason: "us_ein_format", detail: "US EIN must be 9 digits" };
      return { ok: true };
    case "gb_utr":
      if (!/^\d{10}$/.test(cleaned)) return { ok: false, reason: "gb_utr_format", detail: "GB UTR must be 10 digits" };
      return { ok: true };
    case "in_pan":
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(cleaned)) return { ok: false, reason: "in_pan_format", detail: "IN PAN format AAAAA9999A" };
      return { ok: true };
    case "auto":
      if (/^\d{15}$/.test(cleaned)) return { ok: true };
      if (/^\d{9}$/.test(cleaned)) return { ok: true };
      if (/^[A-Z]{5}\d{4}[A-Z]$/.test(cleaned)) return { ok: true };
      return { ok: false, reason: "tax_id_unrecognised" };
  }
}

// 56-60. Document format validators (passport, national ID, DL, BC, residence)
export function validatePassportNumber(num: string): ValidationResult {
  if (!num) return { ok: false, reason: "no_passport" };
  // Most passport numbers are 6-9 alphanumerics
  if (!/^[A-Z0-9]{6,9}$/i.test(num)) return { ok: false, reason: "passport_format" };
  return { ok: true };
}
export function validateNationalId(num: string, iso2?: string): ValidationResult {
  if (!num) return { ok: false, reason: "no_national_id" };
  const c = num.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  if (iso2 === "AE" && !/^\d{15}$/.test(c)) return { ok: false, reason: "uae_eid_format", detail: "UAE Emirates ID is 15 digits" };
  if (iso2 === "IN" && !/^\d{12}$/.test(c)) return { ok: false, reason: "in_aadhaar_format", detail: "IN Aadhaar is 12 digits" };
  if (iso2 === "US" && !/^\d{9}$/.test(c)) return { ok: false, reason: "us_ssn_format", detail: "US SSN is 9 digits" };
  return { ok: true };
}
export function validateDrivingLicence(num: string): ValidationResult {
  if (!num) return { ok: false, reason: "no_dl" };
  if (num.length < 5 || num.length > 20) return { ok: false, reason: "dl_format_invalid" };
  return { ok: true };
}
export function validateBirthCertificate(input: { number?: string; issuingAuthority?: string; issuedAt?: string }): ValidationResult {
  if (!input.number || !input.issuingAuthority) return { ok: false, reason: "bc_incomplete" };
  return { ok: true };
}
export function validateResidencePermit(input: { number?: string; expiresAt?: string }): ValidationResult {
  if (!input.number) return { ok: false, reason: "rp_no_number" };
  if (input.expiresAt) {
    const exp = Date.parse(input.expiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) return { ok: false, reason: "rp_expired", detail: input.expiresAt };
  }
  return { ok: true };
}
