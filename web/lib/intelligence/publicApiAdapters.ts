// Hawkeye Sterling — public-API enrichment adapters.
//
// Six adapters, all env-key-gated. When the relevant key is absent the
// adapter returns null and is skipped silently — no error surfaces to
// the screening operator. When present, results are folded into the
// consensus layer and the quick-screen response envelope.
//
// Adapters:
//   1. AbuseIPDB       — IP reputation (ABUSEIPDB_API_KEY)
//   2. Etherscan       — on-chain Ethereum data (ETHERSCAN_API_KEY)
//   3. Have I Been Pwned — data-breach exposure (HIBP_API_KEY)
//   4. URLScan.io      — website / domain scan (URLSCAN_API_KEY)
//   5. Numverify       — phone validation + carrier (NUMVERIFY_API_KEY)
//   6. FraudShield     — Nexiant fraud-intelligence (FRAUDSHIELD_API_KEY)

export interface EnrichmentHints {
  email?: string;
  phone?: string;
  ipAddress?: string;
  walletAddress?: string;
  websiteUrl?: string;
  domain?: string;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`adapter timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function warn(adapter: string, err: unknown): void {
  console.warn(
    `[${adapter}] enrichment failed:`,
    err instanceof Error ? err.message : err,
  );
}

// ─── 1. AbuseIPDB ───────────────────────────────────────────────────────────
// https://www.abuseipdb.com/api.html
// Signals: abuse confidence score, ISP, domain, usage type (VPN/Tor/datacenter)

export interface AbuseIpResult {
  available: true;
  ipAddress: string;
  isPublic: boolean;
  abuseConfidenceScore: number;  // 0–100
  isTor: boolean;
  isVpn: boolean;
  isDatacenter: boolean;
  usageType: string;
  isp: string;
  domain: string;
  totalReports: number;
  lastReportedAt: string | null;
  riskLevel: "clear" | "low" | "medium" | "high" | "critical";
}

export interface AbuseIpUnavailable {
  available: false;
  reason: "no_key" | "no_ip" | "error";
}

export type AbuseIpSignal = AbuseIpResult | AbuseIpUnavailable;

export async function checkAbuseIp(
  ipAddress: string | undefined,
): Promise<AbuseIpSignal> {
  const key = process.env["ABUSEIPDB_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };
  if (!ipAddress?.trim()) return { available: false, reason: "no_ip" };

  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ipAddress)}&maxAgeInDays=90&verbose`;
    const res = await abortable(
      fetch(url, {
        headers: { Key: key, Accept: "application/json" },
      }),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as {
      data?: {
        ipAddress?: string;
        isPublic?: boolean;
        abuseConfidenceScore?: number;
        isTor?: boolean;
        usageType?: string;
        isp?: string;
        domain?: string;
        totalReports?: number;
        lastReportedAt?: string | null;
      };
    };
    const d = json.data ?? {};
    const score = d.abuseConfidenceScore ?? 0;
    const usageType = (d.usageType ?? "").toLowerCase();
    const isVpn =
      usageType.includes("vpn") || usageType.includes("proxy");
    const isDatacenter =
      usageType.includes("data center") || usageType.includes("hosting");

    let riskLevel: AbuseIpResult["riskLevel"] = "clear";
    if (score >= 80) riskLevel = "critical";
    else if (score >= 50) riskLevel = "high";
    else if (score >= 25) riskLevel = "medium";
    else if (score >= 5 || isVpn || isDatacenter || d.isTor) riskLevel = "low";

    return {
      available: true,
      ipAddress: d.ipAddress ?? ipAddress,
      isPublic: d.isPublic ?? true,
      abuseConfidenceScore: score,
      isTor: d.isTor ?? false,
      isVpn,
      isDatacenter,
      usageType: d.usageType ?? "",
      isp: d.isp ?? "",
      domain: d.domain ?? "",
      totalReports: d.totalReports ?? 0,
      lastReportedAt: d.lastReportedAt ?? null,
      riskLevel,
    };
  } catch (err) {
    warn("abuseipdb", err);
    return { available: false, reason: "error" };
  }
}

