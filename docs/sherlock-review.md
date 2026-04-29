# Code Review: sherlock-project/sherlock

**Repository:** https://github.com/sherlock-project/sherlock  
**Stars:** 82,300+ | **Forks:** 9,600+  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Sherlock is a CLI tool that searches for a username across 400+ social media platforms and websites, reporting which platforms have an active account for that username. It is the most widely used open-source username-OSINT tool, with 82k+ GitHub stars. Output formats include TXT, CSV, XLSX, and JSON.

For Hawkeye Sterling, Sherlock is a **subject identity breadth scanner**: given a subject name or known username, it rapidly identifies their social media footprint across hundreds of platforms. This feeds the adverse media and PEP screening pipeline by surfacing public profiles that may contain politically exposed activity, sanctions-evasion signals, or reputational risk indicators.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: one or more usernames
    ↓
Sherlock (Python)
    └── Concurrent HTTP requests to 400+ platform endpoints
        (Twitter/X, Reddit, GitHub, Instagram, LinkedIn, TikTok, ...)
    ↓
Output: list of confirmed account URLs
    ├── username_found.txt
    ├── results.csv / results.xlsx
    └── results.json  (with --json flag)
```

**Usage:**
```bash
# CLI
sherlock john_doe
sherlock john_doe jane_smith --json --output ./results/

# Python library (programmatic)
from sherlock_project.sherlock import sherlock
from sherlock_project.sites import SitesInformation

sites = SitesInformation()
results = sherlock("john_doe", site_data=sites, ...)
```

**Supported output formats:** TXT, CSV, XLSX, JSON  
**Proxy support:** Yes (HTTP/SOCKS5)  
**Timeout configuration:** Per-request timeout setting  
**Platform coverage:** 400+ sites with community-maintained site list

---

## Strengths

### 1. 400+ Platform Coverage in One Call

No other open-source tool covers as many platforms with a single query. The platform list is community-maintained in a JSON data file and includes mainstream social media (Instagram, TikTok, Twitter/X, Reddit), professional networks (LinkedIn, GitHub), regional networks (VK, Weibo, Odnoklassniki), forums, and niche communities — all in one concurrent sweep.

### 2. Concurrent Requests — Fast Sweep

Sherlock uses Python's `concurrent.futures.ThreadPoolExecutor` to fan out requests to all 400+ platforms simultaneously. A full sweep completes in seconds rather than minutes. This is the correct approach for a breadth-first identity scan.

### 3. Multiple Output Formats Including JSON

The JSON output format makes Sherlock's results programmatically consumable without screen-scraping TXT output. Each result includes the platform name, URL, and status. This is the integration point for Hawkeye Sterling.

### 4. Proxy Support for AML Investigation Contexts

Proxy support (HTTP and SOCKS5) allows routing Sherlock queries through investigation proxies, preventing the target subject from seeing traffic originating from Hawkeye Sterling's IP range — an important OPSEC consideration in active investigations.

### 5. Massively Battle-Tested

82k stars and 9.6k forks means this is one of the most widely used OSINT tools in existence. The platform coverage list has been validated at scale by the security research community. Edge cases (site URL pattern changes, false positives) are frequently reported and fixed.

---

## Issues and Concerns

### 1. CLI-First Architecture — No Clean Python API

**Severity: Medium**

Sherlock is primarily designed as a CLI tool. The Python library interface exists but is not prominently documented and may change between versions. The canonical integration pattern is subprocess execution, not library import.

**Recommendation:** Wrap in `src/services/sherlock_client.py` as a subprocess call with structured JSON output parsing:
```python
import subprocess, json

def scan_username(username: str) -> list[dict]:
    result = subprocess.run(
        ["sherlock", username, "--json", "--output", "/tmp/sherlock_out"],
        capture_output=True, timeout=120
    )
    with open(f"/tmp/sherlock_out/{username}.json") as f:
        return json.load(f)
