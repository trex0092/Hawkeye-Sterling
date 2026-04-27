# Code Review: soxoj/maigret

**Repository:** https://github.com/soxoj/maigret  
**Stars:** ~20,000 | **Commits:** 1,277  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Maigret is a username-based OSINT tool that searches 3,000+ websites for accounts associated with a given username, extracts available profile data from discovered accounts, and performs recursive follow-up searches using newly discovered usernames or identifiers. It generates richly formatted reports (HTML, PDF, JSON, CSV, XMind, interactive graph). It is the spiritual successor to Sherlock, covering 7× more sites and adding profile data extraction and cross-username recursion.

For Hawkeye Sterling, Maigret is the **comprehensive social identity profiler**: it goes beyond Sherlock's existence check to build a structured dossier of a subject's online identity — usernames, profile photos, linked accounts, bios, and platform-specific metadata — across 3,000+ sites.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: username (e.g., "ahmad.rashidi.ae")
    ↓
Maigret (Python 3.10+)
    ├── Check ~500 high-traffic sites (default) or all 3,000+ (-a flag)
    ├── Extract profile data from confirmed hits (name, bio, photo URL, links)
    ├── Discover linked accounts (email, phone, alternate usernames)
    └── Recurse on discovered identifiers
    ↓
Output:
    ├── HTML report (interactive, visual)
    ├── PDF report (printable compliance document)
    ├── JSON (programmatic consumption)
    ├── CSV
    ├── XMind (mind map for analyst review)
    └── Graph report (network of discovered accounts)
```

**Access modes:**
- CLI: `maigret username`
- Web UI: `maigret --web` (serves on localhost:5000)
- Python library: direct import
- Telegram bot

---

## Key Differences vs Sherlock

| Feature | Sherlock | Maigret |
|---------|---------|---------|
| Site coverage | 400+ | 3,000+ |
| Profile data extraction | No (URL only) | Yes (name, bio, photo, links) |
| Recursive username discovery | No | Yes |
| Report formats | TXT/CSV/XLSX/JSON | HTML/PDF/JSON/CSV/XMind/graph |
| Web UI | No | Yes (`--web`) |
| Python library mode | Partial | Yes |
| Site category filtering | No | Yes (by tag, by country) |
| Privacy network routing | No | Tor, I2P, proxy |

Maigret is strictly more capable than Sherlock for due diligence purposes.

---

## Strengths

### 1. Profile Data Extraction — Not Just Existence

Maigret does not stop at confirming an account exists. It extracts available profile data: full name (if public), bio, profile photo URL, linked social accounts, and platform-specific metadata. For AML due diligence, knowing that a subject's Instagram bio links to a Telegram channel, which links to a crypto wallet address, is actionable intelligence.

### 2. Recursive Identity Graph Discovery

When Maigret finds a profile that contains a different username, email, or phone number, it can automatically run follow-up searches on those identifiers. This builds an identity graph: `username_A → profile_B → username_C → profile_D`. Shell company operators and sanctions evaders frequently use multiple identities — recursive discovery catches this.

### 3. 3,000+ Site Coverage With Category Filtering

3,000+ sites includes not only mainstream social media but regional networks (VK, Weibo, OK.ru), professional forums, dark web-adjacent platforms, and country-specific services. Filtering by site category (e.g., "dark web", "crypto", "privacy-focused") allows Hawkeye Sterling to prioritize high-risk platforms in the screening output.

### 4. PDF Report as Compliance Document

The PDF output is a formatted dossier with discovered accounts, profile data, and the identity graph — directly usable as supporting evidence in a SAR filing or compliance review package. This saves analyst time converting raw OSINT data into a submission-ready document.

### 5. Interactive Graph Report

The network graph report visualises connections between discovered identities. For complex subjects with many alternate accounts, the graph makes structural patterns visible at a glance — for example, a hub-and-spoke identity structure where one central username links to five platform-specific identities.

---

## Issues and Concerns

### 1. 3,000 Sites → Higher False Positive Rate

**Severity: Medium**

More sites means more common usernames that coincidentally match unrelated users. A subject named "Ahmad Rashidi" searching for `ahmadRashidi` will find accounts belonging to different Ahmad Rashidis on niche platforms. The false positive rate scales with coverage breadth.

**Recommendation:** Filter results by confidence score (Maigret assigns match confidence). Set a minimum threshold and flag low-confidence matches as "requires analyst verification" rather than confirmed identity. Cross-validate with profile data (if the profile photo doesn't match the subject, it's a different person).

### 2. Site List Maintenance at 3,000+ Is Harder Than Sherlock's 400+

**Severity: Medium**

7× more sites means 7× more maintenance burden as platforms change their URL structures, enable bot detection, or shut down. A stale site entry either produces false negatives or 404 errors masquerading as "not found."

**Recommendation:** Run Maigret in verbose mode periodically and audit sites with high error rates. Use the `--top-sites N` flag to restrict production scans to the N highest-traffic sites for reliability.

### 3. Legal and Privacy Compliance at Scale

**Severity: Medium**

The repository includes a disclaimer: "for educational and lawful purposes only." Automated collection of personal data across 3,000 platforms at AML scale (thousands of subjects) requires a documented lawful basis in every jurisdiction the subject may have accounts in. GDPR Article 6(1)(c) (legal obligation) covers AML CDD, but the specific national implementation must be verified.

**Recommendation:** Scope Maigret to subjects who have triggered a higher-risk screening threshold (PEPs, sanctions adjacency, unusual transaction patterns) rather than running it on all onboarded customers. Document the AML regulatory basis in the Hawkeye Sterling privacy impact assessment.

### 4. Python 3.10+ Requirement

**Severity: Low**

Requires Python 3.10 or higher (uses structural pattern matching and other 3.10+ features). Hawkeye Sterling's Python services must be on 3.10+ — confirm before deploying.

### 5. No API Key Required — But Rate Limits Still Apply

**Severity: Low**

Maigret requires no API keys (it scrapes public pages), but platforms impose their own rate limits and bot detection. High-volume runs will produce incomplete results on major platforms without proxy rotation.

---

## Integration Architecture for Hawkeye Sterling

```
Elevated-risk subject flagged (PEP, sanctions adjacency, SAR trigger)
    ↓