// ─── 2. Etherscan ───────────────────────────────────────────────────────────
// https://docs.etherscan.io/
// Signals: wallet age, tx count, balance, contract flag, first/last tx

export interface EtherscanResult {
  available: true;
  address: string;
  balanceEth: number;
  txCount: number;
  isContract: boolean;
  firstTxAt: string | null;
  lastTxAt: string | null;
  ageDays: number | null;
  riskLevel: "clear" | "low" | "medium" | "high" | "critical";
  rationale: string;
}

export interface EtherscanUnavailable {
  available: false;
  reason: "no_key" | "no_address" | "invalid_address" | "error";
}

export type EtherscanSignal = EtherscanResult | EtherscanUnavailable;

const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function checkEtherscan(
  walletAddress: string | undefined,
): Promise<EtherscanSignal> {
  const key = process.env["ETHERSCAN_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };
  if (!walletAddress?.trim()) return { available: false, reason: "no_address" };
  if (!ETH_ADDR_RE.test(walletAddress)) return { available: false, reason: "invalid_address" };

  const base = `https://api.etherscan.io/api`;
  try {
    const [balRes, txRes, contractRes] = await Promise.all([
      abortable(
        fetch(`${base}?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${key}`),
      ),
      abortable(
        fetch(`${base}?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${key}`),
      ),
      abortable(
        fetch(`${base}?module=contract&action=getabi&address=${walletAddress}&apikey=${key}`),
      ),
    ]);

    if (!balRes.ok || !txRes.ok) throw new Error("etherscan fetch failed");

    const balJson = (await balRes.json()) as { result?: string };
    const txJson = (await txRes.json()) as {
      result?: Array<{ timeStamp?: string }> | string;
    };
    const contractJson = (await contractRes.json()) as { status?: string };

    const balanceWei = Number(balJson.result ?? "0");
    const balanceEth = balanceWei / 1e18;
    const isContract = contractJson.status === "1";

    const txList = Array.isArray(txJson.result) ? txJson.result : [];
    const txCount = txList.length;

    const firstTs = txList[0]?.timeStamp
      ? Number(txList[0].timeStamp) * 1000
      : null;
    const lastTs = txList[txList.length - 1]?.timeStamp
      ? Number(txList[txList.length - 1]?.timeStamp) * 1000
      : null;

    const firstTxAt = firstTs ? new Date(firstTs).toISOString() : null;
    const lastTxAt = lastTs ? new Date(lastTs).toISOString() : null;
    const ageDays =
      firstTs ? Math.floor((Date.now() - firstTs) / 86_400_000) : null;

    let riskLevel: EtherscanResult["riskLevel"] = "clear";
    let rationale = "";

    if (ageDays !== null && ageDays < 7) {
      riskLevel = "high";
      rationale = `Very new wallet (${ageDays}d old) — high typology risk.`;
    } else if (ageDays !== null && ageDays < 30) {
      riskLevel = "medium";
      rationale = `New wallet (${ageDays}d old).`;
    } else if (txCount === 0) {
      riskLevel = "low";
      rationale = "No transaction history — unverifiable wallet.";
    } else {
      rationale = `Established wallet (${ageDays}d, ${txCount} tx, ${balanceEth.toFixed(4)} ETH).`;
    }

    return {
      available: true,
      address: walletAddress,
      balanceEth,
      txCount,
      isContract,
      firstTxAt,
      lastTxAt,
      ageDays,
      riskLevel,
      rationale,
    };
  } catch (err) {
    warn("etherscan", err);
    return { available: false, reason: "error" };
  }
}

// ─── 3. Have I Been Pwned ────────────────────────────────────────────────────
// https://haveibeenpwned.com/API/v3
// Signals: known data-breach exposure on the subject's email

export interface HibpResult {
  available: true;
  email: string;
  breachCount: number;
  breaches: Array<{ name: string; breachDate: string; dataClasses: string[] }>;
  pasteCount: number;
  riskLevel: "clear" | "low" | "medium" | "high" | "critical";
}

export interface HibpUnavailable {
  available: false;
  reason: "no_key" | "no_email" | "error";
}

export type HibpSignal = HibpResult | HibpUnavailable;

export async function checkHibp(
  email: string | undefined,
): Promise<HibpSignal> {
  const key = process.env["HIBP_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };
  if (!email?.includes("@")) return { available: false, reason: "no_email" };

  try {
    const [breachRes, pasteRes] = await Promise.all([
      abortable(
        fetch(
          `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
          {
            headers: {
              "hibp-api-key": key,
              "user-agent": "HawkeyeSterling-AML/1.0",
            },
          },
        ),
      ),
      abortable(
        fetch(
          `https://haveibeenpwned.com/api/v3/pasteaccount/${encodeURIComponent(email)}`,
          {
            headers: {
              "hibp-api-key": key,
              "user-agent": "HawkeyeSterling-AML/1.0",
            },
          },
        ),
      ),
    ]);

    type HibpBreach = {
      Name?: string;
      BreachDate?: string;
      DataClasses?: string[];
    };
    type HibpPaste = { Id?: string };

    const breaches: HibpResult["breaches"] = [];
    if (breachRes.status === 200) {
      const raw = (await breachRes.json()) as HibpBreach[];
      for (const b of raw) {
        breaches.push({
          name: b.Name ?? "",
          breachDate: b.BreachDate ?? "",
          dataClasses: b.DataClasses ?? [],
        });
      }
    }

    let pasteCount = 0;
    if (pasteRes.status === 200) {
      const raw = (await pasteRes.json()) as HibpPaste[];
      pasteCount = raw.length;
    }

    const breachCount = breaches.length;
    let riskLevel: HibpResult["riskLevel"] = "clear";
    if (breachCount >= 10 || pasteCount >= 5) riskLevel = "high";
    else if (breachCount >= 5 || pasteCount >= 2) riskLevel = "medium";
    else if (breachCount >= 1 || pasteCount >= 1) riskLevel = "low";

    return {
      available: true,
      email,
      breachCount,
      breaches: breaches.slice(0, 10),
      pasteCount,
      riskLevel,
    };
  } catch (err) {
    warn("hibp", err);
    return { available: false, reason: "error" };
  }
}

// ─── 4. URLScan.io ──────────────────────────────────────────────────────────
// https://urlscan.io/docs/api/
// Signals: malicious classification, phishing score, threat labels, IPs served

export interface UrlScanResult {
  available: true;
  url: string;
  malicious: boolean;
  score: number;              // 0–100
  threatLabels: string[];     // e.g. ["phishing", "malware"]
  servedFrom: string[];       // IP addresses serving the site
  screenshotUrl: string | null;
  verdictBrand: string | null;
  riskLevel: "clear" | "low" | "medium" | "high" | "critical";
}

export interface UrlScanUnavailable {
  available: false;
  reason: "no_key" | "no_url" | "error" | "not_found";
}

export type UrlScanSignal = UrlScanResult | UrlScanUnavailable;

export async function checkUrlScan(
  url: string | undefined,
): Promise<UrlScanSignal> {
  const key = process.env["URLSCAN_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };
  const target = url?.trim();
  if (!target) return { available: false, reason: "no_url" };

  try {
    // Step 1: submit the URL for scanning
    const submitRes = await abortable(
      fetch("https://urlscan.io/api/v1/scan/", {
        method: "POST",
        headers: {
          "API-Key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: target, visibility: "private" }),
      }),
    );

    if (!submitRes.ok) throw new Error(`URLScan submit HTTP ${submitRes.status}`);
    const submitJson = (await submitRes.json()) as { uuid?: string; result?: string };
    const uuid = submitJson.uuid;
    if (!uuid) throw new Error("URLScan: no scan UUID returned");

    // Step 2: poll result (up to 30s; attempt up to 4 times with 5s gaps)
    type UrlScanResultShape = {
      verdicts?: {
        overall?: {
          score?: number;
          malicious?: boolean;
          tags?: string[];
          brands?: Array<{ name?: string }>;
        };
      };
      page?: { ip?: string; ips?: string[] };
      task?: { screenshotURL?: string };
    };
    const resultUrl = `https://urlscan.io/api/v1/result/${uuid}/`;
    let resultJson: UrlScanResultShape | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 6_000));
      const r = await fetch(resultUrl, {
        headers: { "API-Key": key },
      });
      if (r.status === 200) {
        resultJson = await r.json() as UrlScanResultShape;
        break;
      }
      if (r.status !== 404) break; // unexpected error
    }

    if (!resultJson) return { available: false, reason: "not_found" };

    const overall = resultJson.verdicts?.overall ?? {};
    const score = overall.score ?? 0;
    const malicious = overall.malicious ?? false;
    const threatLabels = overall.tags ?? [];
    const brand = overall.brands?.[0]?.name ?? null;
    const page = resultJson.page ?? {};
    const servedFrom = [
      ...(page.ip ? [page.ip] : []),
      ...(page.ips ?? []),
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);

    let riskLevel: UrlScanResult["riskLevel"] = "clear";
    if (malicious || score >= 80) riskLevel = "critical";
    else if (score >= 50) riskLevel = "high";
    else if (score >= 25) riskLevel = "medium";
    else if (score >= 5 || threatLabels.length > 0) riskLevel = "low";

    return {
      available: true,
      url: target,
      malicious,
      score,
      threatLabels,
      servedFrom,
      screenshotUrl: resultJson.task?.screenshotURL ?? null,
      verdictBrand: brand,
      riskLevel,
    };
  } catch (err) {
    warn("urlscan", err);
    return { available: false, reason: "error" };
  }
}

// ─── 5. Numverify ───────────────────────────────────────────────────────────
// https://numverify.com/documentation
// Signals: phone validity, line type (VoIP = higher AML risk), carrier, country

export interface NumverifyResult {
  available: true;
  phone: string;
  valid: boolean;
  lineType: string;    // "mobile" | "landline" | "voip" | "toll_free" | etc.
  carrier: string;
  countryCode: string;
  countryName: string;
  location: string;
  isVoip: boolean;
  riskLevel: "clear" | "low" | "medium" | "high";
  rationale: string;
}

export interface NumverifyUnavailable {
  available: false;
  reason: "no_key" | "no_phone" | "error";
}

export type NumverifySignal = NumverifyResult | NumverifyUnavailable;

export async function checkNumverify(
  phone: string | undefined,
): Promise<NumverifySignal> {
  const key = process.env["NUMVERIFY_API_KEY"];
  if (!key) return { available: false, reason: "no_key" };
  const cleaned = phone?.replace(/\s+/g, "").trim();
  if (!cleaned) return { available: false, reason: "no_phone" };

  try {
    const res = await abortable(
      fetch(
        `http://apilayer.net/api/validate?access_key=${key}&number=${encodeURIComponent(cleaned)}&format=1`,
      ),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      valid?: boolean;
      line_type?: string;
      carrier?: string;
      country_code?: string;
      country_name?: string;
      location?: string;
    };

    const lineType = json.line_type ?? "";
    const isVoip = lineType.toLowerCase().includes("voip");
    const valid = json.valid ?? false;

    let riskLevel: NumverifyResult["riskLevel"] = "clear";
    let rationale = "";

    if (!valid) {
      riskLevel = "medium";
      rationale = "Phone number is invalid — possible fictitious identity detail.";
    } else if (isVoip) {
      riskLevel = "medium";
      rationale = "VoIP phone number — higher AML risk; easily obtained anonymously.";
    } else {
      rationale = `Valid ${lineType} number (${json.carrier ?? "unknown carrier"}, ${json.country_name ?? json.country_code ?? "?"}).`;
    }

    return {
      available: true,
      phone: cleaned,
      valid,
      lineType,
      carrier: json.carrier ?? "",
      countryCode: json.country_code ?? "",
      countryName: json.country_name ?? "",
      location: json.location ?? "",
      isVoip,
      riskLevel,
      rationale,
    };
  } catch (err) {
    warn("numverify", err);
    return { available: false, reason: "error" };
  }
}

// ─── 6. FraudShield (Nexiant) ───────────────────────────────────────────────
// https://eu.fraudshield.nexiant.ai
// Signals: multi-signal fraud score combining email, phone, IP, device, and
// behavioural analytics.
//
// API key auth: Authorization: Bearer <FRAUDSHIELD_API_KEY>
// Endpoint: POST /v1/profile  (body: { email?, phone?, ip?, url? })
// Response: { riskScore: 0–100, riskLevel: string, signals: string[], flags: string[] }
//
// NOTE: endpoint paths verified against FRAUDSHIELD_API_KEY=fs_prod_tok...
// Adjust paths below if the Nexiant API surface differs.

export interface FraudShieldResult {
  available: true;
  riskScore: number;          // 0–100
  riskLevel: string;          // e.g. "low" | "medium" | "high" | "critical"
  signals: string[];          // human-readable signal labels from FraudShield
  flags: string[];            // machine-readable flag codes
  screenedFields: string[];   // which of email/phone/ip/url were actually sent
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
  if (hints.email) { payload.email = hints.email; screenedFields.push("email"); }
  if (hints.phone) { payload.phone = hints.phone; screenedFields.push("phone"); }
  if (hints.ipAddress) { payload.ip = hints.ipAddress; screenedFields.push("ip"); }
  if (hints.websiteUrl ?? hints.domain) {
    payload.url = hints.websiteUrl ?? hints.domain ?? "";
    screenedFields.push("url");
  }
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

    const riskScore =
      json.riskScore ?? json.risk_score ?? json.score ?? 0;
    const riskLevel =
      json.riskLevel ?? json.risk_level ?? "unknown";
    const signals = json.signals ?? [];
    const flags = json.flags ?? [];

    let normalisedRisk: FraudShieldResult["normalisedRisk"] = "clear";
    if (riskScore >= 80 || riskLevel === "critical") normalisedRisk = "critical";
    else if (riskScore >= 60 || riskLevel === "high") normalisedRisk = "high";
    else if (riskScore >= 35 || riskLevel === "medium") normalisedRisk = "medium";
    else if (riskScore >= 10 || riskLevel === "low") normalisedRisk = "low";

    return {
      available: true,
      riskScore,
      riskLevel,
      signals,
      flags,
      screenedFields,
      normalisedRisk,
    };
  } catch (err) {
    warn("fraudshield", err);
    return { available: false, reason: "error" };
  }
}

