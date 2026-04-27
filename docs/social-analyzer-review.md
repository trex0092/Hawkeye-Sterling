# Code Review: qeeqbox/social-analyzer

**Repository:** https://github.com/qeeqbox/social-analyzer  
**Stars:** 22,700+ | **License:** AGPL-3.0  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Social-Analyzer is an OSINT tool for finding and analysing a person's social media profiles across 1,000+ platforms. It goes beyond the existence checks of Sherlock by adding multilayer detection (HTTP, OCR via Tesseract, webdriver automation), a 0–100 confidence scoring system, cross-metadata statistical analysis, force-directed graph visualisation of linked accounts, and screenshot capture. It exposes a REST API, CLI, web UI, and Python library interface.

For Hawkeye Sterling, social-analyzer is the **high-confidence social identity analyser**: where Sherlock provides breadth (400 sites, fast, binary yes/no) and Maigret provides depth (3,000 sites, recursive), social-analyzer provides **confidence-scored profiling** with activity pattern detection — reducing false positives for analyst review.

**License: AGPL-3.0 — strong network copyleft.** This is a critical constraint: if Hawkeye Sterling serves social-analyzer results to users over a network (including as a SaaS product), it may be required to open-source the entire Hawkeye Sterling codebase. Use via **REST API boundary only** after legal review.

---

## What the Tool Does

```
Input: username (+ optional name for permutation search)
    ↓
Social-Analyzer (Node.js + Python)
    ├── 1,000+ platform checks (concurrent)
    │   ├── HTTPS library detection (fast, no browser)
    │   ├── WebDriver automation (Selenium/Firefox-ESR, for JS-heavy sites)
    │   ├── OCR detection (Tesseract.js — reads image-based profile indicators)
    │   └── Special detections (Facebook, Gmail, Google profiles)
    ├── Confidence rating: 0–100 → No / Maybe / Yes
    ├── Cross-metadata analysis (links accounts with shared identifiers)
    └── Force-directed graph of discovered account network
    ↓
Output:
    ├── JSON (detected/unknown/failed per platform)
    ├── Force-directed graph visualisation
    ├── Screenshots of discovered profiles
    └── Activity pattern metadata
```

---

## Key Differences vs Sherlock and Maigret

| Feature | Sherlock | Maigret | Social-Analyzer |
|---------|---------|---------|----------------|
| Platform coverage | 400 | 3,000+ | 1,000+ |
| Detection layers | HTTP only | HTTP | HTTP + OCR + Selenium |
| Confidence scoring | No | Partial | Yes (0–100) |
| Activity patterns | No | No | Yes |
| Graph visualisation | No | Yes | Yes (force-directed) |
| False positive mitigation | Low | Medium | High (multilayer) |
| REST API | No | No | Yes |
| Python library | Partial | Yes | Yes |
| Screenshot capture | No | No | Yes |
| Speed | Fast | Medium | Slow (Selenium) |

---

## Strengths

### 1. Multilayer Detection Minimises False Positives

The four-layer detection stack (HTTPS library → WebDriver → OCR → special rules) achieves higher accuracy than HTTP-only tools. A profile that returns a 200 OK but shows a "user not found" page (false positive common in Sherlock) is caught by OCR reading the page content or WebDriver rendering it.

For compliance use, a lower false positive rate is directly valuable: fewer analyst hours wasted investigating non-existent social accounts.

### 2. 0–100 Confidence Score With No/Maybe/Yes Classification

Confidence scoring allows Hawkeye Sterling to:
- Auto-flag scores ≥ 80 for analyst review
- Suppress scores < 30 (likely false positives)
- Queue 30–80 scores for lower-priority review

This is a significant operational improvement over binary yes/no detection.

### 3. REST API Available

```bash
# Start server
social-analyzer --cli --mode fast --username "john_doe" --output json

# REST API
GET /api/search?username=john_doe&mode=fast
```

The REST API enables integration without subprocess shell calls — a cleaner integration boundary for Hawkeye Sterling's TypeScript services.

### 4. Activity Pattern Detection

Beyond profile existence, social-analyzer extracts activity indicators: posting frequency, last active date, follower patterns. An account registered 10 years ago with zero posts but a valid profile is a different risk profile from an active account. This activity context is unavailable in Sherlock or basic Maigret results.

