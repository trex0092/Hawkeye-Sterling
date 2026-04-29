# Code Review: smicallef/spiderfoot

**Repository:** https://github.com/smicallef/spiderfoot  
**Stars:** 17,600+ | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

SpiderFoot is an automated OSINT platform with 200+ modules that targets IP addresses, domains, email addresses, phone numbers, usernames, and cryptocurrency wallets. It integrates with major threat intelligence providers (Shodan, VirusTotal, AlienVault OTX), breach databases (HaveIBeenPwned), DNS infrastructure, dark web sources, and social platforms. It exposes a web UI, a CLI, and a REST API, backed by SQLite. A YAML correlation engine with 37 pre-built rules synthesises multi-source findings into actionable intelligence.

For Hawkeye Sterling, SpiderFoot is the **deep entity enrichment engine**: where Sherlock finds which platforms a subject uses, SpiderFoot resolves the full infrastructure footprint — domain registrations, IP reputation, breach exposure, dark web mentions, and threat intelligence hits — for a target entity.

---

## Architecture

```
SpiderFoot Core (Python 3)
    ├── Web UI          ← Browser-based investigation interface
    ├── CLI             ← Headless scanning for automation
    └── REST API        ← Programmatic integration point
         ↓
200+ Modules (concurrent)
    ├── DNS / WHOIS / Certificate Transparency
    ├── Threat Intel: Shodan, VirusTotal, AlienVault OTX, abuse.ch
    ├── Breach: HaveIBeenPwned, DeHashed
    ├── Dark Web: Tor-based sources
    ├── Social: Username enumeration, profile extraction
    ├── Crypto: Wallet analysis
    └── ...
         ↓
SQLite backend (query with custom SQL)
    ↓
YAML Correlation Engine (37 built-in rules)
    ↓
Export: CSV / JSON / GEXF (graph format)
```

**Target types:** IP address, domain, email, phone number, username, Bitcoin address, subnet, ASN, person name, company name

---

## Strengths

### 1. 200+ Modules — Deepest OSINT Coverage in Open Source

No other open-source OSINT tool integrates as many data sources as SpiderFoot. Relevant AML modules include:
- DNS history and passive DNS (reveals infrastructure connections)
- Certificate Transparency logs (reveals all domains owned by an entity)
- Shodan (internet-facing service exposure)
- VirusTotal (malware/phishing association)
- HaveIBeenPwned (breach exposure — credential theft risk)
- Cryptocurrency wallet checks
- Dark web search (Tor-based indexing)
- AlienVault OTX (threat intelligence pulses)

This breadth maps directly to AML due diligence requirements: a company's domain registration history, dark web mentions, and breach exposure are all material to risk assessment.

### 2. YAML Correlation Engine With 37 Pre-Built Rules

The correlation engine synthesises findings from multiple modules into higher-order conclusions. Rules can fire patterns like "domain registered < 30 days + no web presence + DNS resolves to anonymising proxy → possible shell infrastructure." This is structured reasoning over OSINT data — not just raw facts. The 37 built-in rules can be extended with custom YAML for AML-specific patterns.

### 3. REST API for Programmatic Integration

SpiderFoot exposes a REST API for scan management and result retrieval. Hawkeye Sterling can programmatically start scans, poll for completion, and retrieve structured findings without screen-scraping the web UI.

```python
import requests

# Start scan
scan = requests.post(f"{SPIDERFOOT_URL}/startscan", json={
    "scanname": f"HS-{subject_id}",
    "scantarget": subject_email,
    "scantargettype": "EMAILADDR",
    "usecase": "all",
})
scan_id = scan.json()["id"]

# Poll for results
results = requests.get(f"{SPIDERFOOT_URL}/scaneventresults/{scan_id}/ALL")
findings = results.json()
```

### 4. GEXF Graph Export for Network Analysis

The GEXF export format is directly importable into Gephi, NetworkX, and other graph analysis tools. Entity relationships discovered during scanning (domain → IP → ASN → organization → other domains) form a graph that can reveal hidden connections between subjects.

### 5. TOR Integration for Dark Web Sources

SpiderFoot includes native TOR routing for dark web source modules. Monitoring dark web forums and marketplaces for mentions of a subject's name, email, or domain is a legitimate AML due diligence step (dark web presence is a sanctions-evasion red flag).

---

## Issues and Concerns

### 1. 200 Modules × API Key Management

