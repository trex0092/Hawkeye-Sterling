// GET /api/integrations/status
//
// Integration health dashboard. Returns per-vendor, per-category
// readiness derived from env vars and live ping probes where
// feasible. No secrets are emitted — only boolean availability and
// status strings.
//
// Auth: portal admin token or API key (read-only). Returns 401 if
// anonymous and requireAuth was set.
//
// Response shape:
//   {
//     ok: boolean,         ← true only when all CRITICAL checks pass
//     ts: ISO,
//     summary: { healthy, degraded, down, unconfigured, total },
//     categories: [{
//       name, checks: [{ id, label, status, detail?, latencyMs? }]
//     }]
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type IntegrationStatus = "healthy" | "degraded" | "down" | "unconfigured";

interface IntegrationCheck {
  id: string;
  label: string;
  status: IntegrationStatus;
  critical: boolean;
  detail?: string;
  latencyMs?: number;
}

interface IntegrationCategory {
  name: string;
  checks: IntegrationCheck[];
}

function envPresent(...vars: string[]): boolean {
  return vars.some((v) => !!process.env[v]?.trim());
}

function envCheck(
  id: string,
  label: string,
  envVars: string[],
  critical: boolean,
  helpText?: string,
): IntegrationCheck {
  const present = envPresent(...envVars);
  return {
    id,
    label,
    status: present ? "healthy" : "unconfigured",
    critical,
    detail: present
      ? `Configured via ${envVars.find((v) => !!process.env[v]?.trim()) ?? envVars[0]}`
      : helpText ?? `Set ${envVars[0]} to enable`,
  };
}

