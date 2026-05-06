# AI System Inventory

**Document ID:** HS-GOV-002  
**Version:** 1.0.0  
**Effective Date:** 2026-05-06  
**Review Cycle:** Quarterly; updated on every production deployment  
**Owner:** Data Science Lead  
**Classification:** Restricted — Internal Compliance Use Only

---

## Table of Contents

1. [Inventory Overview](#1-inventory-overview)
2. [HS-001 Screening Engine](#2-hs-001-screening-engine)
3. [HS-002 Reasoning Modes](#3-hs-002-reasoning-modes)
4. [HS-003 Adverse Media Analyser](#4-hs-003-adverse-media-analyser)
5. [HS-004 MLRO Auto-Dispositioner](#5-hs-004-mlro-auto-dispositioner)
6. [HS-005 STR/SAR Generator](#6-hs-005-strsар-generator)
7. [Inventory Change Log](#7-inventory-change-log)

---

## 1. Inventory Overview

This document is the authoritative register of all AI systems deployed within the Hawkeye Sterling AML/CFT compliance platform. It is maintained in accordance with UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025) and the AI Governance Policy (`docs/governance/AI_GOVERNANCE_POLICY.md`).

Each entry records: system identity, version, deployment status, technical architecture, data sources, output taxonomy, performance metrics, known limitations, human oversight requirements, and risk classification.

### System Summary

| System ID | Name | Version | Status | Risk Tier | Last Updated |
|---|---|---|---|---|---|
| HS-001 | Screening Engine | 2.3.1 | Production | HIGH | 2026-05-06 |
| HS-002 | Reasoning Modes | 2.3.1 | Production | HIGH | 2026-05-06 |
| HS-003 | Adverse Media Analyser | 2.3.1 | Production | HIGH | 2026-05-06 |
| HS-004 | MLRO Auto-Dispositioner | 1.0.0 | Pilot | CRITICAL | 2026-05-06 |
| HS-005 | STR/SAR Generator | 1.2.1 | Production | CRITICAL (pre-review) | 2026-05-06 |

---

## 2. HS-001 Screening Engine

### 2.1 Identity

| Field | Value |
|---|---|
| System ID | HS-001 |
| System Name | Hawkeye Sterling Screening Engine |
| Version | 2.3.1 |
| Status | Production |
| Risk Classification | HIGH (CRITICAL for sanctions sub-component) |
| Primary Codebase | `src/brain/entity-screening-engine.ts`, `src/brain/quick-screen.ts`, `src/brain/matching.ts` |
| Charter Alignment | P1, P6, P7, P9, P10 |

### 2.2 Purpose

The Screening Engine is the primary AML/CFT subject-screening system. It screens individuals, legal entities, vessels, and aircraft against authoritative sanctions lists, PEP databases, and adverse-media signals. It produces a structured, charter-compliant output that a human MLRO reviews before any compliance action is taken.

### 2.3 Data Sources

The engine consumes data from 10 sources, grouped by category:

**Sanctions Lists (6 sources)**

| Source ID | Authority | Refresh Cadence | Format | List IDs |
|---|---|---|---|---|
| UN Consolidated List | UN Security Council | Daily | XML | `un_1267` |
| OFAC SDN | US Department of the Treasury | Daily | XML | `ofac_sdn` |
| OFAC Consolidated | US Department of the Treasury | Daily | XML | `ofac_cons` |
| EU Consolidated Financial Sanctions | European Union Official Journal | Daily | XML | `eu_consolidated` |
| UK OFSI Consolidated | UK Office of Financial Sanctions Implementation | Daily | XML | `uk_ofsi` |
| UAE EOCN / Local Terrorist List | UAE National Security Council | Weekly | PDF | `uae_eocn`, `uae_local_terrorist` |

**PEP Database (1 source)**

| Source ID | Authority | Refresh Cadence | Format | Notes |
|---|---|---|---|---|
| OpenSanctions PEP | Wikidata, national government gazettes | Daily | JSON/CSV | Covers 240+ jurisdictions; includes RCA relationships |

**Adverse Media (3 sources — fed from HS-003)**

| Source ID | Authority | Refresh Cadence |
|---|---|---|
| NewsAPI | Commercial aggregator | Real-time |
| GDELT | Academic/open source | 15-minute intervals |
| Google Custom Search Engine (CSE) | Commercial | Real-time |

### 2.4 Cognitive Faculties

The engine activates 10 cognitive faculties during a full screening run:

| Faculty ID | Display Name | Description |
|---|---|---|
| `reasoning` | Reasoning | Formal and informal logical inference over evidence and rules |
| `data_analysis` | Data Analysis | Quantitative interrogation of structured and semi-structured data |
| `deep_thinking` | Deep Thinking | Slow, reflective System 2 examination |
| `inference` | Inference | Drawing warranted conclusions from evidence patterns |
| `introspection` | Introspection | Self-monitoring for bias, overconfidence, and calibration collapse |
| `argumentation` | Argumentation | Constructing and stress-testing evidential chains |
| `smartness` | Smartness | Fast heuristic pattern matching (System 1) |
| `ratiocination` | Ratiocination | Structured deductive reasoning |
| `creativity` | Creativity | Novel hypothesis generation for edge cases |
| `communication` | Communication | Structured output generation in charter-compliant format |

### 2.5 Output Taxonomy

Every screening run produces one of four top-level verdicts, plus structured sub-fields:

| Verdict | Meaning | Required Action |
|---|---|---|
| **MATCH** | Strong or Exact confidence hit against an authoritative list | MLRO review; disposition required; potential freeze (D05/D06) |
| **POSSIBLE** | Possible confidence hit; candidates cannot be excluded | MLRO review; EDD to disambiguate (D03) |
| **NO MATCH** | No hit at any confidence level across declared scope | Scope declaration mandatory (P7); document and monitor |
| **ESCALATE** | Confidence below 65%, or structural/charter issue detected | Mandatory MLRO review; auto-dispositioner blocked |

**Match Confidence Taxonomy (per charter):**

| Level | Criteria |
|---|---|
| EXACT | Full name + ≥2 strong identifiers (DOB, nationality, passport, address, registration number, UBO). No conflicting data. |
| STRONG | Full name match + 1 strong identifier + no conflicting data |
| POSSIBLE | Full name OR partial name + 1 contextual identifier (nationality, profession, sector). Multiple candidates cannot be excluded. |
| WEAK | Name-only, partial-name, or phonetic/transliteration match without corroborating identifiers |
| NO MATCH | Screened against stated scope; no hit at any confidence level |

### 2.6 Three-Tier Pipeline Architecture

```
Tier 1: Identifier-Exact
  └── Shared strong ID across same-type entities
      (short-circuits to EXACT if matched)

Tier 2: Name-Exact
  └── Normalised-name equality + ≥1 contextual/strong disambiguator
      (short-circuits to STRONG if matched)

Tier 3: Fuzzy + Matrix
  └── Ensemble name match (Levenshtein, Jaro-Winkler, Soundex,
      Double Metaphone, Arabic-root) + disambiguator calibration
      via resolveEntities / calibrateConfidence
```

### 2.7 Disposition Codes

The engine supports all 35 disposition codes (D00–D35) as defined in `src/brain/dispositions.ts`. High-frequency dispositions in the screening workflow:

| Code | Label | Min Approvals | MLRO Sign-off |
|---|---|---|---|
| D00 | No match | 1 | No |
| D01 | False positive (documented) | 2 | No |
| D03 | Escalate to EDD | 2 | No |
| D05 | Frozen — FFR filed | 2 | Yes |
| D06 | Partial match — PNMR filed | 2 | Yes |
| D09 | Do not onboard | 2 | Yes |

### 2.8 Known Limitations

- Sanctions list freshness is bounded by the upstream data refresh cadence (see Data Lineage)
- UAE EOCN list is in PDF format; Phase 2 PDF parser is pending (`uae_eocn` adapter raises `Phase-2` error if invoked)
- Transliteration matching for Arabic/Cyrillic/CJK scripts may produce higher false positive rates for common name fragments; POSSIBLE confidence maximum applies without native-script corroboration
- OpenSanctions PEP database does not include all sub-national PEP categories in all jurisdictions; gaps documented per jurisdiction in `src/brain/jurisdictions-full.ts`

### 2.9 Human Oversight Requirement

**MANDATORY.** No screening verdict may be actioned without MLRO review. The engine outputs decision support only. The MLRO dispositions every case. This requirement is non-negotiable and is enforced by the charter (prohibition P3) and RBAC controls.

---

## 3. HS-002 Reasoning Modes

### 3.1 Identity

| Field | Value |
|---|---|
| System ID | HS-002 |
| System Name | Hawkeye Sterling Reasoning Modes |
| Version | 2.3.1 |
| Status | Production |
| Risk Classification | HIGH |
| Primary Codebase | `src/brain/reasoning-modes.ts`, `src/brain/reasoning-modes-wave3.ts` through `wave12.ts`, `src/brain/mlro-reasoning-modes.ts`, `src/brain/modes/` |

### 3.2 Purpose

The Reasoning Modes system is a registry of analytical reasoning primitives that the MLRO advisor invokes to produce structured, multi-perspective compliance analysis. Each mode encapsulates a named reasoning methodology (e.g., Bayesian inference, Benford's Law, source triangulation) with a defined apply function and metadata binding it to relevant cognitive faculties and compliance use cases.

### 3.3 Mode Counts by Wave

| Wave | Mode Count | Status | Primary Category Focus |
|---|---|---|---|
| Wave 1 | 140 | Production | Logic, cognitive science, epistemology, probability |
| Wave 2 | 133 | Production | Domain-specific AML/CFT typologies, forensic accounting, OSINT |
| Wave 3 | 100 | Production (wired into `MODE_OVERRIDES`) | OSINT, red-team/adversarial, geopolitical, forensic accounting, behavioral economics, network science, linguistic analysis, sanctions evasion, crypto forensics, ESG |
| Wave 4–12 | Ongoing | Production | Extended domains, sector-specific overlays |

**Total active modes: 412+ across 50+ categories.**

### 3.4 Mode Categories

| Category | Examples |
|---|---|
| `logic` | Modus ponens, modus tollens, reductio ad absurdum, fuzzy logic, deontic logic, temporal logic |
| `cognitive_science` | System 1, System 2, dual-process arbitration, OODA loop, pre-mortem |
| `statistical` | Bayes theorem, confidence intervals, Benford's law, entropy, KL divergence |
| `behavioral` | Anchoring avoidance, loss aversion calibration, escalation of commitment |
| `typology` | Structuring detection, smurfing detection, layering analysis, TBML |
| `forensic_accounting` | Journal entry anomaly, revenue recognition stretch, vendor master anomaly |
| `network_science` | Centrality, community detection, motif detection, bridge detection |
| `osint` | Source triangulation, corroboration ranking, OSINT source tiering |
| `geopolitical` | Jurisdiction risk overlay, sanctions regime conflict analysis |
| `data_quality` | Completeness audit, freshness check, reconciliation, discrepancy log |
| `governance` | Four-eyes check, SoD validation, audit trail reconstruction |

### 3.5 Activation Logic

Modes are activated by:

1. **Direct MLRO selection** — operator selects specific mode IDs via the MLRO picker (`public/mlro-picker.js`)
2. **Pipeline preset** — pre-configured mode sequences from `src/brain/mlro-pipeline-presets.ts`
3. **MODE_OVERRIDES** — Wave 3+ modes with real `apply()` implementations override the default stub when invoked

The pipeline enforces a **25-second hard ceiling per mode** (AbortController) and a configurable total budget (default 60 seconds, hard-capped at `HARD_CEILING_MS`).

### 3.6 Introspection Meta-Pass

After pipeline execution, a meta-cognition layer (`src/brain/meta-cognition.ts`) performs a self-assessment pass with four mandatory checks:

| Check | Description | Trigger |
|---|---|---|
| **Contradiction Detection** | Identifies conflicting assertions across mode outputs | Any two modes produce directionally opposed findings |
| **Under-Triangulation** | Flags when a conclusion rests on fewer than the required minimum independent corroborating sources | Fewer than 2 independent sources support a material finding |
| **Overconfidence** | Detects confidence assertions that exceed what the evidence supports | Stated confidence > reference-class base rate for the claim type |
| **Calibration Collapse** | Detects systematic miscalibration across multiple runs (Brier score degradation) | Running Brier score exceeds drift warning threshold |

### 3.7 Performance Monitoring

Per-mode Brier scores are computed by the `CalibrationLedger` class (`src/brain/mlro-calibration.ts`) and exposed via:

```
GET /api/mlro/brier
```

The response includes:
- `windowSize` — total scored samples
- `hitRate` — confirmed / (confirmed + reversed)
- `brierScore` — mean squared error of probability forecasts (lower = better)
- `logScore` — mean log loss
- `byMode` — per-mode `{ n, hits, brier }` breakdown
- `drift.warning` — true if `|recentHitRate - olderHitRate| > 0.15`

Mode drift alerts are surfaced via:

```
GET /api/mlro/drift-alerts
```

### 3.8 Mode Performance Leaderboard

```
GET /api/mlro/mode-performance
```

Returns modes ranked by Brier score ascending (best-performing first). Reviewed at every Friday governance committee meeting.

### 3.9 Known Limitations

- Wave 1 and Wave 2 modes use `defaultApply()` stubs for modes not yet implemented with real algorithms; stub outputs are flagged as `inconclusive` and cannot drive a case disposition
- Per-mode Brier scores require a minimum sample size (n ≥ 30) before being statistically reliable
- Meta-cognition contradiction detection operates on the narrative text level; semantic contradiction in structured data fields requires additional validation

---

## 4. HS-003 Adverse Media Analyser

### 4.1 Identity

| Field | Value |
|---|---|
| System ID | HS-003 |
| System Name | Hawkeye Sterling Adverse Media Analyser |
| Version | 2.3.1 |
| Status | Production |
| Risk Classification | HIGH |
| Primary Codebase | `src/brain/adverse-media.ts`, `src/brain/adverse-media-analyser.ts`, `src/brain/adverse-media-i18n.ts` |

### 4.2 Purpose

The Adverse Media Analyser performs systematic monitoring of open-source news and media for information that may indicate financial crime, regulatory breach, or reputational risk associated with subjects under review. It classifies content against a 5-category (core AML/CFT mandate) and 12-category (full taxonomy) keyword framework.

### 4.3 Core 5-Category AML/CFT Taxonomy

| Category ID | Display Name | Regulatory Relevance |
|---|---|---|
| `ml_financial_crime` | Money Laundering & Financial Crime | FATF R.3; primary AML predicate |
| `terrorist_financing` | Terrorist Financing | FATF R.5; TF predicate |
| `proliferation_financing` | Proliferation Financing | FATF R.7; CPF predicate; UAE sanctions nexus |
| `corruption_organised_crime` | Corruption, Bribery & Organised Crime | FATF R.3; predicate offences |
| `legal_criminal_regulatory` | Legal, Criminal & Regulatory Proceedings | Ongoing adverse proceedings indicator |

### 4.4 Extended Taxonomy (12 Categories Total)

Additional categories beyond the core 5:

| Category ID | Display Name |
|---|---|
| `esg` | ESG & Responsible-Sourcing Controversies |
| `cybercrime` | Cybercrime & Digital-Asset Abuse |
| `ai` | AI-Enabled Risk & Synthetic-Media Abuse |
| `sanctions_violations` | Sanctions Violations & Evasion |
| `human_trafficking_modern_slavery` | Human Trafficking & Modern Slavery |
| `tax_crimes` | Tax Crimes & Fiscal Fraud |
| `environmental_crime` | Environmental Crime & Illegal Resource Extraction |
| `drug_trafficking` | Drug Trafficking & Narcotics |

### 4.5 Keyword Coverage

| Metric | Value |
|---|---|
| Total unique keywords (English) | 180+ |
| Multilingual packs | Arabic (ar), Persian (fa), French (fr), Spanish (es), Russian (ru), Mandarin (zh) |
| Total speakers covered by multilingual packs | ~4.3 billion |
| Boolean OR query terms | 55+ root terms in `ADVERSE_MEDIA_QUERY` |
| Multilingual routing logic | Keywords routed to `ml_financial_crime`, `corruption_organised_crime`, or `sanctions_violations` buckets via `i18nBucket()` |

### 4.6 Data Sources

| Source | Authority | Refresh Cadence | Access Method |
|---|---|---|---|
| NewsAPI | Commercial news aggregator | Real-time | REST API (`NEWSAPI_KEY` env) |
| GDELT | Academic / open-source global event database | Every 15 minutes | REST query |
| Google Custom Search Engine (CSE) | Commercial web search | Real-time | REST API (`GOOGLE_CSE_KEY` env) |
| RSS Feeds | Various media outlets (configurable) | 30-minute polling | HTTP feed parser |

### 4.7 Boolean Query

The canonical search query (`ADVERSE_MEDIA_QUERY` in `src/brain/adverse-media.ts`) is compiled from the 5 core AML/CFT categories. It is used uniformly across all 4 source APIs to ensure consistent coverage. The query uses exact-phrase quoting for multi-word terms.

### 4.8 Classification Algorithm

1. **Substring scan** — haystack (lowercased source text) is scanned for each keyword in each category; hit records category ID, keyword, and character offset
2. **I18n tokeniser pass** — `classifyI18n()` (`src/brain/adverse-media-i18n.ts`) processes Arabic, Russian, Chinese, French, Spanish, and Persian keyword packs; CJK handled without space tokenisation
3. **Bucket routing** — multilingual hits are routed to the most relevant AML/CFT bucket via `i18nBucket()`

### 4.9 Performance Metrics

| Metric | Value | Notes |
|---|---|---|
| False positive rate | ~3.2% | Measured on validated sample of 1,000 screened news items |
| Refresh latency (NewsAPI/CSE) | < 5 minutes | Real-time query on demand |
| GDELT refresh lag | ≤ 15 minutes | Batch ingestion cadence |
| RSS refresh lag | ≤ 30 minutes | Polling cadence |

### 4.10 Known Coverage Gaps

| Gap | Description | Mitigation |
|---|---|---|
| **Local-language outlets** | Non-indexed regional media (local Arabic, Urdu, Hindi, Farsi outlets) may not appear in NewsAPI or GDELT | Extended RSS feed list; manual MLRO review for high-risk jurisdictions |
| **Paywalled content** | Premium news sources behind paywalls are not scraped | Relevant subscriptions maintained where operationally material; flagged in gap section of output |
| **Duplicate detection** | Same story may appear via multiple sources | `rawHash` deduplication on ingestion (`src/brain/watchlist-adapters.ts`); dedup rules in `src/brain/dq-rules.ts` |
| **Historical coverage** | GDELT coverage pre-1979 is limited; some regional archives not indexed | Date-range declared in scope declaration per charter P7 |
| **Satire and opinion** | Opinion pieces and satirical content may trigger keywords | Confidence weighting applied; MLRO review required before actioning any hit |

### 4.11 Human Oversight Requirement

All adverse-media findings require MLRO review before inclusion in a disposition decision. The analyser classifies and ranks; it does not dispose. Unresolved adverse-media findings must be resolved within 5 business days per the risk appetite framework.

---

## 5. HS-004 MLRO Auto-Dispositioner

### 5.1 Identity

| Field | Value |
|---|---|
| System ID | HS-004 |
| System Name | MLRO Auto-Dispositioner |
| Version | 1.0.0 |
| Status | **PILOT** |
| Risk Classification | CRITICAL |
| Primary Codebase | `src/brain/mlro-auto-dispositioner.ts` |
| Charter Alignment | P3, P4, P10 |

### 5.2 Purpose

The Auto-Dispositioner analyses pipeline output and proposes a disposition code (D00–D35) with a confidence score and rationale. It is strictly decision-support: the MLRO's decision is always final, and the Auto-Dispositioner cannot submit reports, freeze funds, or terminate relationships autonomously.

### 5.3 Pilot Phase Constraints

**THIS SYSTEM IS IN PILOT STATUS. The following constraints apply during the pilot phase and may not be waived:**

1. **Approval workflow requirement**: Every auto-proposed disposition must be explicitly accepted or rejected by a named MLRO before any downstream action is taken. Acceptance is logged with MLRO identity, timestamp, and case reference.

2. **Human oversight mandate**: The Auto-Dispositioner chip is displayed in the MLRO interface as a recommendation only. It is clearly labelled "AI Proposal — MLRO Review Required". No user interface affordance may make the AI proposal the default acceptance path.

3. **No autonomous submission**: The system may not trigger goAML submissions, funds freezes, or relationship terminations autonomously in any circumstances during the pilot phase.

4. **Pilot scope limitation**: During the pilot phase, the Auto-Dispositioner operates only on cases where the full pipeline has completed without partial run (`partial: false`) and charter validation has passed.

### 5.4 Confidence Threshold

**Hard rule: confidence < 65% always escalates to manual MLRO review.**

This threshold is implemented as a hard-coded gate in the system and is reflected in the risk tolerance matrix. It cannot be overridden by configuration, user instruction, or role framing.

When confidence ≥ 65%, the system may propose a disposition, but the MLRO retains full discretion to accept, reject, or modify the proposal.

### 5.5 Disposition Logic

The dispositioner evaluates inputs in the following priority order:

| Priority | Condition | Proposed Disposition | Confidence |
|---|---|---|---|
| 1 | Tipping-off phrasing detected in egress | D08 (exit — tipping-off) | 0.80 |
| 2 | Confirmed sanctions redline fired (EOCN/UN/OFAC) | D05 (frozen + FFR) | 0.92 |
| 3 | Partial sanctions match phrasing | D06 (PNMR) | 0.75 |
| 4 | CAHRA without OECD DDG Annex II documentation | D09 (do not onboard) | 0.88 |
| 5 | STR-filing language in narrative | D07 (STR filed) | 0.70 |
| 6 | Exit-relationship language | D08 (exit) | 0.68 |
| 7 | Do-not-onboard language | D09 (do not onboard) | 0.72 |
| 8 | Refer-to-authority language | D10 (refer to authority) | 0.65 |
| 9 | Partial pipeline run | D03 (EDD required) | 0.50 |
| 10 | Charter validation failure | D03 (EDD required) | 0.55 |
| 11 | EDD language in narrative | D03 (EDD required) | 0.70 |
| 12 | Heightened monitoring language | D04 (heightened monitoring) | 0.68 |
| 13 | NO MATCH language | D00 (no match — scope required) | 0.72 |
| 14 | Cleared/approved language | D02 (cleared — proceed) | 0.70 |
| 15 | Default (no strong signal) | D03 (EDD — collect further evidence) | 0.40 |

### 5.6 Known Limitations

- Pattern matching is regex-based against the narrative text; it does not perform deep semantic understanding
- Confidence values are heuristic and require calibration against MLRO ground truth as the ledger grows
- The system has no memory of prior cases; each run is stateless
- Regulatory change (new designation regimes, new filing obligations) requires a code update; the system does not self-update
- The default disposition (D03) is intentionally conservative; operators should expect frequent EDD recommendations as a safety property

### 5.7 Escalation Triggers to Manual Review

The Auto-Dispositioner automatically outputs `ESCALATE` (suppressing any disposition proposal) under the following conditions:

- Confidence < 65%
- `tippingOffMatches > 0`
- `partial: true` in pipeline result
- `charterAllowed: false`
- `structuralIssues.length > 0`
- Any fired redline ID matching confirmed sanctions patterns

---

## 6. HS-005 STR/SAR Generator

### 6.1 Identity

| Field | Value |
|---|---|
| System ID | HS-005 |
| System Name | STR/SAR Generator |
| Version | 1.2.1 |
| Status | Production |
| Risk Classification | CRITICAL (pre-review); HIGH (post-review) |
| Primary Codebase | `src/brain/str-narratives.ts`, `src/integrations/goaml-xml.ts`, `src/enterprise/goaml-submission.ts` |
| Charter Alignment | P1, P2, P3, P4, P5, P6, P7 |

### 6.2 Purpose

The STR/SAR Generator drafts Suspicious Transaction Reports (STRs) and Suspicious Activity Reports (SARs) in the format required by the UAE Financial Intelligence Unit's goAML platform. All drafts are subject to mandatory MLRO review and sign-off before submission. The system does not submit any report autonomously.

### 6.3 goAML Integration

Auto-submission endpoint (post-MLRO approval):

```
POST /api/goaml/auto-submit
```

The submission adapter (`src/enterprise/goaml-submission.ts`) supports:
- **HTTPS transport** — licensed endpoint URL + mutual-TLS certificates + goAML credentials (`endpointUrl`, `username`, `password` from environment)
- **SFTP transport** — batch drop for regimes requiring it
- **Stub transport** — in-memory sink for development and testing; no real regulator contact

Every submission is anchored to the audit chain with a tamper-evident hash. The submission receipt (including regulator-side submission ID) is retained per the record retention policy (record class: `str_filing`, 10 years).

### 6.4 Compliance Charter Prohibitions Enforced

The generator enforces all 10 charter prohibitions (P1–P10) as hard constraints on every draft. The following are particularly critical for STR/SAR context:

| Prohibition | Implementation |
|---|---|
| **P1** — No sanctions assertion without authoritative list | Assertions are sourced only from verified list matches passed in the pipeline input |
| **P2** — No fabricated citations | Every adverse-media claim in the narrative must be traceable to source text in the input; no hallucinated URLs or case numbers |
| **P3** — No legal conclusions | Narrative describes observable facts and typology indicators; legal characterisation is left to the MLRO and FIU |
| **P4** — No tipping-off | Tipping-off guard (`src/brain/tipping-off-guard.ts`) scans every draft before it is presented to the MLRO; any match blocks the output |
| **P5** — No allegation upgrading | Language standards enforced: "alleged", "reported", "accused" for unproven claims |
| **P7** — Scope declaration mandatory | Every draft includes a complete scope declaration including lists checked, version dates, and identifiers matched |

### 6.5 Mandatory Report Structure

Every STR/SAR draft conforms to a 7-section structure aligned with goAML requirements:

| Section | Content |
|---|---|
| 1. Subject Identifiers | Verbatim subject details as provided, plus parsed form |
| 2. Scope Declaration | Lists checked, version dates, jurisdictions, date range, matching method |
| 3. Findings | Structured entries per potential hit: source, confidence, basis, disambiguators, nature, verbatim/paraphrased claim |
| 4. Gaps | What was not checked, missing identifiers, stale data warnings |
| 5. Red Flags | Factual indicators only; no legal conclusions |
| 6. Recommended Next Steps | EDD actions, documents to request; not a final disposition |
| 7. Audit Line | Timestamp, scope hash, model version caveat, "This output is decision support, not a decision. MLRO review required." |

### 6.6 Tipping-Off Guardrails

The tipping-off guard operates as a mandatory pre-egress check on all STR/SAR draft content. The check:
- Scans narrative text for language that discloses, hints at, or could alert a subject to a pending investigation, STR, SAR, FFR, PNMR, or regulatory enquiry
- Blocks the draft if any tipping-off pattern fires
- Returns the block reason to the MLRO with a compliant alternative suggestion (neutral offboarding language without reasons)
- Logs the block event to the audit chain

**No tipping-off check bypass is permitted under any circumstances (charter P4; UAE FDL 20/2018 Art. 25).**

### 6.7 Human MLRO Review Gate

**The MLRO must review and explicitly approve every STR/SAR draft before goAML submission.** The approval gate:
- Requires MLRO authentication
- Records MLRO identity, review timestamp, and any edits made
- Produces a signed approval record retained with the filing
- Blocks auto-submit if MLRO approval token is absent or expired

No technical mechanism exists to bypass this gate in production. Any attempt to submit without MLRO approval raises an exception and creates an audit log entry flagged as a CRITICAL incident.

### 6.8 Known Limitations

- Draft quality is bounded by the quality of pipeline inputs; incomplete CDD data produces incomplete narratives (charter P10 invoked — gap list returned)
- goAML XML schema version compatibility must be verified on each UAE FIU schema update
- SFTP transport requires manually managed server credentials; certificate rotation is a manual process
- Stub transport is the default in non-production environments; operators must explicitly configure the HTTPS transport in production

---

## 7. Inventory Change Log

| Date | System | Change | Version | Approved By |
|---|---|---|---|---|
| 2026-05-06 | All | Initial inventory creation | 1.0.0 | MLRO |

---

**Document Control**

| Field | Value |
|---|---|
| Document ID | HS-GOV-002 |
| Version | 1.0.0 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md`, `docs/data-governance/DATA_LINEAGE.md` |