src/services/maigret_client.py
    ├── maigret(username, --json, --top-sites 500, --timeout 60)
    ├── Parse JSON → DiscoveredProfile[] with confidence scores
    ├── Filter confidence >= 0.7
    └── Extract identity graph (cross-linked accounts)
    ↓
src/brain/adverse_media_mode.ts
    ├── Dark/privacy platform hits → elevated risk flag
    ├── Crypto-linked profiles → asset tracing lead
    ├── Identity graph depth > 3 → complex identity obfuscation signal
    └── Discovered email/phone → pass to SpiderFoot for enrichment
    ↓
PDF dossier → Compliance evidence package
Interactive graph → Analyst review UI
```

| Maigret Output | HS Module | Use |
|---------------|-----------|-----|
| Profile JSON with confidence | `src/services/maigret_client.py` | Discovery + filtering |
| High-risk platform hits | `src/brain/` | Adverse media signals |
| Identity graph | `src/brain/` + `web/` | Multi-identity pattern detection |
| Discovered email/phone | `src/services/spiderfoot_client.py` | Feed SpiderFoot enrichment |
| PDF report | `src/services/` | SAR evidence attachment |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Site coverage | Excellent | 3,000+ sites — broadest available |
| Profile data extraction | Excellent | Beyond existence check |
| Recursive discovery | Very Good | Identity graph traversal |
| Report formats | Excellent | HTML, PDF, JSON, graph |
| False positive risk | Fair | Higher coverage = more noise |
| Legal compliance | Caution | Document GDPR AML lawful basis |
| License | Excellent | MIT |
| HS fit | ★★★ | Comprehensive identity profiler for elevated-risk subjects |

---

## Recommendation

**Integrate as the elevated-risk subject identity profiler.** Maigret is strictly more capable than Sherlock for thorough due diligence. Use it selectively on subjects who have triggered elevated screening thresholds (PEPs, sanctions adjacency, anomalous transactions) rather than on all onboarded customers. Feed discovered emails and phone numbers into SpiderFoot for deeper infrastructure enrichment. Use the PDF output directly in SAR evidence packages.