async function pingCheck(
  id: string,
  label: string,
  url: string,
  critical: boolean,
  timeoutMs = 3000,
  method: "GET" | "HEAD" = "GET",
): Promise<IntegrationCheck> {
  // GET by default. HEAD is rejected with 405 by several health endpoints
  // (OpenSanctions /healthz, OFAC's CDN) which makes the probe report
  // "degraded" for an upstream that is actually fine.
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { "user-agent": "hawkeye-sterling-health/1" },
    });
    clearTimeout(timer);
    const ok = res.ok;
    return {
      id,
      label,
      status: ok ? "healthy" : "degraded",
      critical,
      detail: `HTTP ${res.status}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      id,
      label,
      status: "down",
      critical,
      detail: isTimeout ? "timeout" : err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - t0,
    };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Core required env vars
  const coreChecks: IntegrationCheck[] = [
    envCheck("anthropic", "Anthropic API (Claude)", ["ANTHROPIC_API_KEY"], true, "Required for AI-powered screening, narrative generation, and MLRO advisor"),
    envCheck("audit_secret", "Audit Chain HMAC Secret", ["AUDIT_CHAIN_SECRET"], true, "Required for tamper-evident audit trail. Generate: openssl rand -hex 64"),
    envCheck("admin_token", "Admin Portal Token", ["ADMIN_TOKEN"], true, "Required for same-origin portal API access"),
  ];

  // Sanctions sources
  // Each adapter that requires exceljs (XLSX parsing) is annotated as
  // "opt-in" — its status reflects URL-availability, not whether exceljs
  // is installed; the runtime adapter throws a clear error if exceljs is
  // missing, which the ingest-error log captures.
  const sanctionsChecks: IntegrationCheck[] = [
    { id: "ofac_sdn", label: "OFAC SDN List", status: "healthy", critical: true, detail: "Direct URL (no key required)" },
    { id: "ofac_cons", label: "OFAC Consolidated Non-SDN", status: "healthy", critical: true, detail: "Direct URL (no key required)" },
    { id: "un_consolidated", label: "UN Consolidated Sanctions", status: "healthy", critical: true, detail: "Direct URL (no key required)" },
    { id: "eu_fsf", label: "EU Financial Sanctions Files", status: "healthy", critical: true, detail: "Direct URL (no key required)" },
    { id: "uk_ofsi", label: "UK OFSI Sanctions List", status: "healthy", critical: true, detail: "Direct URL (no key required)" },
    { id: "ca_osfi", label: "Canada OSFI Consolidated Sanctions", status: "healthy", critical: false, detail: "Direct URL (no key required)" },
    { id: "ch_seco", label: "Switzerland SECO Sanctions", status: "healthy", critical: false, detail: "Direct URL (no key required)" },
    { id: "au_dfat", label: "Australia DFAT Consolidated Sanctions", status: "healthy", critical: false, detail: "Direct URL — opt-in: requires 'exceljs' npm package for XLSX parsing" },
    envCheck("jp_mof", "Japan MOF Economic Sanctions", ["FEED_JP_MOF"], false, "Opt-in: set FEED_JP_MOF to comma-separated XLSX URLs + install 'exceljs' npm package"),
    { id: "fatf", label: "FATF Call-for-Action / Monitoring", status: "healthy", critical: false, detail: "Direct URL (no key required)" },
    { id: "uae_eocn_xlsx", label: "UAE EOCN (Local Terrorist List, XLSX scraper)", status: "healthy", critical: false, detail: "Direct URL — opt-in: requires 'exceljs' npm package for XLSX parsing" },
    envCheck("uae_eocn_seed", "UAE EOCN seed-based fallback", ["UAE_EOCN_SEED_PATH", "UAE_EOCN_URL"], false, "Set UAE_EOCN_SEED_PATH to local JSON seed (legacy path)"),
    envCheck("uae_ltl", "UAE Local Terrorist List (seed fallback)", ["UAE_LTL_SEED_PATH", "UAE_LTL_URL"], false, "Set UAE_LTL_SEED_PATH to local JSON seed"),
  ];

  // Commercial screening vendors
  //
  // LSEG has two distinct API surfaces wired in this codebase:
  //   - World-Check One (REST, HMAC):  LSEG_WORLDCHECK_API_KEY + _SECRET
  //     → consumed by web/app/api/pep-profile/route.ts
  //   - CFS / RDP (OAuth2 password):    LSEG_USERNAME + LSEG_PASSWORD + LSEG_APP_KEY
  //     → consumed by netlify/functions/lseg-cfs-poll.mts + src/integrations/lseg.ts
  // Both are reported separately so an operator can see which integration
  // path is active.
  const lsegCfsPresent =
    envPresent("LSEG_USERNAME") && envPresent("LSEG_PASSWORD") && envPresent("LSEG_APP_KEY");
  const lsegCfsCheck: IntegrationCheck = {
    id: "lseg_cfs",
    label: "LSEG CFS / RDP (OAuth2)",
    status: lsegCfsPresent ? "healthy" : "unconfigured",
    critical: false,
    detail: lsegCfsPresent
      ? "Configured via LSEG_USERNAME + LSEG_PASSWORD + LSEG_APP_KEY (bulk CFS + news + alerts via netlify/functions/lseg-cfs-poll.mts every 6 h)"
      : "Set LSEG_USERNAME + LSEG_PASSWORD + LSEG_APP_KEY to enable bulk CFS ingestion + news + alerts",
  };
  const commercialChecks: IntegrationCheck[] = [
    envCheck("lseg_worldcheck", "LSEG World-Check One (REST)", ["LSEG_WORLDCHECK_API_KEY"], false, "Set LSEG_WORLDCHECK_API_KEY (+ optional _SECRET) to enable per-screening World-Check lookup"),
    lsegCfsCheck,
    envCheck("dowjones_rc", "Dow Jones Risk & Compliance", ["DOWJONES_RC_API_KEY"], false),
    envCheck("complyadvantage", "ComplyAdvantage", ["COMPLYADVANTAGE_API_KEY"], false),
    envCheck("sayari", "Sayari Graph", ["SAYARI_API_KEY"], false),
    envCheck("refinitiv", "Refinitiv", ["REFINITIV_CLIENT_ID", "REFINITIV_API_KEY"], false),
    envCheck("opensanctions", "OpenSanctions API", ["OPENSANCTIONS_API_KEY"], false, "Free tier available; set key for higher quota"),
  ];

  // News & adverse media
  const newsChecks: IntegrationCheck[] = [
    envCheck("newsapi", "NewsAPI", ["NEWSAPI_KEY"], false),
    envCheck("gnews", "GNews", ["GNEWS_API_KEY"], false),
    envCheck("guardian", "The Guardian API", ["GUARDIAN_API_KEY"], false),
    envCheck("nyt", "New York Times API", ["NYT_API_KEY"], false),
    envCheck("aleph", "OCCRP Aleph", ["ALEPH_API_KEY"], false),
    envCheck("gdelt", "GDELT Project", [], false, "No key required — always available"),
  ];

  // Corporate registry adapters
  const registryChecks: IntegrationCheck[] = [
    envCheck("opencorporates", "OpenCorporates", ["OPENCORPORATES_API_KEY"], false),
    envCheck("companies_house", "UK Companies House", ["COMPANIES_HOUSE_API_KEY"], false),
    envCheck("gleif", "GLEIF LEI Registry", [], false, "No key required — always available"),
    envCheck("sec_edgar", "SEC EDGAR (EDGAR)", [], false, "No key required — always available"),
    envCheck("icij", "ICIJ Offshore Leaks", [], false, "No key required — always available"),
  ];

  // Crypto on-chain intelligence
  const cryptoChecks: IntegrationCheck[] = [
    envCheck("chainalysis", "Chainalysis KYT", ["CHAINALYSIS_API_KEY"], false),
    envCheck("trm_labs", "TRM Labs", ["TRM_API_KEY"], false),
    envCheck("elliptic", "Elliptic", ["ELLIPTIC_API_KEY"], false),
    envCheck("ciphertrace", "CipherTrace", ["CIPHERTRACE_API_KEY"], false),
  ];

  // KYC / Identity verification
  const kycChecks: IntegrationCheck[] = [
    envCheck("onfido", "Onfido", ["ONFIDO_API_KEY"], false),
    envCheck("jumio", "Jumio", ["JUMIO_API_TOKEN"], false),
    envCheck("trulioo", "Trulioo", ["TRULIOO_API_KEY"], false),
    envCheck("sum_sub", "Sum&Substance (Sumsub)", ["SUMSUB_API_KEY"], false),
  ];

  // Operational integrations
  const opsChecks: IntegrationCheck[] = [
    envCheck("asana", "Asana (Case inbox)", ["ASANA_TOKEN"], false, "Required for case task creation"),
    envCheck("goaml_entity", "goAML Reporting Entity", ["GOAML_RENTITY_ID", "HAWKEYE_ENTITIES"], false, "Required for STR XML generation"),
    envCheck("ongoing_token", "Ongoing Monitor Token", ["ONGOING_RUN_TOKEN"], false, "Required for /api/ongoing/run"),
    envCheck("sanctions_cron", "Sanctions Cron Token", ["SANCTIONS_CRON_TOKEN"], false, "Required for scheduled sanctions refresh"),
    envCheck("upstash_redis", "Upstash Redis (rate limiting)", ["UPSTASH_REDIS_REST_URL"], false, "Recommended for production rate limiting; falls back to Blobs"),
  ];

  // Live pings (best-effort — don't fail the status page if network is restricted)
  const liveChecks = await Promise.allSettled([
    pingCheck("opensanctions_live", "OpenSanctions API (live)", "https://api.opensanctions.org/healthz", false, 3000),
    pingCheck("gleif_live", "GLEIF API (live)", "https://api.gleif.org/api/v1/lei-records?page[size]=1", false, 3000),
  ]);

  const resolvedLiveChecks: IntegrationCheck[] = liveChecks.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          id: `live_probe_${i}`,
          label: `Live probe ${i}`,
          status: "down" as const,
          critical: false,
          detail: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );

  const categories: IntegrationCategory[] = [
    { name: "Core Requirements", checks: coreChecks },
    { name: "Sanctions & Watchlists", checks: sanctionsChecks },
    { name: "Commercial Screening Vendors", checks: commercialChecks },
    { name: "News & Adverse Media", checks: newsChecks },
    { name: "Corporate Registry", checks: registryChecks },
    { name: "Crypto On-Chain Intelligence", checks: cryptoChecks },
    { name: "KYC / Identity Verification", checks: kycChecks },
    { name: "Operational Integrations", checks: opsChecks },
    { name: "Live Connectivity Probes", checks: resolvedLiveChecks },
  ];

  const allChecks = categories.flatMap((c) => c.checks);
  const summary = {
    healthy: allChecks.filter((c) => c.status === "healthy").length,
    degraded: allChecks.filter((c) => c.status === "degraded").length,
    down: allChecks.filter((c) => c.status === "down").length,
    unconfigured: allChecks.filter((c) => c.status === "unconfigured").length,
    total: allChecks.length,
  };

  // Critical checks must all pass
  const criticalFailed = allChecks.filter(
    (c) => c.critical && c.status !== "healthy",
  );
  const ok = criticalFailed.length === 0;

  return NextResponse.json(
    {
      ok,
      ts: new Date().toISOString(),
      summary,
      criticalFailures: criticalFailed.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
      categories,
    },
    { status: ok ? 200 : 503, headers: gate.headers },
  );
}