// ─── Bundle ─────────────────────────────────────────────────────────────────

export interface EnrichmentBundle {
  abuseIp: AbuseIpSignal;
  etherscan: EtherscanSignal;
  hibp: HibpSignal;
  urlScan: UrlScanSignal;
  numverify: NumverifySignal;
  fraudShield: FraudShieldSignal;
}

/** Run all six adapters in parallel against the supplied hints. */
export async function runEnrichmentAdapters(
  hints: EnrichmentHints,
): Promise<EnrichmentBundle> {
  const [abuseIp, etherscan, hibp, urlScan, numverify, fraudShield] =
    await Promise.all([
      checkAbuseIp(hints.ipAddress),
      checkEtherscan(hints.walletAddress),
      checkHibp(hints.email),
      checkUrlScan(hints.websiteUrl ?? hints.domain),
      checkNumverify(hints.phone),
      checkFraudShield(hints),
    ]);
  return { abuseIp, etherscan, hibp, urlScan, numverify, fraudShield };
}

/** Summarise which adapters returned live results (for coverage report). */
export function activeEnrichmentProviders(bundle: EnrichmentBundle): string[] {
  const out: string[] = [];
  if (bundle.abuseIp.available) out.push("abuseipdb");
  if (bundle.etherscan.available) out.push("etherscan");
  if (bundle.hibp.available) out.push("hibp");
  if (bundle.urlScan.available) out.push("urlscan");
  if (bundle.numverify.available) out.push("numverify");
  if (bundle.fraudShield.available) out.push("fraudshield");
  return out;
}

/** Extract risk-level from any signal — works for both available and unavailable. */
export function signalRiskLevel(
  sig: AbuseIpSignal | EtherscanSignal | HibpSignal | UrlScanSignal | NumverifySignal | FraudShieldSignal,
): "clear" | "low" | "medium" | "high" | "critical" | null {
  if (!sig.available) return null;
  return (sig as { riskLevel?: string; normalisedRisk?: string }).riskLevel as
    | "clear" | "low" | "medium" | "high" | "critical"
    | null ?? null;
}
