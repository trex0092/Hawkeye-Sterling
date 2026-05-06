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

// ── Socure — premium identity / risk ──────────────────────────────────
function socureAdapter(): KycVendorAdapter {
  const key = process.env["SOCURE_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const [first, ...rest] = req.subjectName.split(/\s+/);
        const body = {
          modules: ["kyc", "watchlist"],
          firstName: first ?? req.subjectName,
          surName: rest.join(" "),
          email: req.email,
          mobileNumber: req.phone,
          country: req.countryCode,
        };
        const res = await abortable(
          fetch("https://api.socure.com/api/3.0/EmailAuthScore", {
            method: "POST",
            headers: { Authorization: `SocureApiKey ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "socure", error: `lookup failed (${res.status})` };
        const json = (await res.json()) as { referenceId?: string; kyc?: { decision?: { value?: string } } };
        const decision = json.kyc?.decision?.value;
        const status = decision === "accept" ? "approved" : decision === "reject" ? "declined" : "review";
        return { ok: true, provider: "socure", sessionId: json.referenceId, status };
      } catch (err) {
        return { ok: false, provider: "socure", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Alloy — premium identity orchestration ────────────────────────────
function alloyAdapter(): KycVendorAdapter {
  const apiToken = process.env["ALLOY_API_TOKEN"];
  const apiSecret = process.env["ALLOY_API_SECRET"];
  if (!apiToken || !apiSecret) return NULL_KYC_ADAPTER;
  const auth = Buffer.from(`${apiToken}:${apiSecret}`).toString("base64");
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const [first, ...rest] = req.subjectName.split(/\s+/);
        const body = {
          name_first: first ?? req.subjectName,
          name_last: rest.join(" "),
          email_address: req.email,
          phone_number: req.phone,
          country_code: req.countryCode,
        };
        const res = await abortable(
          fetch("https://sandbox.alloy.co/v1/evaluations", {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "alloy", error: `evaluation failed (${res.status})` };
        const json = (await res.json()) as { evaluation_token?: string; summary?: { outcome?: string } };
        const out = json.summary?.outcome;
        const status = out === "Approved" ? "approved" : out === "Denied" ? "declined" : "review";
        return { ok: true, provider: "alloy", sessionId: json.evaluation_token, status };
      } catch (err) {
        return { ok: false, provider: "alloy", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── ComplyCube — KYC/IDV ──────────────────────────────────────────────
function complyCubeAdapter(): KycVendorAdapter {
  const key = process.env["COMPLYCUBE_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const [first, ...rest] = req.subjectName.split(/\s+/);
        const clientRes = await abortable(
          fetch("https://api.complycube.com/v1/clients", {
            method: "POST",
            headers: { Authorization: key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ type: "person", personDetails: { firstName: first ?? req.subjectName, lastName: rest.join(" ") }, email: req.email }),
          }),
        );
        if (!clientRes.ok) return { ok: false, provider: "complycube", error: `client create failed (${clientRes.status})` };
        const client = (await clientRes.json()) as { id?: string };
        if (!client.id) return { ok: false, provider: "complycube", error: "no client id" };
        const tokRes = await abortable(
          fetch("https://api.complycube.com/v1/tokens", {
            method: "POST",
            headers: { Authorization: key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ clientId: client.id, referrer: "*://*/*" }),
          }),
        );
        const tok = tokRes.ok ? ((await tokRes.json()) as { token?: string }) : { token: undefined };
        return { ok: true, provider: "complycube", sessionId: client.id, redirectUrl: tok.token ? `https://app.complycube.com/sdk/${tok.token}` : undefined, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "complycube", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── GBG (formerly Acuant) ID3global ──────────────────────────────────
function gbgAdapter(): KycVendorAdapter {
  const key = process.env["GBG_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const [first, ...rest] = req.subjectName.split(/\s+/);
        const body = {
          ProfileIDVersion: { Version: 0, ProfileID: process.env["GBG_PROFILE_ID"] ?? "" },
          InputData: {
            Personal: { PersonalDetails: { Forename: first ?? req.subjectName, Surname: rest.join(" ") } },
            ContactDetails: { Email: req.email, MobileTelephone: req.phone },
            CurrentAddress: { Country: req.countryCode },
          },
        };
        const res = await abortable(
          fetch("https://pilot.id3global.com/ID3gWS/ID3global.svc/json/AuthenticateSP", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "gbg", error: `authenticate failed (${res.status})` };
        const json = (await res.json()) as { AuthenticationID?: string; BandText?: string };
        const status = json.BandText === "PASS" ? "approved" : json.BandText === "REFER" ? "review" : json.BandText === "ALERT" ? "declined" : "pending";
        return { ok: true, provider: "gbg", sessionId: json.AuthenticationID, status };
      } catch (err) {
        return { ok: false, provider: "gbg", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── AU10TIX — premium IDV ────────────────────────────────────────────
function au10tixAdapter(): KycVendorAdapter {
  const key = process.env["AU10TIX_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          fullName: req.subjectName,
          email: req.email,
          phone: req.phone,
          country: req.countryCode,
        };
        const res = await abortable(
          fetch("https://eus-api.au10tixservices.com/v1/sessions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "au10tix", error: `session failed (${res.status})` };
        const json = (await res.json()) as { sessionId?: string; redirectUrl?: string };
        return { ok: true, provider: "au10tix", sessionId: json.sessionId, redirectUrl: json.redirectUrl, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "au10tix", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Mitek MiPass / MobileVerify ──────────────────────────────────────
function mitekAdapter(): KycVendorAdapter {
  const key = process.env["MITEK_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          customerReference: `hs-${Date.now()}`,
          subject: { fullName: req.subjectName, email: req.email, country: req.countryCode },
        };
        const res = await abortable(
          fetch("https://api.mitekservices.com/v2/verification", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "mitek", error: `verification failed (${res.status})` };
        const json = (await res.json()) as { verificationId?: string; redirectUrl?: string };
        return { ok: true, provider: "mitek", sessionId: json.verificationId, redirectUrl: json.redirectUrl, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "mitek", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Yoti ─────────────────────────────────────────────────────────────
function yotiAdapter(): KycVendorAdapter {
  const sdkId = process.env["YOTI_SDK_ID"];
  const key = process.env["YOTI_API_KEY"];
  if (!sdkId || !key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          session_deadline: new Date(Date.now() + 86_400_000).toISOString(),
          resources_ttl: 86_400,
          ...(req.email ? { user_tracking_id: req.email } : {}),
          notifications: process.env["YOTI_CALLBACK_URL"] ? { endpoint: process.env["YOTI_CALLBACK_URL"], topics: ["RESOURCE_UPDATE"] } : undefined,
          requested_checks: [{ type: "ID_DOCUMENT_AUTHENTICITY" }, { type: "ID_DOCUMENT_FACE_MATCH" }],
        };
        const res = await abortable(
          fetch(`https://api.yoti.com/idverify/v1/sessions?sdkId=${sdkId}`, {
            method: "POST",
            headers: { "X-Yoti-Auth-Digest": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "yoti", error: `session failed (${res.status})` };
        const json = (await res.json()) as { session_id?: string; client_session_token?: string };
        return { ok: true, provider: "yoti", sessionId: json.session_id, redirectUrl: json.client_session_token ? `https://api.yoti.com/idverify/v1/web/index.html?sessionID=${json.session_id}&sessionToken=${json.client_session_token}` : undefined, status: "pending" };
      } catch (err) {
        return { ok: false, provider: "yoti", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Stripe Identity ──────────────────────────────────────────────────
function stripeIdentityAdapter(): KycVendorAdapter {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const params = new URLSearchParams({
          type: "document",
          "metadata[reference]": `hs-${Date.now()}`,
          ...(req.email ? { "metadata[email]": req.email } : {}),
        });
        const res = await abortable(
          fetch("https://api.stripe.com/v1/identity/verification_sessions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          }),
        );
        if (!res.ok) return { ok: false, provider: "stripe-identity", error: `session failed (${res.status})` };
        const json = (await res.json()) as { id?: string; url?: string; status?: string; client_secret?: string };
        const status = json.status === "verified" ? "approved" : json.status === "canceled" ? "declined" : "pending";
        return { ok: true, provider: "stripe-identity", sessionId: json.id, redirectUrl: json.url, status };
      } catch (err) {
        return { ok: false, provider: "stripe-identity", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Plaid Identity Verification ──────────────────────────────────────
function plaidIdentityAdapter(): KycVendorAdapter {
  const clientId = process.env["PLAID_CLIENT_ID"];
  const secret = process.env["PLAID_SECRET"];
  if (!clientId || !secret) return NULL_KYC_ADAPTER;
  const env = process.env["PLAID_ENV"] ?? "production";
  const base = env === "sandbox" ? "https://sandbox.plaid.com" : env === "development" ? "https://development.plaid.com" : "https://production.plaid.com";
  const templateId = process.env["PLAID_IDV_TEMPLATE_ID"];
  if (!templateId) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          client_id: clientId,
          secret,
          is_shareable: true,
          template_id: templateId,
          gave_consent: true,
          user: { client_user_id: `hs-${Date.now()}`, email_address: req.email, phone_number: req.phone },
        };
        const res = await abortable(
          fetch(`${base}/identity_verification/create`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "plaid-identity", error: `create failed (${res.status})` };
        const json = (await res.json()) as { id?: string; status?: string; shareable_url?: string };
        const status = json.status === "success" ? "approved" : json.status === "failed" ? "declined" : "pending";
        return { ok: true, provider: "plaid-identity", sessionId: json.id, redirectUrl: json.shareable_url, status };
      } catch (err) {
        return { ok: false, provider: "plaid-identity", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── ID.me ────────────────────────────────────────────────────────────
function idMeAdapter(): KycVendorAdapter {
  const clientId = process.env["IDME_CLIENT_ID"];
  const clientSecret = process.env["IDME_CLIENT_SECRET"];
  const redirectUri = process.env["IDME_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (_req) => {
      void _req;
      // ID.me uses an OAuth flow rather than a server-to-server check; we
      // build the redirect URL the operator UI hands the subject.
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid",
        state: `hs-${Date.now()}`,
      });
      return {
        ok: true,
        provider: "idme",
        sessionId: params.get("state") ?? undefined,
        redirectUrl: `https://api.id.me/oauth/authorize?${params.toString()}`,
        status: "pending",
      };
    },
  };
}

// ── IDology — premium IDV ────────────────────────────────────────────
function idologyAdapter(): KycVendorAdapter {
  const username = process.env["IDOLOGY_USERNAME"];
  const password = process.env["IDOLOGY_PASSWORD"];
  if (!username || !password) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const params = new URLSearchParams({
          username, password,
          firstName: req.subjectName.split(/\s+/)[0] ?? req.subjectName,
          lastName: req.subjectName.split(/\s+/).slice(1).join(" "),
          ...(req.email ? { email: req.email } : {}),
          ...(req.countryCode ? { country: req.countryCode } : {}),
          output: "json",
        });
        const res = await abortable(
          fetch(`https://web.idologylive.com/api/idiq.svc?${params.toString()}`, {
            method: "POST",
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return { ok: false, provider: "idology", error: `lookup failed (${res.status})` };
        const json = (await res.json()) as { response?: { id?: string; results?: { key?: string } } };
        const k = json.response?.results?.key;
        const status = k === "result.match" ? "approved" : k === "result.no.match" ? "declined" : "review";
        return { ok: true, provider: "idology", sessionId: json.response?.id, status };
      } catch (err) { return { ok: false, provider: "idology", error: err instanceof Error ? err.message : String(err) }; }
    },
  };
}

// ── LexisNexis ThreatMetrix — premium device + identity risk ────────
function threatMetrixAdapter(): KycVendorAdapter {
  const orgId = process.env["THREATMETRIX_ORG_ID"];
  const apiKey = process.env["THREATMETRIX_API_KEY"];
  if (!orgId || !apiKey) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const params = new URLSearchParams({
          org_id: orgId,
          api_key: apiKey,
          full_name: req.subjectName,
          ...(req.email ? { email: req.email } : {}),
          ...(req.phone ? { phone: req.phone } : {}),
          ...(req.countryCode ? { country: req.countryCode } : {}),
          service_type: "session-policy",
        });
        const res = await abortable(
          fetch(`https://h.online-metrix.net/api?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return { ok: false, provider: "threatmetrix", error: `lookup failed (${res.status})` };
        const json = (await res.json()) as { request_id?: string; review_status?: string };
        const status = json.review_status === "pass" ? "approved" : json.review_status === "reject" ? "declined" : "review";
        return { ok: true, provider: "threatmetrix", sessionId: json.request_id, status };
      } catch (err) { return { ok: false, provider: "threatmetrix", error: err instanceof Error ? err.message : String(err) }; }
    },
  };
}

// ── Sift — premium fraud / risk decisioning ─────────────────────────
function siftAdapter(): KycVendorAdapter {
  const key = process.env["SIFT_API_KEY"];
  const accountId = process.env["SIFT_ACCOUNT_ID"];
  if (!key || !accountId) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          $type: "$create_account",
          $api_key: key,
          $user_id: `hs-${Date.now()}`,
          $name: req.subjectName,
          ...(req.email ? { $user_email: req.email } : {}),
          ...(req.phone ? { $phone: req.phone } : {}),
          ...(req.countryCode ? { $country: req.countryCode } : {}),
        };
        const res = await abortable(
          fetch("https://api.sift.com/v205/events", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "sift", error: `event failed (${res.status})` };
        const json = (await res.json()) as { request?: string; status?: number; score?: number };
        const status = typeof json.score === "number" && json.score < 30 ? "approved" : typeof json.score === "number" && json.score > 70 ? "declined" : "review";
        return { ok: true, provider: "sift", sessionId: json.request, status };
      } catch (err) { return { ok: false, provider: "sift", error: err instanceof Error ? err.message : String(err) }; }
    },
  };
}

// ── HyperVerge — premium IDV (APAC focus) ────────────────────────────
function hyperVergeAdapter(): KycVendorAdapter {
  const appId = process.env["HYPERVERGE_APP_ID"];
  const appKey = process.env["HYPERVERGE_APP_KEY"];
  if (!appId || !appKey) return NULL_KYC_ADAPTER;
  return {
    isAvailable: () => true,
    createCheck: async (req) => {
      try {
        const body = {
          fullName: req.subjectName,
          ...(req.email ? { email: req.email } : {}),
          ...(req.phone ? { phone: req.phone } : {}),
          ...(req.countryCode ? { country: req.countryCode } : {}),
          callbackUrl: process.env["HYPERVERGE_CALLBACK_URL"] ?? "",
        };
        const res = await abortable(
          fetch("https://ind.idv.hyperverge.co/v1/link-kyc/sessions", {
            method: "POST",
            headers: { appId, appKey, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return { ok: false, provider: "hyperverge", error: `session failed (${res.status})` };
        const json = (await res.json()) as { result?: { transactionId?: string; url?: string } };
        return { ok: true, provider: "hyperverge", sessionId: json.result?.transactionId, redirectUrl: json.result?.url, status: "pending" };
      } catch (err) { return { ok: false, provider: "hyperverge", error: err instanceof Error ? err.message : String(err) }; }
    },
  };
}

// ── 6 more KYC vendors (22 → 28) ─────────────────────────────────────────
function ekataAdapter(): KycVendorAdapter {
  const key = process.env["EKATA_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const res = await abortable(fetch("https://api.ekata.com/3.0/identity_check", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ name: req.subjectName, email: req.email, phone: req.phone, country_code: req.countryCode }) }));
      if (!res.ok) return { ok: false, provider: "ekata", error: `lookup failed (${res.status})` };
      const json = (await res.json()) as { id?: string; identity_check_score?: number };
      const status: KycCheckResult["status"] = (json.identity_check_score ?? 0) > 700 ? "approved" : (json.identity_check_score ?? 0) < 300 ? "declined" : "review";
      return { ok: true, provider: "ekata", sessionId: json.id, status };
    } catch (err) { return { ok: false, provider: "ekata", error: err instanceof Error ? err.message : String(err) }; }
  }};
}
function fourthlineAdapter(): KycVendorAdapter {
  const key = process.env["FOURTHLINE_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const [first, ...rest] = req.subjectName.split(/\s+/);
      const res = await abortable(fetch("https://api.fourthline.com/v3/identifications", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ firstName: first, lastName: rest.join(" "), email: req.email, country: req.countryCode }) }));
      if (!res.ok) return { ok: false, provider: "fourthline", error: `start failed (${res.status})` };
      const j = (await res.json()) as { id?: string; sessionUrl?: string };
      return { ok: true, provider: "fourthline", sessionId: j.id, redirectUrl: j.sessionUrl, status: "pending" };
    } catch (err) { return { ok: false, provider: "fourthline", error: err instanceof Error ? err.message : String(err) }; }
  }};
}
function microblinkAdapter(): KycVendorAdapter {
  const key = process.env["MICROBLINK_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const res = await abortable(fetch("https://api.microblink.com/v1/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ name: req.subjectName, country: req.countryCode }) }));
      if (!res.ok) return { ok: false, provider: "microblink", error: `session failed (${res.status})` };
      const j = (await res.json()) as { sessionId?: string; sessionUrl?: string };
      return { ok: true, provider: "microblink", sessionId: j.sessionId, redirectUrl: j.sessionUrl, status: "pending" };
    } catch (err) { return { ok: false, provider: "microblink", error: err instanceof Error ? err.message : String(err) }; }
  }};
}
function regulaAdapter(): KycVendorAdapter {
  const key = process.env["REGULA_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const res = await abortable(fetch("https://api.regulaforensics.com/v1/process", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ subjectName: req.subjectName, country: req.countryCode }) }));
      if (!res.ok) return { ok: false, provider: "regula", error: `process failed (${res.status})` };
      const j = (await res.json()) as { transactionId?: string; status?: string };
      const status: KycCheckResult["status"] = j.status === "approved" ? "approved" : j.status === "declined" ? "declined" : "pending";
      return { ok: true, provider: "regula", sessionId: j.transactionId, status };
    } catch (err) { return { ok: false, provider: "regula", error: err instanceof Error ? err.message : String(err) }; }
  }};
}
function veridasAdapter(): KycVendorAdapter {
  const key = process.env["VERIDAS_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const res = await abortable(fetch("https://api.veridas.com/v1/onboarding/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ user: { name: req.subjectName, email: req.email, country: req.countryCode } }) }));
      if (!res.ok) return { ok: false, provider: "veridas", error: `session failed (${res.status})` };
      const j = (await res.json()) as { id?: string; url?: string };
      return { ok: true, provider: "veridas", sessionId: j.id, redirectUrl: j.url, status: "pending" };
    } catch (err) { return { ok: false, provider: "veridas", error: err instanceof Error ? err.message : String(err) }; }
  }};
}
function passbaseAdapter(): KycVendorAdapter {
  const key = process.env["PASSBASE_API_KEY"];
  if (!key) return NULL_KYC_ADAPTER;
  return { isAvailable: () => true, createCheck: async (req) => {
    try {
      const res = await abortable(fetch("https://api.passbase.com/verification/v1/identities", { method: "POST", headers: { "X-API-KEY": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ external_user_id: `hs-${Date.now()}`, name: req.subjectName, country: req.countryCode }) }));
      if (!res.ok) return { ok: false, provider: "passbase", error: `start failed (${res.status})` };
      const j = (await res.json()) as { id?: string; redirect_url?: string };
      return { ok: true, provider: "passbase", sessionId: j.id, redirectUrl: j.redirect_url, status: "pending" };
    } catch (err) { return { ok: false, provider: "passbase", error: err instanceof Error ? err.message : String(err) }; }
  }};
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
    socureAdapter(),
    alloyAdapter(),
    complyCubeAdapter(),
    gbgAdapter(),
    au10tixAdapter(),
    mitekAdapter(),
    yotiAdapter(),
    stripeIdentityAdapter(),
    plaidIdentityAdapter(),
    idMeAdapter(),
    idologyAdapter(),
    threatMetrixAdapter(),
    siftAdapter(),
    hyperVergeAdapter(),
    ekataAdapter(),
    fourthlineAdapter(),
    microblinkAdapter(),
    regulaAdapter(),
    veridasAdapter(),
    passbaseAdapter(),
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
    ["SOCURE_API_KEY", "socure"],
    ["ALLOY_API_TOKEN", "alloy"],
    ["COMPLYCUBE_API_KEY", "complycube"],
    ["GBG_API_KEY", "gbg"],
    ["AU10TIX_API_KEY", "au10tix"],
    ["MITEK_API_KEY", "mitek"],
    ["YOTI_SDK_ID", "yoti"],
    ["STRIPE_SECRET_KEY", "stripe-identity"],
    ["PLAID_CLIENT_ID", "plaid-identity"],
    ["IDME_CLIENT_ID", "idme"],
    ["IDOLOGY_USERNAME", "idology"],
    ["THREATMETRIX_ORG_ID", "threatmetrix"],
    ["SIFT_API_KEY", "sift"],
    ["HYPERVERGE_APP_ID", "hyperverge"],
  ];
  return checks.filter(([k]) => process.env[k]).map(([, n]) => n);
}

/** Returns the first available KYC adapter (operator's preferred vendor). */
export function preferredKycAdapter(): KycVendorAdapter {
  const adapters = activeKycAdapters();
  return adapters[0] ?? NULL_KYC_ADAPTER;
}
