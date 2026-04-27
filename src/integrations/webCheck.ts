// Hawkeye Sterling — web-check (Lissy93/web-check) REST API client.
// web-check exposes 40+ individual domain intelligence checks via REST.
// Each check is a separate endpoint; this client fetches the AML-relevant subset:
//   · WHOIS registration date (new domain = higher risk)
//   · Malware / phishing presence (Google Safe Browsing, VirusTotal)
//   · Email security config (SPF/DKIM/DMARC — spoofing risk)
//   · SSL certificate validity and issuer
//   · DNS records (hidden infrastructure, fast-flux)
//   · Domain rank (Tranco — low-rank = high risk)
//
// Env vars:
//   WEB_CHECK_URL  — base URL of self-hosted web-check instance (required)

declare const process: { env?: Record<string, string | undefined> } | undefined;

import { fetchJsonWithRetry } from './httpRetry.js';

export interface DomainIntelResult {
  ok: boolean;
  domain: string;
  riskScore: number;         // 0–100 composite risk (higher = more suspicious)
  riskFactors: string[];
  whois?: {
    registrationDate?: string;
    expiryDate?: string;
    registrar?: string;
    ageInDays?: number;
  };
  malware?: {
    flagged: boolean;
    sources: string[];
  };
  emailSecurity?: {
    hasSPF: boolean;
    hasDKIM: boolean;
    hasDMARC: boolean;
    spoofingRisk: 'low' | 'medium' | 'high';
  };
  ssl?: {
    valid: boolean;
    issuer?: string;
    expiresAt?: string;
    selfSigned: boolean;
  };
  domainRank?: number;       // Tranco rank (1 = most popular; null if unranked)
  error?: string;
}

interface WebCheckResponse {
  // WHOIS
  whois?: {
    created?: string;
    expires?: string;
    registrar?: string;
  };
  // Malware
  malware?: {
    isVulnerable?: boolean;
    sources?: string[];
  };
  // Mail config
  mail?: {
    spfRecord?: string;
    dkimRecord?: string;
    dmarcRecord?: string;
  };
  // SSL
  ssl?: {
    valid?: boolean;
    issuer?: string;
    expires?: string;
    selfSigned?: boolean;
  };
  // Domain rank
  rank?: {
    rank?: number;
  };
}

function daysBetween(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function scoreRisk(data: WebCheckResponse, domain: string): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // New domain (< 90 days) = high risk
  if (data.whois?.created) {
    const age = daysBetween(data.whois.created);
    if (age < 30) { score += 40; factors.push(`domain age ${age}d (< 30 days)`); }
    else if (age < 90) { score += 25; factors.push(`domain age ${age}d (< 90 days)`); }
    else if (age < 365) { score += 10; }
  } else {
    score += 15; factors.push('WHOIS creation date unavailable');
  }

  // Malware / phishing flagging
  if (data.malware?.isVulnerable) {
    score += 50; factors.push(`malware/phishing flagged by: ${(data.malware.sources ?? []).join(', ')}`);
  }

  // Email security — missing = spoofing-enabled
  const hasSPF = !!data.mail?.spfRecord;
  const hasDKIM = !!data.mail?.dkimRecord;
  const hasDMARC = !!data.mail?.dmarcRecord;
  if (!hasSPF && !hasDKIM && !hasDMARC) {
    score += 20; factors.push('no SPF/DKIM/DMARC — domain spoofing-enabled');
  } else if (!hasDMARC) {
    score += 8; factors.push('no DMARC record');
  }

  // SSL
  if (data.ssl?.selfSigned) { score += 15; factors.push('self-signed SSL certificate'); }
  if (data.ssl?.valid === false) { score += 20; factors.push('invalid SSL certificate'); }

  // Domain rank (unranked or low-rank = higher risk)
  if (data.rank?.rank === undefined || data.rank.rank === null) {
    score += 10; factors.push('domain not in Tranco top-1M');
  }

  // Clamp to 100
  return { score: Math.min(100, score), factors };
}

async function fetchCheck<T>(
  baseUrl: string,
  domain: string,
  check: string,
  timeoutMs: number,
): Promise<T | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/${check}?url=${encodeURIComponent(domain)}`;
  const result = await fetchJsonWithRetry<T>(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, { perAttemptMs: timeoutMs, maxAttempts: 2 });
  return result.ok && result.json ? result.json : null;
}

export async function domainIntel(
  domain: string,
  options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<DomainIntelResult> {
  const baseUrl = options.endpoint
    ?? (typeof process !== 'undefined' ? process.env?.WEB_CHECK_URL : undefined);

  if (!baseUrl) {
    return { ok: false, domain, riskScore: 0, riskFactors: [], error: 'WEB_CHECK_URL not configured' };
  }

  const timeoutMs = options.timeoutMs ?? 10_000;

  // Fetch the AML-relevant checks in parallel
  const [whois, malware, mail, ssl, rank] = await Promise.all([
    fetchCheck<WebCheckResponse['whois']>(baseUrl, domain, 'whois', timeoutMs),
    fetchCheck<WebCheckResponse['malware']>(baseUrl, domain, 'malware', timeoutMs),
    fetchCheck<WebCheckResponse['mail']>(baseUrl, domain, 'mail', timeoutMs),
    fetchCheck<WebCheckResponse['ssl']>(baseUrl, domain, 'ssl', timeoutMs),
    fetchCheck<WebCheckResponse['rank']>(baseUrl, domain, 'rank', timeoutMs),
  ]);

  const combined: WebCheckResponse = { whois: whois ?? undefined, malware: malware ?? undefined, mail: mail ?? undefined, ssl: ssl ?? undefined, rank: rank ?? undefined };
  const { score, factors } = scoreRisk(combined, domain);

  const hasSPF = !!mail?.spfRecord;
  const hasDKIM = !!mail?.dkimRecord;
  const hasDMARC = !!mail?.dmarcRecord;
  const spoofingRisk: DomainIntelResult['emailSecurity']['spoofingRisk'] =
    !hasSPF && !hasDMARC ? 'high' : !hasDMARC ? 'medium' : 'low';

  return {
    ok: true,
    domain,
    riskScore: score,
    riskFactors: factors,
    whois: whois ? {
      registrationDate: whois.created,
      expiryDate: whois.expires,
      registrar: whois.registrar,
      ageInDays: whois.created ? daysBetween(whois.created) : undefined,
    } : undefined,
    malware: malware ? {
      flagged: !!malware.isVulnerable,
      sources: malware.sources ?? [],
    } : undefined,
    emailSecurity: mail ? { hasSPF, hasDKIM, hasDMARC, spoofingRisk } : undefined,
    ssl: ssl ? {
      valid: ssl.valid ?? false,
      issuer: ssl.issuer,
      expiresAt: ssl.expires,
      selfSigned: ssl.selfSigned ?? false,
    } : undefined,
    domainRank: rank?.rank,
  };
}