**Severity: Medium**

Most high-value modules (Shodan, VirusTotal, HaveIBeenPwned, etc.) require API keys, each with their own pricing tiers, rate limits, and terms of service. Managing 20+ API key configurations in a production deployment is operationally complex.

**Recommendation:** Identify the 10–15 modules most relevant to AML due diligence and configure only those. Disable all others to reduce surface area and API key overhead. Priority modules for AML:
- Shodan (infrastructure exposure)
- VirusTotal (malware association)
- HaveIBeenPwned (breach exposure)
- AlienVault OTX (threat intel)
- DNS history + passive DNS modules
- Certificate Transparency

### 2. SQLite Backend Is Not Suitable for Concurrent Production Load

**Severity: Medium**

SpiderFoot uses SQLite as its data backend. SQLite has write-lock contention under concurrent load — multiple simultaneous scans will serialise writes. For a production AML system running many parallel counterparty scans, SQLite will bottleneck.

**Recommendation:** For development and small-scale use, SQLite is fine. For production at scale, evaluate whether the SpiderFoot REST API can be run as a singleton with a queue, or migrate the backend to PostgreSQL (requires forking).

### 3. Scans Are Slow for Deep Targets

**Severity: Low–Medium**

A deep scan (all 200+ modules) on a well-established domain target can take 30–60 minutes. For real-time counterparty screening this is unusable — it is a batch enrichment tool, not a real-time lookup.

**Recommendation:** Deploy SpiderFoot as an **async enrichment service**: trigger a scan on subject onboarding, store results in HS's own database, and surface findings in the analyst review workflow after the scan completes. Do not put SpiderFoot in the real-time screening critical path.

### 4. Commercial HX Variant for Enterprise Features

**Severity: Low**

Many enterprise features (multi-target parallel scanning, team collaboration, pre-configured third-party tools, customer support) are in SpiderFoot HX, the commercial variant. The open-source version is single-user, single-target per scan.

### 5. Dark Web Module Legal Considerations

**Severity: Low**

Accessing dark web sources via TOR is legally ambiguous in some jurisdictions. In the UAE (Hawkeye Sterling's primary market), TOR usage and dark web monitoring may be subject to regulatory restrictions. Confirm with legal counsel before enabling dark web modules in a UAE deployment.

---

## Integration Architecture for Hawkeye Sterling

```
Subject onboarding / periodic due diligence refresh
    ↓
src/services/spiderfoot_client.py
    ├── POST /startscan (email, domain, phone, crypto address)
    ├── Poll GET /scanstatus/{id} until FINISHED
    ├── GET /scaneventresults/{id}/ALL
    └── Parse findings → HS evidence items
    ↓
src/brain/adverse_media_mode.ts
    ├── Dark web mention → elevated risk flag
    ├── Breach exposure → credential risk note
    ├── Malware association (VirusTotal) → sanctions-evasion signal
    └── Recently registered domain → shell infrastructure flag
    ↓
Correlation engine findings → compliance officer review queue
```

| SpiderFoot Component | HS Module | Integration |
|--------------------|-----------|-------------|
| REST API scans | `src/services/spiderfoot_client.py` | Async enrichment trigger |
| DNS/WHOIS modules | `src/brain/` | Infrastructure connection graph |
| Threat intel modules | `src/brain/` | Sanction-evasion signals |
| Breach modules | `src/brain/` | Credential risk indicators |
| GEXF export | `src/brain/` graph modes | Entity relationship graph |
| Correlation rules | Custom YAML | AML-specific pattern rules |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| OSINT breadth | Excellent | 200+ modules, deepest open-source coverage |
| Correlation engine | Very Good | 37 built-in rules + custom YAML |
| REST API | Good | Programmatic scan management |
| Scan speed | Fair | 30–60 min deep scans — async only |
| API key management | Fair | Many keys required for full capability |
| Database scalability | Fair | SQLite bottlenecks under concurrent load |
| License | Excellent | MIT |
| HS fit | ★★★ | Deep entity enrichment engine — async batch |

---

## Recommendation

**Integrate as the async entity enrichment service.** SpiderFoot provides the deepest open-source OSINT coverage available. Deploy it as a background enrichment job triggered at subject onboarding and during periodic due diligence reviews. Configure the 10–15 AML-relevant modules, write custom YAML correlation rules for AML typologies, and surface correlation-engine findings in the analyst review queue.