```

### 2. Platform List Changes Break Results Silently

**Severity: Medium**

The 400+ platform list is community-maintained. Platforms change their URL structures, add bot detection, or shut down. When this happens, Sherlock either produces false negatives (misses an existing account) or false positives (reports an account that does not exist). There is no automated validation of the platform list.

**Recommendation:** Do not treat Sherlock results as definitive. Surface them as "candidate profiles for analyst review," not confirmed findings. Flag any platform with a known false-positive history in the UI.

### 3. Rate Limiting and Bot Detection

**Severity: Medium**

Scanning 400+ platforms simultaneously triggers rate limiters and bot detection on many sites. Major platforms (Instagram, LinkedIn, TikTok) actively block or rate-limit automated scanning. Results for these platforms are less reliable than for smaller sites.

**Recommendation:** Run Sherlock with a deliberate delay flag (`--timeout`) and validate high-value platform results manually. For LinkedIn specifically, use the LinkedIn API or professional data vendors rather than Sherlock's scrape approach.

### 4. Legal and Privacy Compliance

**Severity: Medium for AML use**

Sherlock scrapes public profile pages. In GDPR jurisdictions, automated collection of personal data — even public data — requires a lawful basis. For AML purposes, FATF Recommendation 10 and national regulations typically provide a compliance basis for customer due diligence data collection. However, this needs to be documented in Hawkeye Sterling's privacy impact assessment.

**Recommendation:** Restrict Sherlock queries to subjects who have undergone CDD/KYC onboarding with explicit consent or regulatory mandate. Log all queries with the regulatory basis for the search.

### 5. No Account Content Analysis — Only Existence Check

**Severity: Low**

Sherlock only confirms whether an account exists — it does not retrieve account content, post history, network, or profile data. Finding that a subject has a Telegram account tells you little without knowing what they post.

**Recommendation:** Use Sherlock for discovery (which platforms?), then pass discovered profile URLs to Taranis AI collectors (reviewed separately) or specialised profile extractors for content analysis.

---

## Integration Architecture for Hawkeye Sterling

```
Subject profile (name + known aliases/usernames)
    ↓
src/services/sherlock_client.py
    ├── sherlock(username, --json)  [subprocess]
    ├── Dedup + confidence-score results
    └── Return list of DiscoveredProfile { platform, url, status }
    ↓
src/brain/adverse_media_mode.ts
    ├── High-risk platforms → flag for analyst review
    ├── Dark-web/privacy-focused platforms → elevated suspicion
    └── Pass URLs to Taranis AI for content monitoring
    ↓
web/ → "Social Footprint" section of subject report
```

| Sherlock Output | HS Module | Use |
|----------------|-----------|-----|
| Platform hit list (JSON) | `src/services/sherlock_client.py` | Discovery layer |
| High-risk platform hits | `src/brain/` | Adverse media signal |
| Profile URLs | `src/ingestion/` | Feed Taranis AI collectors |
| No-result platforms | `web/` | Completeness indicator |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Platform coverage | Excellent | 400+ sites, community-maintained |
| Speed | Very Good | Concurrent fan-out, seconds per scan |
| Python API | Fair | CLI-first; subprocess integration needed |
| Reliability | Fair | Bot detection + platform drift cause false neg/pos |
| Legal compliance | Caution | Document GDPR lawful basis for AML use |
| Output formats | Good | JSON suitable for programmatic consumption |
| License | Excellent | MIT |
| HS fit | ★★☆ | Discovery layer for social footprint — feed to Taranis AI for content |

---

## Recommendation

**Integrate as the social footprint discovery layer.** Sherlock excels at rapid breadth scanning — it tells you which platforms a subject uses in seconds. Wire it as the first step of adverse media enrichment: discover platforms, then pass URLs to Taranis AI for content monitoring. Do not surface raw Sherlock results as findings — flag them as "candidate profiles requiring analyst review."
