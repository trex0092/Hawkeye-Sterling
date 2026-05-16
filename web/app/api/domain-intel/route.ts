// POST /api/domain-intel
// Domain intelligence — WHOIS, email security, DNS, risk score.
// Uses self-hosted web-check (WEB_CHECK_URL) when configured.
// Falls back to free public APIs (RDAP + Cloudflare DNS-over-HTTPS) when not.
// Body: { domain: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { domainIntel } from "../../../../dist/src/integrations/webCheck.js";
import type { DomainIntelResult } from "../../../../dist/src/integrations/webCheck.js";
import { lookupProviderByDomain, deriveRiskSignals } from "@/lib/intelligence/openBankingTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface DomainIntelBody {
  domain?: string;
}

// ── Free built-in provider (RDAP + Cloudflare DoH) ───────────────────────────
// Used when WEB_CHECK_URL is not configured. Provides real domain intelligence
// using only public, free, unauthenticated APIs.

interface RdapResponse {
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ roles: string[]; vcardArray?: unknown }>;
  ldhName?: string;
}

interface DoHResponse {
  Answer?: Array<{ type: number; data: string }>;
}

function daysBetween(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// Extract registrable domain (strip subdomains for RDAP)
function registrable(domain: string): string {
  const parts = domain.replace(/^https?:\/\//, "").split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
}

async function fetchRdap(domain: string): Promise<{
  created?: string;
  expires?: string;
  registrar?: string;
} | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrable(domain))}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RdapResponse;
    const created = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
    const expires = data.events?.find((e) => e.eventAction === "expiration")?.eventDate;
    return { created, expires };
  } catch {
    return null;
  }
}

async function fetchDnsTxt(domain: string): Promise<{ hasSPF: boolean; hasDMARC: boolean } | null> {
  try {
    const [spfRes, dmarcRes] = await Promise.all([
      fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5_000),
      }),
      fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5_000),
      }),
    ]);
    const spfData = spfRes.ok ? ((await spfRes.json()) as DoHResponse) : { Answer: [] };
    const dmarcData = dmarcRes.ok ? ((await dmarcRes.json()) as DoHResponse) : { Answer: [] };
    const hasSPF = (spfData.Answer ?? []).some((r) => r.data?.includes("v=spf1"));
    const hasDMARC = (dmarcData.Answer ?? []).some((r) => r.data?.includes("v=DMARC1"));
    return { hasSPF, hasDMARC };
  } catch {
    return null;
  }
}

async function domainIntelFree(domain: string): Promise<DomainIntelResult & { provider: string }> {
  const [rdap, dns] = await Promise.all([fetchRdap(domain), fetchDnsTxt(domain)]);

  let riskScore = 0;
  const riskFactors: string[] = [];

  if (rdap?.created) {
    const age = daysBetween(rdap.created);
    if (age < 30) { riskScore += 40; riskFactors.push(`domain age ${age}d (< 30 days — very new)`); }
    else if (age < 90) { riskScore += 25; riskFactors.push(`domain age ${age}d (< 90 days)`); }
    else if (age < 365) { riskScore += 10; riskFactors.push(`domain age ${age}d (< 1 year)`); }
  } else {
    riskScore += 15;
    riskFactors.push("WHOIS/RDAP creation date unavailable");
  }

  const hasSPF = dns?.hasSPF ?? false;
  const hasDMARC = dns?.hasDMARC ?? false;
  if (!hasSPF && !hasDMARC) {
    riskScore += 20;
    riskFactors.push("no SPF or DMARC — domain spoofing-enabled");
  } else if (!hasDMARC) {
    riskScore += 8;
    riskFactors.push("no DMARC policy");
  }

  const spoofingRisk: "low" | "medium" | "high" = !hasSPF && !hasDMARC ? "high" : !hasDMARC ? "medium" : "low";

  return {
    ok: true,
    domain,
    riskScore: Math.min(100, riskScore),
    riskFactors,
    provider: "rdap+doh",
    ...(rdap?.created
      ? {
          whois: {
            registrationDate: rdap.created,
            ...(rdap.expires ? { expiryDate: rdap.expires } : {}),
            ...(rdap.registrar ? { registrar: rdap.registrar } : {}),
            ageInDays: daysBetween(rdap.created),
          },
        }
      : {}),
    emailSecurity: { hasSPF, hasDKIM: false, hasDMARC, spoofingRisk },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  try {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: DomainIntelBody;
  try {
    body = (await req.json()) as DomainIntelBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  if (!body.domain?.trim()) {
    return NextResponse.json({ ok: false, error: "domain is required" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }
  if (body.domain.length > 2000) {
    return NextResponse.json({ ok: false, error: "domain exceeds 2000-character limit" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const domain = body.domain.trim();
  const result = await domainIntel(domain);

  // Open Banking Tracker enrichment — if the domain matches a known bank,
  // attach its profile + AML risk signals. Pure in-memory lookup; no I/O.
  const obProvider = lookupProviderByDomain(domain);
  const openBanking = obProvider
    ? {
        provider: obProvider,
        signals: deriveRiskSignals(obProvider),
        matchedBy: "domain" as const,
      }
    : null;

  if (!result.ok) {
    // WEB_CHECK_URL not configured — use built-in RDAP + DNS-over-HTTPS provider
    const freeResult = await domainIntelFree(domain);
    return NextResponse.json(
      { ...freeResult, ...(openBanking ? { openBanking } : {}) },
      { headers: { ...CORS, ...gateHeaders } },
    );
  }

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[domain_intel] latencyMs=${latencyMs} exceeds 5000ms`);
  return NextResponse.json(
    { ...result, latencyMs, ...(openBanking ? { openBanking } : {}) },
    { headers: { ...CORS, ...gateHeaders } },
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "domain_intel",
      message,
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500 , headers: {} });
  }
}
