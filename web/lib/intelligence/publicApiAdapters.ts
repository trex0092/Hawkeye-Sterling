// Hawkeye Sterling — FraudShield (Nexiant) enrichment adapter.
//
// Env-key-gated: set FRAUDSHIELD_API_KEY to activate. When absent the
// adapter returns unavailable and is skipped silently.
//
// Pass enrichmentHints.{email, phone, ipAddress, websiteUrl, domain} in
// the /api/quick-screen request body to feed signals into FraudShield.

export interface EnrichmentHints {
  email?: string;
  phone?: string;
  ipAddress?: string;
  walletAddress?: string;
  websiteUrl?: string;
  domain?: string;
}

const FETCH_TIMEOUT_MS = 8_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`adapter timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function warn(err: unknown): void {
  console.warn(
    "[fraudshield] enrichment failed:",
    err instanceof Error ? err.message : err,
  );
}

// ─── FraudShield (Nexiant) ──────────────────────────────────────────────────
// https://eu.fraudshield.nexiant.ai
// Multi-signal fraud intelligence: email, phone, IP, and URL risk scoring.
//
// Auth: Authorization: Bearer <FRAUDSHIELD_API_KEY>
// Endpoint: POST /v1/profile

export interface FraudShieldResult {
  available: true;
  riskScore: number;          // 0–100
  riskLevel: string;          // e.g. "low" | "medium" | "high" | "critical"
  signals: string[];          // human-readable signal labels
  flags: string[];            // machine-readable flag codes
  screenedFields: string[];   // which of email/phone/ip/url were sent
  normalisedRisk: "clear" | "low" | "medium" | "high" | "critical";
}

export interface FraudShieldUnavailable {
  available: false;
  reason: "no_key" | "no_inputs" | "error";
}

export type FraudShieldSignal = FraudShieldResult | FraudShieldUnavailable;

export async function checkFraudShield(
  hints: EnrichmentHints,
): Promise<FraudShieldSignal> {
  const key = process.env["FRAUDSHIELD_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };

  const payload: Record<string, string> = {};
  const screenedFields: string[] = [];
  if (hints.email)      { payload.email = hints.email;                          screenedFields.push("email"); }
  if (hints.phone)      { payload.phone = hints.phone;                          screenedFields.push("phone"); }
  if (hints.ipAddress)  { payload.ip    = hints.ipAddress;                      screenedFields.push("ip"); }
  const url = hints.websiteUrl ?? hints.domain;
  if (url)              { payload.url   = url;                                   screenedFields.push("url"); }

  if (screenedFields.length === 0) return { available: false, reason: "no_inputs" };

  try {
    const res = await abortable(
      fetch("https://eu.fraudshield.nexiant.ai/v1/profile", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }),
    );
    if (!res.ok) throw new Error(`FraudShield HTTP ${res.status}`);

    const json = (await res.json()) as {
      riskScore?: number;
      risk_score?: number;
      riskLevel?: string;
      risk_level?: string;
      signals?: string[];
      flags?: string[];
      score?: number;
    };

    const riskScore  = json.riskScore ?? json.risk_score ?? json.score ?? 0;
    const riskLevel  = json.riskLevel ?? json.risk_level ?? "unknown";
    const signals    = json.signals ?? [];
    const flags      = json.flags ?? [];

    let normalisedRisk: FraudShieldResult["normalisedRisk"] = "clear";
    if (riskScore >= 80 || riskLevel === "critical") normalisedRisk = "critical";
    else if (riskScore >= 60 || riskLevel === "high")   normalisedRisk = "high";
    else if (riskScore >= 35 || riskLevel === "medium") normalisedRisk = "medium";
    else if (riskScore >= 10 || riskLevel === "low")    normalisedRisk = "low";

    return { available: true, riskScore, riskLevel, signals, flags, screenedFields, normalisedRisk };
  } catch (err) {
    warn(err);
    return { available: false, reason: "error" };
  }
}

// ─── Bundle (single adapter) ─────────────────────────────────────────────────

export interface EnrichmentBundle {
  fraudShield: FraudShieldSignal;
}

export async function runEnrichmentAdapters(
  hints: EnrichmentHints,
): Promise<EnrichmentBundle> {
  const fraudShield = await checkFraudShield(hints);
  return { fraudShield };
}

export function activeEnrichmentProviders(bundle: EnrichmentBundle): string[] {
  return bundle.fraudShield.available ? ["fraudshield"] : [];
}
