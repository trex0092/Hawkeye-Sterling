import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  subjectName: string;
  documentType: "passport" | "emirates_id" | "driving_license" | "national_id";
  documentNumber: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  emailAddress?: string;
  phoneNumber?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  applicationChannel: "branch" | "digital" | "agent";
  timeToComplete?: number;
  documentImageQuality?: "high" | "medium" | "low" | "failed";
  previousApplications?: number;
  selfieMatchScore?: number;
}

type RiskLevel = "critical" | "high" | "medium" | "low";
type KycDecision = "approve" | "manual_review" | "reject";

interface IdentityRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  fraudIndicators: string[];
  verificationActions: string[];
  recommendation: string;
  kycDecision: KycDecision;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known VPN / datacenter / proxy CIDR ranges (IPv4 prefix match). */
const VPN_PROXY_PREFIXES: readonly string[] = [
  // Common datacenter ranges used by VPN providers
  "104.16.", "104.17.", "104.18.", "104.19.", "104.20.", "104.21.",  // Cloudflare
  "198.41.128.", "198.41.192.",
  "185.220.", "185.195.", "185.199.",    // Tor exit nodes / VPN services
  "45.142.", "45.153.", "45.154.",
  "162.247.",                            // Known Tor exit
  "199.87.",                             // Mullvad VPN
  "194.165.",                            // Common VPN range
  "176.103.", "176.9.",
  "10.0.", "10.1.", "10.2.", "10.3.",    // RFC 1918 private — unusual for direct digital
  "100.64.", "100.65.", "100.66.",       // CGNAT — often proxy
];

/** Disposable / temporary email domains. */
const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamail.info",
  "tempmail.com",
  "temp-mail.org",
  "throwam.com",
  "throwaway.email",
  "yopmail.com",
  "trashmail.com",
  "trashmail.me",
  "trashmail.net",
  "sharklasers.com",
  "spam4.me",
  "getairmail.com",
  "fakeinbox.com",
  "dispostable.com",
  "mailnull.com",
  "maildrop.cc",
  "spamgourmet.com",
  "spamgourmet.net",
  "discard.email",
  "filzmail.com",
  "enayu.com",
  "mytemp.email",
  "tempr.email",
  "moakt.com",
];

/** Document-issuing country (lowercase) → typical nationality keywords. */
const DOCUMENT_COUNTRY_MAP: Record<string, readonly string[]> = {
  passport: [], // passports can be from any country — skip mismatch check
  emirates_id: ["emirati", "uae", "united arab emirates"],
  driving_license: [], // licenses can be issued by non-nationals in UAE — skip
  national_id: [], // generic — skip
};

// ---------------------------------------------------------------------------
// Rule-based scoring helpers
// ---------------------------------------------------------------------------

