# Code Review: InQuest/ThreatIngestor

**Repository:** https://github.com/InQuest/ThreatIngestor  
**Stars:** 911 | **License:** GPL-2.0  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

ThreatIngestor is a threat intelligence aggregation daemon that monitors multiple sources — Twitter/X, Pastebin, RSS feeds, GitHub, MISP, SQS queues — extracts Indicators of Compromise (IOCs: IP addresses, domains, URLs, file hashes), and routes them to downstream consumers (MISP, SQS, CSV, web callbacks). It was purpose-built by InQuest, a commercial threat intelligence firm, and is battle-tested in production threat-intel pipelines.

For Hawkeye Sterling, ThreatIngestor is the **adverse-media and threat-intel pipeline pattern**: it demonstrates how to build a robust, pluggable multi-source IOC ingestion pipeline that can be adapted to feed AML-relevant intelligence (sanctioned domains, flagged IPs, paste site mentions of entity names) into the screening engine.

**License:** GPL-2.0 — copyleft. Must not be statically linked into proprietary code. Use as a standalone service with a clean REST or queue interface.

---

## What the Tool Does

```
Sources (plugins):
    ├── Twitter/X (keyword/account monitoring)
    ├── Pastebin (paste monitoring)
    ├── RSS feeds (threat blogs, news)
    ├── GitHub (repo/commit monitoring)
    ├── SQS (AWS queue ingestion)
    └── MISP (threat intel platform)
    ↓
ThreatIngestor core
    ├── IOC extraction (regex + heuristics)
    │       IPs, domains, URLs, MD5/SHA1/SHA256 hashes
    ├── Deduplication
    └── Routing logic (per-operator configuration)
    ↓
Operators (output plugins):
    ├── MISP (create events/attributes)
    ├── SQS (push to AWS queue)
    ├── CSV (flat file output)
    └── Web (HTTP callback)
```

**Configuration-driven (YAML):**
```yaml
sources:
  - name: finance_twitter
    module: threatingestor.sources.twitter
    config:
      api_key: ...
      keywords: ["#moneylaundering", "#sanctionsevasion"]

operators:
  - name: misp_output
    module: threatingestor.operators.misp
    config:
      url: https://misp.internal
      key: ...
```

---

## Strengths

### 1. Pluggable Source + Operator Architecture

The source/operator plugin model is the key transferable pattern. Each source is a Python class implementing a `run()` generator; each operator implements `handle_artifact()`. Hawkeye Sterling can implement custom sources (regulatory news feeds, court record APIs, company gazette feeds) and operators (HS internal queue) using the same architecture without adopting ThreatIngestor itself.

### 2. IOC Extraction Heuristics Are Reusable

The regex patterns and heuristics for extracting IPs, domains, and hashes from unstructured text are well-tested against real paste sites and Twitter data. These patterns are directly reusable in Hawkeye Sterling's adverse-media text parser for extracting flagged domains and IPs from news articles.

### 3. Twitter/RSS Monitoring Pattern for Adverse Media

Adverse media screening in AML requires monitoring news sources for entity name mentions associated with crime, sanctions, or regulatory action. ThreatIngestor's Twitter and RSS source plugins demonstrate how to do keyword-triggered streaming ingestion at scale — the same pattern applies to AML-relevant keyword monitoring.

### 4. 911 Stars + InQuest Pedigree

InQuest is a credible commercial threat intelligence vendor. 911 stars means real community adoption. The codebase is production-quality Python with tests and documentation.

---

## Issues and Concerns

### 1. GPL-2.0 Licence

**Severity: High**

GPL-2.0 requires any software that incorporates ThreatIngestor to be released under GPL-2.0 if distributed. For a proprietary AML engine like Hawkeye Sterling, this is a hard constraint.

**Recommendation:** Never import or bundle ThreatIngestor code directly. Use it as a standalone daemon communicating via SQS or HTTP. Extract only the IOC regex patterns (which are short utility functions and likely not sufficient for copyright claims at that granularity — but get legal sign-off).

### 2. Twitter/X API Costs

**Severity: Medium**

The Twitter/X API now requires paid access at non-trivial cost for streaming and search. The Twitter source plugin's utility depends on API tier.

**Recommendation:** Prioritise RSS, MISP, and SQS sources. Use Twitter integration only if HS has an existing Enterprise API subscription.

### 3. No Built-in AML Entity Matching

**Severity: Medium**

ThreatIngestor extracts technical IOCs (IPs, hashes, domains) — not named entities or corporate names. AML adverse-media screening requires NER (Named Entity Recognition) to extract person names and company names from news text.

**Recommendation:** Add a post-processing step in the Hawkeye Sterling ingestion layer that runs extracted text through a NER model (spaCy `en_core_web_trf`) to extract person/org names before entity matching.

---

## Integration Architecture for Hawkeye Sterling

```
External sources: RSS (news/regulatory feeds), MISP, Pastebin
    ↓ (ThreatIngestor as standalone daemon)
threatingestor daemon
    ├── IOC extraction (IPs, domains, hashes)
    └── Push to SQS queue: hs-threat-intel-raw
    ↓
src/ingestion/threat_intel_consumer.ts
    ├── Poll SQS: hs-threat-intel-raw
    ├── Enrich: reverse-lookup IPs → ASN, country
    ├── Match IOCs against counterparty domain registry
    └── Push matches to src/brain/adverse_media_aggregator.ts
```

**Pattern extraction (reference only, do not bundle GPL code):**
```typescript
// Reimplemented IOC patterns from ThreatIngestor reference
const IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_PATTERN = /\b[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+\b/gi;
const SHA256_PATTERN = /\b[0-9a-f]{64}\b/gi;
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Architecture pattern | Excellent | Pluggable source/operator — directly reusable as design reference |
| Community maturity | Good | 911 stars, InQuest commercial backing |
| IOC extraction | Good | Well-tested regex heuristics |
| Licence | Caution | GPL-2.0 — run as standalone service only |
| AML entity matching | Poor | No NER for person/company names |
| HS fit | ★★★ | Adverse-media pipeline pattern + IOC extraction reference |

---

## Recommendation

**Use as a design reference and standalone daemon, not as a bundled library.** Adopt the source/operator plugin architecture in Hawkeye Sterling's ingestion layer. Run ThreatIngestor as an isolated microservice, communicating via SQS, to avoid GPL contamination. Supplement its IOC-oriented output with a NER post-processing step for AML entity name extraction.
