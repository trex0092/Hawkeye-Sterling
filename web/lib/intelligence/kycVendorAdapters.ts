// Hawkeye Sterling — KYC / IDV vendor adapters.
//
// These adapters wrap the major identity-verification & document-verification
// providers (Onfido, Jumio, Trulioo, Persona, Veriff, Sumsub, Shufti Pro,
// IDnow). They are env-key gated and degrade to NULL_KYC_ADAPTER when keys
// are absent.
//
// Unlike news/registry adapters, KYC operations are typically *bind* —
// you create a check / verification session and consume the result async.
// For Hawkeye Sterling's screening flow we expose `createCheck()` which
// returns a sessionId + redirectUrl the operator UI can hand to the user.

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`kyc adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

export interface KycCheckRequest {
  subjectName: string;
  email?: string;
  phone?: string;
  countryCode?: string;             // ISO-2
  documentType?: "passport" | "national_id" | "driving_licence" | "residence_permit";
}

export interface KycCheckResult {
  ok: boolean;
  provider: string;
  sessionId?: string;
  redirectUrl?: string;
  status?: "pending" | "approved" | "declined" | "review";
  error?: string;
}

export interface KycVendorAdapter {
  isAvailable(): boolean;
  createCheck(req: KycCheckRequest): Promise<KycCheckResult>;
}

export const NULL_KYC_ADAPTER: KycVendorAdapter = {
  isAvailable: () => false,
  createCheck: async () => ({ ok: false, provider: "none", error: "no KYC vendor configured" }),
};

// ── Onfido ─────────────────────────────────────────────────────────────
function onfidoAdapter(): KycVendorAdapter {
  const key = process.env["ONFIDO_API_KEY"];
  const region = process.env["ONFIDO_REGION"] ?? "eu";
  if (!key) return NULL_KYC_ADAPTER;
  const base = region === "us" ? "https://api.us.onfido.com/v3.6" : region === "ca" ? "https://api.ca.onfido.com/v3.6" : "https://api.onfido.com/v3.6";
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const [first, ...rest] = req.subjectName.split(/\s+/);
        const lastName = rest.length > 0 ? rest.join(" ") : first;
        const applicantRes = await abortable(
          fetch(`${base}/applicants`, {
            method: "POST",
            headers: { Authorization: `Token token=${key}`, "content-type": "application/json" },
            body: JSON.stringify({ first_name: first ?? req.subjectName, last_name: lastName, email: req.email }),
          }),
        );
        if (!applicantRes.ok) return { ok: false, provider: "onfido", error: `applicant create failed (${applicantRes.status})` };
        const applicant = (await applicantRes.json()) as { id?: string };
        if (!applicant.id) return { ok: false, provider: "onfido", error: "no applicant id" };
        const sdkRes = await abortable(
          fetch(`${base}/sdk_token`, {
            method: "POST",
            headers: { Authorization: `Token token=${key}`, "content-type": "application/json" },
            body: JSON.stringify({ applicant_id: applicant.id, referrer: "*://*/*" }),
          }),
        );
        if (!sdkRes.ok) return { ok: false, provider: "onfido", sessionId: applicant.id, status: "pending" };
        const sdk = (await sdkRes.json()) as { token?: string };
        return { ok: true, provider: "onfido", sessionId: applicant.id, redirectUrl: sdk.token ? `https://onfido.com/sdk/${sdk.token}` : undefined, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "onfido", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Jumio (Netverify) ──────────────────────────────────────────────────