### 5. Cross-Metadata Statistical Analysis

When a profile contains a linked email, phone, or secondary username, social-analyzer runs follow-up searches on those identifiers and statistically correlates results. This is similar to Maigret's recursive discovery but with a quantitative confidence framework on top.

---

## Issues and Concerns

### 1. AGPL-3.0 Licence — Network Copyleft Is a Hard Constraint

**Severity: Critical**

AGPL-3.0 is the strongest open-source copyleft licence. Unlike GPL, AGPL explicitly covers **network use**: if Hawkeye Sterling uses social-analyzer's code in a service accessed by users over a network, it must publish Hawkeye Sterling's entire source code under AGPL.

For a commercial compliance product, this is a fundamental business constraint. Options:
1. **REST API boundary only** — call social-analyzer as a separate service over HTTP. The AGPL does not impose obligations on the *consumer* of an API, only on the *provider* of modified AGPL software. This is legally safer but requires legal confirmation.
2. **Commercial licence** — contact qeeqbox to request a commercial licence.
3. **Avoid entirely** — use Maigret (MIT) instead, which covers 3,000+ sites.

**Recommendation:** Obtain legal review of the API boundary interpretation before integrating in a commercial Hawkeye Sterling deployment.

### 2. Selenium/Firefox-ESR Dependency Is Heavy

**Severity: Medium**

WebDriver-based detection requires a running Firefox-ESR instance. This adds ~200MB to the Docker image and significant CPU/memory overhead during scanning. Running 1,000 platform checks with Selenium is orders of magnitude slower than HTTP-only scanning.

**Recommendation:** Use `--mode fast` (HTTPS library only, no WebDriver) for production screening where speed matters. Reserve `--mode advanced` (with Selenium and OCR) for elevated-risk subject deep dives.

### 3. Tesseract OCR Dependency Adds Complexity

**Severity: Low–Medium**

OCR detection requires Tesseract to be installed at the system level. In a Docker deployment this is manageable, but it adds ~50MB and a non-trivial startup dependency.

### 4. Platform List at 1,000+ Requires Ongoing Maintenance

**Severity: Low**

Platform URL patterns change. At 1,000+ sites, a stale platform list produces more false negatives than Sherlock's well-maintained 400-site list. Monitor the upstream project's platform list update frequency.

---

## Integration Architecture for Hawkeye Sterling

Given the AGPL concern, the only safe integration is **REST API only** from a separately deployed social-analyzer service.

```
Elevated-risk subject flagged for social profiling
    ↓
src/services/social_analyzer_client.ts
    ├── GET {SOCIAL_ANALYZER_URL}/api/search?username={name}&mode=fast
    ├── Filter results: confidence >= 50 only
    ├── Map No/Maybe/Yes classifications to HS risk tiers
    └── Return SocialProfile[] with confidence scores
    ↓
src/brain/adverse_media_mode.ts
    ├── High-confidence profiles (≥80) → auto-flag for review
    ├── Dark/crypto platforms → elevated suspicion
    ├── Activity patterns (last_active, post_count) → account age/legitimacy
    └── Cross-linked accounts → feed back to Maigret for deeper dossier
    ↓
web/ → "Social Intelligence" section of subject report
    (show confidence scores, not raw platform names)
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Platform coverage | Very Good | 1,000+ sites with multilayer detection |
| Confidence scoring | Excellent | 0–100 → No/Maybe/Yes classification |
| False positive reduction | Excellent | Best in class vs Sherlock/Maigret |
| REST API | Good | Available; enables API boundary separation |
| Licence | Critical concern | AGPL-3.0 — requires legal review before commercial use |
| Speed | Fair | Selenium mode is slow; use fast mode |
| HS fit | ★★☆ | Best confidence-scoring OSINT tool — conditional on AGPL resolution |

---

## Recommendation

**Evaluate AGPL licence risk before integrating.** If the API boundary legal interpretation is confirmed as safe, social-analyzer is the best confidence-scoring social OSINT tool available. Deploy as a separate Docker service, call via REST API only, and use `--mode fast` for production screening. For baseline coverage without AGPL risk, default to Maigret (MIT, 3,000+ sites). If Maigret's false positive rate is problematic in practice, revisit social-analyzer with a commercial licence.
