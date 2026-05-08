// GET /api/env-check
//
// Returns per-variable configuration status for the environment checker page.
// NEVER emits actual variable values — only boolean presence and hints.
// Requires admin token (portal session) — 401 for unauthenticated requests.
//
// Response:
//   {
//     ok: boolean,   ← true only when all required vars are set
//     ts: ISO,
//     summary: { requiredConfigured, requiredMissing, optionalConfigured, optionalMissing },
//     checks: [{ id, label, group, required, present, hint }]
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

interface EnvSpec {
  id: string;
  label: string;
  group: string;
  required: boolean;
  vars: string[];      // any one of these being non-empty counts as "present"
  hint: string;
}

const ENV_SPECS: EnvSpec[] = [
  // Core Required
  { id: "anthropic_api_key", label: "ANTHROPIC_API_KEY", group: "Core Required", required: true, vars: ["ANTHROPIC_API_KEY"], hint: "Anthropic Claude API key. Required for all AI-powered features." },
  { id: "audit_chain_secret", label: "AUDIT_CHAIN_SECRET", group: "Core Required", required: true, vars: ["AUDIT_CHAIN_SECRET"], hint: "HMAC-SHA256 key for tamper-evident audit chain. Generate: openssl rand -hex 64" },
  { id: "admin_token", label: "ADMIN_TOKEN", group: "Core Required", required: true, vars: ["ADMIN_TOKEN"], hint: "Admin portal bearer token. Generate: openssl rand -hex 32" },
  { id: "ongoing_run_token", label: "ONGOING_RUN_TOKEN", group: "Core Required", required: true, vars: ["ONGOING_RUN_TOKEN"], hint: "Bearer token for /api/ongoing/run. Required for ongoing monitoring." },
  { id: "sanctions_cron_token", label: "SANCTIONS_CRON_TOKEN", group: "Core Required", required: true, vars: ["SANCTIONS_CRON_TOKEN"], hint: "Bearer token for scheduled sanctions refresh. Required for list ingestion." },
  { id: "app_url", label: "NEXT_PUBLIC_APP_URL", group: "Core Required", required: true, vars: ["NEXT_PUBLIC_APP_URL"], hint: "Public URL of this deployment. Required for webhook callbacks." },

  // goAML / FIU Reporting
  { id: "goaml_entities", label: "HAWKEYE_ENTITIES", group: "goAML / FIU Reporting", required: true, vars: ["HAWKEYE_ENTITIES", "GOAML_RENTITY_ID"], hint: "Reporting entity JSON array (or legacy GOAML_RENTITY_ID). Required for STR/SAR filing." },
  { id: "goaml_mlro_name", label: "GOAML_MLRO_FULL_NAME", group: "goAML / FIU Reporting", required: true, vars: ["GOAML_MLRO_FULL_NAME"], hint: "MLRO full name for STR filings." },
  { id: "goaml_mlro_email", label: "GOAML_MLRO_EMAIL", group: "goAML / FIU Reporting", required: true, vars: ["GOAML_MLRO_EMAIL"], hint: "MLRO email address for STR filings." },
  { id: "goaml_mlro_phone", label: "GOAML_MLRO_PHONE", group: "goAML / FIU Reporting", required: false, vars: ["GOAML_MLRO_PHONE"], hint: "MLRO phone number for STR filings." },

  // Sanctions Sources
  { id: "uae_eocn", label: "UAE_EOCN_SEED_PATH / UAE_EOCN_URL", group: "Sanctions Sources", required: false, vars: ["UAE_EOCN_SEED_PATH", "UAE_EOCN_URL"], hint: "UAE EOCN local terrorist list path or URL. UN/OFAC/EU/UK require no key." },
  { id: "uae_ltl", label: "UAE_LTL_SEED_PATH", group: "Sanctions Sources", required: false, vars: ["UAE_LTL_SEED_PATH", "UAE_LTL_URL"], hint: "UAE Local Terrorist List seed path." },

  // Commercial Screening Vendors
  { id: "opensanctions", label: "OPENSANCTIONS_API_KEY", group: "Commercial Screening Vendors", required: false, vars: ["OPENSANCTIONS_API_KEY"], hint: "OpenSanctions API. Free tier works without key at lower quota." },
  { id: "lseg_worldcheck", label: "LSEG_WORLDCHECK_API_KEY", group: "Commercial Screening Vendors", required: false, vars: ["LSEG_WORLDCHECK_API_KEY"], hint: "LSEG World-Check One paid screening API." },
  { id: "dowjones_rc", label: "DOWJONES_RC_API_KEY", group: "Commercial Screening Vendors", required: false, vars: ["DOWJONES_RC_API_KEY"], hint: "Dow Jones Risk & Compliance paid screening API." },
  { id: "complyadvantage", label: "COMPLYADVANTAGE_API_KEY", group: "Commercial Screening Vendors", required: false, vars: ["COMPLYADVANTAGE_API_KEY"], hint: "ComplyAdvantage paid screening API." },
  { id: "sayari", label: "SAYARI_API_KEY", group: "Commercial Screening Vendors", required: false, vars: ["SAYARI_API_KEY"], hint: "Sayari Graph corporate intelligence API." },

  // News & Adverse Media
  { id: "newsapi", label: "NEWSAPI_KEY", group: "News & Adverse Media", required: false, vars: ["NEWSAPI_KEY"], hint: "NewsAPI.org — adverse media discovery." },
  { id: "gnews", label: "GNEWS_API_KEY", group: "News & Adverse Media", required: false, vars: ["GNEWS_API_KEY"], hint: "GNews — multi-language news search." },
  { id: "guardian", label: "GUARDIAN_API_KEY", group: "News & Adverse Media", required: false, vars: ["GUARDIAN_API_KEY"], hint: "The Guardian API — free with registration." },
  { id: "nyt", label: "NYT_API_KEY", group: "News & Adverse Media", required: false, vars: ["NYT_API_KEY"], hint: "New York Times article search API." },
  { id: "aleph", label: "ALEPH_API_KEY", group: "News & Adverse Media", required: false, vars: ["ALEPH_API_KEY"], hint: "OCCRP Aleph — investigative data platform." },

  // Corporate Registry
  { id: "opencorporates", label: "OPENCORPORATES_API_KEY", group: "Corporate Registry", required: false, vars: ["OPENCORPORATES_API_KEY"], hint: "OpenCorporates corporate registry search." },
  { id: "companies_house", label: "COMPANIES_HOUSE_API_KEY", group: "Corporate Registry", required: false, vars: ["COMPANIES_HOUSE_API_KEY"], hint: "UK Companies House API." },
  { id: "sec_api", label: "SEC_EDGAR_API_KEY", group: "Corporate Registry", required: false, vars: ["SEC_EDGAR_API_KEY"], hint: "SEC EDGAR — US public company filings. Free without key." },

  // Crypto On-Chain Intelligence
  { id: "chainalysis", label: "CHAINALYSIS_API_KEY", group: "Crypto On-Chain Intelligence", required: false, vars: ["CHAINALYSIS_API_KEY"], hint: "Chainalysis KYT — crypto transaction monitoring." },
  { id: "trm_labs", label: "TRM_API_KEY", group: "Crypto On-Chain Intelligence", required: false, vars: ["TRM_API_KEY"], hint: "TRM Labs — blockchain intelligence." },
  { id: "elliptic", label: "ELLIPTIC_API_KEY", group: "Crypto On-Chain Intelligence", required: false, vars: ["ELLIPTIC_API_KEY"], hint: "Elliptic — crypto risk scoring." },

  // KYC / Identity Verification
  { id: "onfido", label: "ONFIDO_API_KEY", group: "KYC / Identity Verification", required: false, vars: ["ONFIDO_API_KEY"], hint: "Onfido identity verification." },
  { id: "jumio", label: "JUMIO_API_TOKEN", group: "KYC / Identity Verification", required: false, vars: ["JUMIO_API_TOKEN"], hint: "Jumio identity verification." },
  { id: "trulioo", label: "TRULIOO_API_KEY", group: "KYC / Identity Verification", required: false, vars: ["TRULIOO_API_KEY"], hint: "Trulioo global identity verification." },

  // Operational Integrations
  { id: "asana_token", label: "ASANA_TOKEN", group: "Operational Integrations", required: false, vars: ["ASANA_TOKEN"], hint: "Asana Personal Access Token for case inbox delivery." },
  { id: "asana_workspace", label: "ASANA_WORKSPACE_GID", group: "Operational Integrations", required: false, vars: ["ASANA_WORKSPACE_GID"], hint: "Asana workspace GID. Obtain from your Asana workspace URL." },
  { id: "asana_project", label: "ASANA_PROJECT_GID", group: "Operational Integrations", required: false, vars: ["ASANA_PROJECT_GID"], hint: "Asana master inbox project GID." },
  { id: "upstash_redis", label: "UPSTASH_REDIS_REST_URL", group: "Operational Integrations", required: false, vars: ["UPSTASH_REDIS_REST_URL"], hint: "Upstash Redis for production-grade rate limiting. Falls back to Blobs if unset." },
  { id: "upstash_redis_token", label: "UPSTASH_REDIS_REST_TOKEN", group: "Operational Integrations", required: false, vars: ["UPSTASH_REDIS_REST_TOKEN"], hint: "Upstash Redis REST token (required alongside UPSTASH_REDIS_REST_URL)." },
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const checks = ENV_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    group: spec.group,
    required: spec.required,
    present: spec.vars.some((v) => !!process.env[v]?.trim()),
    hint: spec.hint,
  }));

  const requiredConfigured = checks.filter((c) => c.required && c.present).length;
  const requiredMissing = checks.filter((c) => c.required && !c.present).length;
  const optionalConfigured = checks.filter((c) => !c.required && c.present).length;
  const optionalMissing = checks.filter((c) => !c.required && !c.present).length;

  return NextResponse.json(
    {
      ok: requiredMissing === 0,
      ts: new Date().toISOString(),
      summary: { requiredConfigured, requiredMissing, optionalConfigured, optionalMissing },
      checks,
    },
    { status: requiredMissing === 0 ? 200 : 207, headers: gate.headers },
  );
}