function jumioAdapter(): KycVendorAdapter {
  const apiToken = process.env["JUMIO_API_TOKEN"];
  const apiSecret = process.env["JUMIO_API_SECRET"];
  const dc = process.env["JUMIO_DATACENTER"] ?? "eu"; // "us" | "eu" | "sg"
  if (!apiToken || !apiSecret) return NULL_KYC_ADAPTER;
  const base = dc === "us" ? "https://netverify.com" : dc === "sg" ? "https://lon.netverify.com" : "https://lon.netverify.com";
  const auth = Buffer.from(`${apiToken}:${apiSecret}`).toString("base64");
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const res = await abortable(
          fetch(`${base}/api/v4/initiate`, {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
            body: JSON.stringify({
              customerInternalReference: `hs-${Date.now()}`,
              userReference: req.subjectName,
              ...(req.countryCode ? { country: req.countryCode } : {}),
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "jumio", error: `initiate failed (${res.status})` };
        const json = (await res.json()) as { transactionReference?: string; redirectUrl?: string };
        return { ok: true, provider: "jumio", sessionId: json.transactionReference, redirectUrl: json.redirectUrl, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "jumio", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Trulioo GlobalGateway ─────────────────────────────────────────────
function truliooAdapter(): KycVendorAdapter {
  const key = process.env["TRULIOO_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const res = await abortable(
          fetch("https://api.globaldatacompany.com/verifications/v1/verify", {
            method: "POST",
            headers: { "x-trulioo-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              AcceptTruliooTermsAndConditions: true,
              CountryCode: req.countryCode ?? "US",
              DataFields: { PersonInfo: { FirstGivenName: req.subjectName.split(/\s+/)[0], FirstSurName: req.subjectName.split(/\s+/).slice(1).join(" ") } },
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "trulioo", error: `verify failed (${res.status})` };
        const json = (await res.json()) as { TransactionID?: string; Record?: { RecordStatus?: string } };
        const status = json.Record?.RecordStatus === "match" ? "approved" : json.Record?.RecordStatus === "nomatch" ? "declined" : "review";
        return { ok: true, provider: "trulioo", sessionId: json.TransactionID, status };
      } catch (err) {
        return { ok: false, provider: "trulioo", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Persona ────────────────────────────────────────────────────────────
function personaAdapter(): KycVendorAdapter {
  const key = process.env["PERSONA_API_KEY"];
  const templateId = process.env["PERSONA_TEMPLATE_ID"];
  if (!key || !templateId) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const res = await abortable(
          fetch("https://withpersona.com/api/v1/inquiries", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json", "Persona-Version": "2023-01-05" },
            body: JSON.stringify({
              data: {
                attributes: {
                  "inquiry-template-id": templateId,
                  "name-first": req.subjectName.split(/\s+/)[0],
                  "name-last": req.subjectName.split(/\s+/).slice(1).join(" "),
                  "email-address": req.email,
                },
              },
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "persona", error: `inquiry failed (${res.status})` };
        const json = (await res.json()) as { data?: { id?: string; attributes?: { "session-token"?: string } } };
        const id = json.data?.id;
        return { ok: true, provider: "persona", sessionId: id, redirectUrl: id ? `https://withpersona.com/verify?inquiry-id=${id}` : undefined, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "persona", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Veriff ────────────────────────────────────────────────────────────
function veriffAdapter(): KycVendorAdapter {
  const key = process.env["VERIFF_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const res = await abortable(
          fetch("https://stationapi.veriff.com/v1/sessions", {
            method: "POST",
            headers: { "X-AUTH-CLIENT": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              verification: {
                callback: process.env["VERIFF_CALLBACK_URL"] ?? "",
                person: { firstName: req.subjectName.split(/\s+/)[0], lastName: req.subjectName.split(/\s+/).slice(1).join(" ") },
                vendorData: `hs-${Date.now()}`,
              },
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "veriff", error: `session failed (${res.status})` };
        const json = (await res.json()) as { verification?: { id?: string; sessionToken?: string; url?: string } };
        return { ok: true, provider: "veriff", sessionId: json.verification?.id, redirectUrl: json.verification?.url, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "veriff", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Sumsub ────────────────────────────────────────────────────────────
function sumsubAdapter(): KycVendorAdapter {
  const key = process.env["SUMSUB_APP_TOKEN"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const params = new URLSearchParams({ userId: `hs-${Date.now()}`, levelName: process.env["SUMSUB_LEVEL"] ?? "basic-kyc-level" });
        const res = await abortable(
          fetch(`https://api.sumsub.com/resources/accessTokens?${params.toString()}`, {
            method: "POST",
            headers: { "X-App-Token": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return { ok: false, provider: "sumsub", error: `accessToken failed (${res.status})` };
        const json = (await res.json()) as { token?: string; userId?: string };
        return { ok: true, provider: "sumsub", sessionId: json.userId, redirectUrl: json.token ? `https://api.sumsub.com/idensic/static/sns-websdk-builder.html?accessToken=${json.token}` : undefined, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "sumsub", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Shufti Pro ────────────────────────────────────────────────────────
function shuftiProAdapter(): KycVendorAdapter {
  const clientId = process.env["SHUFTIPRO_CLIENT_ID"];
  const secret = process.env["SHUFTIPRO_SECRET_KEY"];
  if (!clientId || !secret) return NULL_KYC_ADAPTER;
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const res = await abortable(
          fetch("https://api.shuftipro.com/", {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              reference: `hs-${Date.now()}`,
              callback_url: process.env["SHUFTIPRO_CALLBACK_URL"] ?? "",
              email: req.email,
              country: req.countryCode,
              verification_mode: "any",
              face: "",
              document: { supported_types: ["passport", "id_card", "driving_license"], name: { full_name: req.subjectName } },
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "shuftipro", error: `verify failed (${res.status})` };
        const json = (await res.json()) as { reference?: string; verification_url?: string; event?: string };
        const status = json.event === "verification.accepted" ? "approved" : json.event === "verification.declined" ? "declined" : "pending";
        return { ok: true, provider: "shuftipro", sessionId: json.reference, redirectUrl: json.verification_url, status };
      } catch (err) {
        return { ok: false, provider: "shuftipro", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── IDnow ─────────────────────────────────────────────────────────────
function idnowAdapter(): KycVendorAdapter {
  const companyId = process.env["IDNOW_COMPANY_ID"];
  const apiKey = process.env["IDNOW_API_KEY"];
  if (!companyId || !apiKey) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const txId = `hs-${Date.now()}`;
        const res = await abortable(
          fetch(`https://gateway.test.idnow.de/api/v1/${companyId}/identifications/${txId}/start`, {
            method: "POST",
            headers: { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              firstname: req.subjectName.split(/\s+/)[0],
              lastname: req.subjectName.split(/\s+/).slice(1).join(" "),
              email: req.email,
            }),
          }),
        );
        if (!res.ok) return { ok: false, provider: "idnow", error: `start failed (${res.status})` };
        const json = (await res.json()) as { id?: string; redirectUrl?: string };
        return { ok: true, provider: "idnow", sessionId: json.id ?? txId, redirectUrl: json.redirectUrl, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "idnow", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Aggregator ────────────────────────────────────────────────────────
export function activeKycAdapters(): KycVendorAdapter[] {
  return [
    onfidoAdapter(),
    jumioAdapter(),
    truliooAdapter(),
    personaAdapter(),
    veriffAdapter(),
    sumsubAdapter(),
    shuftiProAdapter(),
    idnowAdapter(),
  ].filter((a) => a.isAvailable());
}

export function activeKycProviders(): string[] {
  const checks: Array<[string, string]> = [
    ["ONFIDO_API_KEY", "onfido"],
    ["JUMIO_API_TOKEN", "jumio"],
    ["TRULIOO_API_KEY", "trulioo"],
    ["PERSONA_API_KEY", "persona"],
    ["VERIFF_API_KEY", "veriff"],
    ["SUMSUB_APP_TOKEN", "sumsub"],
    ["SHUFTIPRO_CLIENT_ID", "shuftipro"],
    ["IDNOW_COMPANY_ID", "idnow"],
  ];
  return checks.filter(([k]) => process.env[k]).map(([, n]) => n);
}

/** Returns the first available KYC adapter (operator's preferred vendor). */
export function preferredKycAdapter(): KycVendorAdapter {
  const adapters = activeKycAdapters();
  return adapters[0] ?? NULL_KYC_ADAPTER;
}
