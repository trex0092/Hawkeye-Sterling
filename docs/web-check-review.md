# Code Review: Lissy93/web-check

**Repository:** https://github.com/Lissy93/web-check  
**Stars:** 32,900+ | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Web-check is a self-hostable website intelligence tool that performs 40+ passive checks against any domain: WHOIS, DNS enumeration, SSL/TLS certificate analysis, HTTP security headers, technology stack detection, tracker identification, open port scanning, email server configuration (MX, DMARC, SPF), malware/phishing database lookups, and historical archive retrieval. It is built in TypeScript/Astro with a REST API backend and a web frontend, deployable in Docker with a single command.

For Hawkeye Sterling, web-check is the **domain due diligence module**: it rapidly maps the web infrastructure of a corporate counterparty, revealing hosting jurisdiction, security posture, tech stack fingerprint, and threat intelligence hits — all from a single domain input.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: domain (e.g., example.com)
    ↓
Web-Check (TypeScript + Astro)
    REST API (/api/ endpoints per check type)
    ↓
40+ passive checks:
    ├── WHOIS (registrar, creation date, registrant, jurisdiction)
    ├── DNS (A, MX, NS, TXT, CNAME, AAAA records)
    ├── SSL/TLS (certificate issuer, expiry, cipher, chain)
    ├── HTTP headers (security headers, HSTS, CSP, CORS policy)
    ├── Technology stack (frameworks, CMS, CDN, analytics detected)
    ├── Tracker detection (ad networks, analytics, fingerprinting)
    ├── Open ports (common port sweep)
    ├── Email config (MX, DMARC, SPF — phishing prevention posture)
    ├── Malware/phishing lookups (Google Safe Browsing, VirusTotal)
    └── Archive (Wayback Machine historical snapshots)
    ↓
Output: structured JSON per check + web UI
```

**Self-hosting:**
```bash
docker run -p 3000:3000 lissy93/web-check
```

**REST API access:**
```typescript
// Individual check
const whois = await fetch(`${WEB_CHECK_URL}/api/whois?url=example.com`);
const dns   = await fetch(`${WEB_CHECK_URL}/api/dns?url=example.com`);
const ssl   = await fetch(`${WEB_CHECK_URL}/api/ssl?url=example.com`);
```

---

## Strengths

### 1. MIT Licence + Docker Self-Hosting — Zero Friction

No licensing barriers and a single Docker command. Web-check can be added to the Hawkeye Sterling docker-compose stack in minutes.

### 2. WHOIS Registration Date Is an AML Signal

Recently registered domains (< 6 months) associated with corporate counterparties are a classic shell company indicator. FATF typologies specifically flag newly incorporated entities as elevated risk. Web-check's WHOIS check surfaces registration date, registrar jurisdiction, and registrant details automatically.

### 3. Technology Stack Fingerprinting for Corporate Legitimacy

A company that claims to be a large financial institution but whose website runs on a free Wix template with no security headers, no DMARC policy, and no CDN infrastructure is implausible at its claimed scale. Tech stack fingerprinting (CMS, CDN, analytics, framework) provides a quick legitimacy sanity check for corporate counterparties.

### 4. Email Configuration (DMARC/SPF) as Fraud Signal

Absence of DMARC and SPF records on a corporate domain is a flag — legitimate financial institutions configure email authentication to prevent spoofing. A correspondent bank whose domain has no DMARC policy may have weak internal controls more broadly. Web-check surfaces this in seconds.

### 5. REST API Per Check Type

Each of the 40+ checks has its own API endpoint. Hawkeye Sterling can call only the checks relevant to AML due diligence (WHOIS, DNS, SSL, email config, malware) without pulling unnecessary UI data, keeping the integration lightweight.

### 6. Malware/Phishing Database Lookups

Checks against Google Safe Browsing and VirusTotal flag domains that appear in phishing campaigns or malware distribution. A corporate counterparty whose registered domain has appeared in phishing feeds is a direct red flag.

---

## Issues and Concerns

### 1. No Bulk / Batch API

**Severity: Low–Medium**

Web-check is designed for single-domain queries through the web UI. The REST API accepts one domain per call. Screening a portfolio of 500 corporate counterparties requires 500× (40 checks × N relevant endpoints) API calls.

**Recommendation:** Write a queue-based batch wrapper in `src/services/webcheck_client.ts` that fans out checks concurrently with rate limiting. Cache results per domain for 7 days (WHOIS and DNS records change infrequently).

### 2. Open Port Scanning May Trigger IDS

**Severity: Low**

The open port scanning check actively probes the target domain's IP. Unlike the purely passive checks (WHOIS, DNS, certificate transparency), port scanning generates outbound traffic that a well-monitored target could detect and log. For sensitive compliance investigations, this check should be disabled.

**Recommendation:** Configure web-check with port scanning disabled for HS compliance investigations. Use only the passive checks (WHOIS, DNS, SSL, headers, email config, malware lookups).

### 3. External API Key Dependencies

**Severity: Low**

Full functionality requires API keys for VirusTotal, Shodan, and other third-party services. The free tier of these services is rate-limited. Define a minimal AML-relevant check set that works within free tier limits.

---

## AML-Relevant Check Subset

| Check | AML Signal |
|-------|-----------|
| WHOIS registration date | Recently registered → shell flag |
| WHOIS registrant jurisdiction | Jurisdiction mismatch with claimed headquarters |
| DNS NS records | NS hosted in anonymising jurisdiction |
| SSL issuer + expiry | Free cert only, expiring soon → low-effort setup |
| DMARC / SPF absent | Weak internal controls signal |
| Malware/phishing hits | Direct sanctions-evasion infrastructure flag |
| Tech stack | Inconsistency between claimed scale and actual infrastructure |
| Wayback Machine | Domain previously used for different purpose |

---

## Integration Architecture for Hawkeye Sterling

```
Corporate counterparty domain known at onboarding
    ↓ async enrichment job
src/services/webcheck_client.ts
    ├── GET /api/whois?url={domain}    → registrar, date, jurisdiction
    ├── GET /api/dns?url={domain}      → DNS records
    ├── GET /api/ssl?url={domain}      → certificate chain
    ├── GET /api/mail?url={domain}     → DMARC, SPF, MX
    └── GET /api/malware?url={domain}  → threat intel flags
    ↓ (omit: ports scan, trackers, tech stack for compliance mode)
src/brain/corporate_osint_mode.ts
    ├── Registered < 6 months → shell domain flag
    ├── Malware hit → sanctions infrastructure flag
    ├── No DMARC → weak controls note
    └── Jurisdiction mismatch → elevated due diligence flag
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Check breadth | Excellent | 40+ checks covering full web infrastructure |
| REST API | Good | Per-check endpoints; no batch mode |
| Licensing | Excellent | MIT — zero friction |
| Deployment | Excellent | Single Docker command |
| AML relevance | Very Good | WHOIS age, malware, email config all AML-relevant |
| Passive-only | Caution | Port scan check is active — disable for compliance |
| HS fit | ★★★ | Domain due diligence — add to async onboarding enrichment |

---

## Recommendation

**Integrate as the domain due diligence check in the corporate onboarding pipeline.** Deploy in Docker alongside Hawkeye Sterling. Call the passive checks (WHOIS, DNS, SSL, email config, malware) for every corporate counterparty domain at onboarding and during periodic due diligence refresh. Disable port scanning. Cache results per domain for 7 days.