function isVpnOrProxy(ip: string | undefined): boolean {
  if (!ip) return false;
  const trimmed = ip.trim();
  return VPN_PROXY_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function isDisposableEmail(email: string | undefined): boolean {
  if (!email) return false;
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1] ?? "";
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

/**
 * Emirates ID format: 784-YYYY-XXXXXXX-X
 * 784 = UAE country code, YYYY = 4-digit year, XXXXXXX = 7-digit sequence, X = check digit
 */
function isValidEmiratesId(docNumber: string): boolean {
  return /^784-\d{4}-\d{7}-\d$/.test(docNumber.trim());
}

/**
 * Passport: 5–9 alphanumeric characters (ICAO 9303 standard).
 */
function isValidPassport(docNumber: string): boolean {
  return /^[A-Z0-9]{5,9}$/i.test(docNumber.trim());
}

function validateDocumentFormat(
  docType: RequestBody["documentType"],
  docNumber: string,
): boolean {
  switch (docType) {
    case "emirates_id":
      return isValidEmiratesId(docNumber);
    case "passport":
      return isValidPassport(docNumber);
    // Driving licences and national IDs have varied formats — skip strict validation.
    case "driving_license":
    case "national_id":
      return true;
  }
}

/**
 * Returns true if the dateOfBirth indicates the applicant is under 18 years old
 * relative to the current date (2026-05-23).
 */
function isUnderage(dateOfBirth: string): boolean {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return false;
  const now = new Date("2026-05-23");
  const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  return dob > eighteenYearsAgo;
}

/**
 * Returns true when a UAE nationality is combined with a non-UAE phone number.
 * UAE numbers: +971-5x (mobile) or +971-4x (landline Dubai area), broadly +971.
 */
function isUaeNationalityWithNonUaePhone(
  nationality: string,
  phoneNumber: string | undefined,
): boolean {
  if (!phoneNumber) return false;
  const normalised = nationality.toLowerCase().trim();
  const isUaeNational = ["emirati", "uae", "united arab emirates"].includes(normalised);
  if (!isUaeNational) return false;
  // UAE numbers start with +971 (or 00971 or 0971)
  const phone = phoneNumber.replace(/[\s\-().]/g, "");
  return !(phone.startsWith("+971") || phone.startsWith("00971") || phone.startsWith("0971"));
}

function isNationalityDocumentMismatch(
  nationality: string,
  docType: RequestBody["documentType"],
): boolean {
  const expectedNationalities = DOCUMENT_COUNTRY_MAP[docType] ?? [];
  if (expectedNationalities.length === 0) return false; // no restriction defined
  const norm = nationality.toLowerCase().trim();
  return !expectedNationalities.some((kw) => norm.includes(kw));
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function riskLevelToKycDecision(level: RiskLevel): KycDecision {
  if (level === "critical") return "reject";
  if (level === "high") return "manual_review";
  if (level === "medium") return "manual_review";
  return "approve";
}

function buildRecommendation(level: RiskLevel, indicators: string[]): string {
  if (level === "critical") {
    return `Application should be rejected. Critical fraud indicators detected: ${indicators.slice(0, 3).join("; ")}. Refer to compliance officer and consider SAR filing.`;
  }
  if (level === "high") {
    return `Manual review required by a senior compliance officer. High-risk signals present: ${indicators.slice(0, 3).join("; ")}. Obtain additional identity verification before proceeding.`;
  }
  if (level === "medium") {
    return `Elevated identity risk — manual review recommended. Collect supporting documents and perform enhanced due diligence. Key concerns: ${indicators.slice(0, 2).join("; ")}.`;
  }
  return "Identity risk profile is low. Standard CDD controls are sufficient. Proceed with automated approval workflow.";
}

// ---------------------------------------------------------------------------
// Core scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  fraudIndicators: string[];
  verificationActions: string[];
}

function computeIdentityRiskScore(body: RequestBody): ScoringResult {
  let score = 0;
  const fraudIndicators: string[] = [];
  const verificationActions: string[] = [];

  // ------------------------------------------------------------------
  // (a) Failed document image quality: +40
  // ------------------------------------------------------------------
  if (body.documentImageQuality === "failed") {
    score += 40;
    fraudIndicators.push("document_ocr_failed: document rejected by OCR/image processing");
    verificationActions.push("Re-submit original high-resolution document scan");
    verificationActions.push("Verify physical document presence in branch");
  } else if (body.documentImageQuality === "low") {
    score += 10;
    fraudIndicators.push("document_image_low_quality: poor image quality may indicate tampering or capture evasion");
    verificationActions.push("Request higher-quality document re-scan");
  }

  // ------------------------------------------------------------------
  // (b) Low selfie match score (biometric): selfieMatchScore < 70 → +35
  // ------------------------------------------------------------------
  if (body.selfieMatchScore !== undefined) {
    if (body.selfieMatchScore < 70) {
      score += 35;
      fraudIndicators.push(`biometric_match_failure: selfie match score ${body.selfieMatchScore}% is below 70% threshold`);
      verificationActions.push("Perform in-person identity verification");
      verificationActions.push("Re-capture liveness selfie under controlled conditions");
    } else if (body.selfieMatchScore < 85) {
      score += 10;
      fraudIndicators.push(`biometric_match_low: selfie match score ${body.selfieMatchScore}% is below 85% recommended threshold`);
      verificationActions.push("Request supervised selfie re-capture");
    }
  }

  // ------------------------------------------------------------------
  // (c) Rapid re-application velocity: previousApplications > 2 → +30
  // ------------------------------------------------------------------
  if (body.previousApplications !== undefined && body.previousApplications > 2) {
    score += 30;
    fraudIndicators.push(`velocity_anomaly: ${body.previousApplications} prior applications detected — possible synthetic ID probing`);
    verificationActions.push("Investigate prior application history and document numbers used");
    verificationActions.push("Check for shared device fingerprint or IP across applications");
  }

  // ------------------------------------------------------------------
  // (d) Speed anomaly for digital channel: timeToComplete < 30 seconds → +25
  // ------------------------------------------------------------------
  if (
    body.applicationChannel === "digital" &&
    body.timeToComplete !== undefined &&
    body.timeToComplete < 30
  ) {
    score += 25;
    fraudIndicators.push(`bot_speed_anomaly: application completed in ${body.timeToComplete}s — below 30-second human threshold for digital channel`);
    verificationActions.push("Trigger step-up CAPTCHA or device challenge");
    verificationActions.push("Review device fingerprint for automation signatures");
  }

  // ------------------------------------------------------------------
  // (e) VPN / proxy IP detection: +20
  // ------------------------------------------------------------------
  if (isVpnOrProxy(body.ipAddress)) {
    score += 20;
    fraudIndicators.push("vpn_ip_detected: IP address matches known VPN/proxy/datacenter range");
    verificationActions.push("Block or challenge VPN/proxy traffic at application layer");
    verificationActions.push("Request geo-verification via phone OTP");
  }

  // ------------------------------------------------------------------
  // (f) Document format validation: +25
  // ------------------------------------------------------------------
  if (!validateDocumentFormat(body.documentType, body.documentNumber)) {
    score += 25;
    fraudIndicators.push(`document_format_invalid: ${body.documentType} number "${body.documentNumber}" does not match expected format`);
    verificationActions.push("Reject document and request re-submission with valid document number");
    verificationActions.push(`Emirates ID must follow format 784-YYYY-XXXXXXX-X; passport must be 5–9 alphanumeric characters`);
  }

  // ------------------------------------------------------------------
  // (g) Disposable / temp email domain: +30
  // ------------------------------------------------------------------
  if (isDisposableEmail(body.emailAddress)) {
    score += 30;
    fraudIndicators.push(`disposable_email_detected: email domain "${body.emailAddress?.split("@")[1]}" is a known temporary/disposable mail service`);
    verificationActions.push("Require verified institutional or permanent email address");
    verificationActions.push("Send OTP to phone number as primary contact verification");
  }

  // ------------------------------------------------------------------
  // (h) Phone number validation — UAE national with non-UAE number: +15
  // ------------------------------------------------------------------
  if (isUaeNationalityWithNonUaePhone(body.nationality, body.phoneNumber)) {
    score += 15;
    fraudIndicators.push("nationality_phone_mismatch: UAE national presenting non-UAE phone number (+971 prefix expected)");
    verificationActions.push("Verify reason for foreign phone number");
    verificationActions.push("Request UAE-registered alternative contact number");
  }

  // ------------------------------------------------------------------
  // (i) High-risk channel — agent: +10
  // ------------------------------------------------------------------
  if (body.applicationChannel === "agent") {
    score += 10;
    fraudIndicators.push("agent_channel_risk: application submitted via third-party agent — elevated fraud vector");
    verificationActions.push("Verify agent registration and authorization");
    verificationActions.push("Confirm applicant awareness and consent via independent callback");
  }

  // ------------------------------------------------------------------
  // (j) Age consistency check — underage applicant: +40
  // ------------------------------------------------------------------
  if (isUnderage(body.dateOfBirth)) {
    score += 40;
    fraudIndicators.push("underage_applicant: date of birth indicates applicant is under 18 years of age");
    verificationActions.push("Reject application — applicants must be 18 years or older");
    verificationActions.push("Flag for review if date of birth may have been falsified");
  }

  // ------------------------------------------------------------------
  // (k) Nationality–document mismatch: +20
  //     Emirates ID should only be issued to UAE nationals/residents
  // ------------------------------------------------------------------
  if (isNationalityDocumentMismatch(body.nationality, body.documentType)) {
    score += 20;
    fraudIndicators.push(`nationality_document_mismatch: ${body.documentType} is typically issued to UAE nationals/residents but nationality reported as "${body.nationality}"`);
    verificationActions.push("Verify whether applicant holds UAE residency permitting Emirates ID issuance");
    verificationActions.push("Request supporting residency or citizenship documentation");
  }

  // Ensure standard verification actions are always present
  if (verificationActions.length === 0) {
    verificationActions.push("Perform standard CDD document verification");
  }

  // Cap score at 100
  score = Math.min(score, 100);

  return { score, fraudIndicators, verificationActions };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // Top-level try/catch: any uncaught error inside the handler — including
  // ECONNRESET from an upstream TCP reset propagated through enforce() /
  // audit-chain writes — must surface as a 500 JSON instead of crashing the
  // Netlify Lambda (which would render the "This function has crashed"
  // full-screen error page in the iframe).
  try {
    const gate = await enforce(req, { cost: 5 });
    if (!gate.ok) return gate.response;

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400, headers: gate.headers },
      );
    }

    // Basic required-field validation
    if (
      !body.subjectName ||
      !body.documentType ||
      !body.documentNumber ||
      !body.dateOfBirth ||
      !body.nationality ||
      !body.address ||
      !body.applicationChannel
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing required fields: subjectName, documentType, documentNumber, dateOfBirth, nationality, address, applicationChannel",
        },
        { status: 422, headers: gate.headers },
      );
    }

    try {
      writeAuditEvent("analyst", "identity.risk-assessment", body.subjectName);
    } catch (err) {
      console.warn("[hawkeye] identity-risk writeAuditEvent failed:", err);
    }

    // Run scoring (pure rule-based — no LLM call required)
    const { score, fraudIndicators, verificationActions } = computeIdentityRiskScore(body);
    const riskLevel = scoreToRiskLevel(score);
    const kycDecision = riskLevelToKycDecision(riskLevel);
    const recommendation = buildRecommendation(riskLevel, fraudIndicators);

    void writeAuditChainEntry(
      {
        event: "identity.risk_assessed",
        actor: gate.keyId,
        subjectName: body.subjectName,
        documentType: body.documentType,
        applicationChannel: body.applicationChannel,
        riskScore: score,
        riskLevel,
        kycDecision,
        fraudIndicatorCount: fraudIndicators.length,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn(
        "[identity-risk] audit chain write failed:",
        err instanceof Error ? err.message : String(err),
      ),
    );

    const result: IdentityRiskResult = {
      riskScore: score,
      riskLevel,
      fraudIndicators,
      verificationActions,
      recommendation,
      kycDecision,
    };

    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hawkeye] identity-risk handler exception:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
