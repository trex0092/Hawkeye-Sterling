# Model Card — HS-001 Subject Screening Engine

| Field | Value |
|---|---|
| **System ID** | HS-001 |
| **Version** | v2.3.1 |
| **Status** | Production |
| **Classification** | AML/CFT Decision-Support Tool |
| **Owner** | Data Science (primary) / MLRO (accountability) |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-11-06 |
| **Regulatory Framework** | UAE Federal Decree-Law 20/2018 (as amended by FDL 10/2025); Cabinet Decision 10/2019; Cabinet Decision 74/2020; FATF Recommendations R.10, R.12, R.15 |

---

## 1. System Description

HS-001 is the primary subject screening pipeline of Hawkeye Sterling. It receives a subject record (individual, legal entity, vessel, or aircraft) plus one or more watchlist candidate sets, and returns a charter-compliant verdict envelope containing a match tier, confidence score, structured findings, red-flag indicators, coverage gaps, and recommended next steps.

The pipeline operates in three tiers with short-circuit logic that promotes to the highest-confidence tier supported by the available evidence:

1. **Identifier-exact** — shared strong identifier (passport number, LEI, IMO number, registration number) across same-type entities.
2. **Name-exact** — normalised-name equality corroborated by at least one contextual or strong disambiguator.
3. **Fuzzy + matrix** — ensemble name matching combined with disambiguator calibration via the entity-resolution and confidence-calibration modules.

---

## 2. Intended Use

| Use Case | Approved |
|---|---|
| Customer onboarding screening (CDD/EDD) | Yes |
| Daily / periodic monitoring re-screens | Yes |
| Transaction monitoring escalation triage | Yes |
| MLRO ad-hoc subject lookups | Yes |
| Batch list-change re-screen (delta ingest) | Yes |

### 2.1 Out-of-Scope Uses

The following uses are **not permitted** under the compliance charter (P1–P10):

- Credit scoring or creditworthiness assessment of any kind
- Automated account freeze without MLRO review and written authorisation (P10)
- Generating customer-facing communications disclosing suspicion or investigation (P4 — tipping-off prohibition)
- Asserting sanctions status without an authoritative list supplied in the current input (P1)
- Generating legal conclusions — the engine produces indicators and recommended actions only (P3)
- Any use outside a regulated AML/CFT compliance context

---

## 3. Training Data and Knowledge Sources

HS-001 does not use a trained ML model for its core verdict logic. All sanctioned-entity matching is driven by real-time ingestion from authoritative watchlists. The following ten sources are in scope:

| # | Source | List ID | Format | Refresh Cadence |
|---|---|---|---|---|
| 1 | UN Security Council Consolidated List (1267/1988/2253) | `un_1267` | XML | Daily |
| 2 | OFAC SDN List | `ofac_sdn` | XML | Daily |
| 3 | OFAC Non-SDN Consolidated List | `ofac_cons` | XML | Daily |
| 4 | EU Consolidated Financial Sanctions List | `eu_consolidated` | XML | Daily |
| 5 | UK OFSI Consolidated List | `uk_ofsi` | XML | Daily |
| 6 | UAE Executive Office for Control and Non-Proliferation (EOCN) | `uae_eocn` | PDF | Daily |
| 7 | UAE Local Terrorist List | `uae_local_terrorist` | PDF | Daily |
| 8 | OpenSanctions PEP dataset | `opensanctions_pep` | JSON | Weekly |
| 9 | NewsAPI adverse-media feed | `newsapi` | REST/JSON | 30-min rolling |
| 10 | GDELT adverse-media event stream | `gdelt` | REST/JSON | 30-min rolling |

Additional contextual inputs (Google CSE, RSS feeds) supplement adverse-media checks but do not constitute watchlist authority.

> **Charter P1 enforcement**: Sanctions assertions are permitted only when the relevant list appears in the current input. Training-data knowledge is explicitly prohibited as a current source (P8).

---

## 4. Cognitive Faculties

HS-001 activates all ten cognitive faculties of Hawkeye Sterling depending on input richness and risk tier:

| # | Faculty | Core Function |
|---|---|---|
| 1 | **Reasoning** | Formal and informal logical inference over evidence and rules |
| 2 | **Data Analysis** | Quantitative interrogation and modelling of structured data |
| 3 | **Deep Thinking** | Slow, reflective System 2 examination |
| 4 | **Intelligence** | Broad pattern recognition across domains and jurisdictions |
| 5 | **Smartness** | Fast, heuristic anomaly detection and triage |
| 6 | **Strong Brain** | Integrated mental prowess — composition of all faculties under load |
| 7 | **Inference** | Probabilistic and causal projection from partial evidence |
| 8 | **Argumentation** | Structured case-building, rebuttal, and adjudication of competing claims |
| 9 | **Introspection** | Self-auditing — bias, calibration, confidence, drift detection |
| 10 | **Ratiocination** | Chained methodical reasoning — stepwise derivation of conclusions |

---

## 5. Outputs

### 5.1 Verdict Labels

| Verdict | Meaning |
|---|---|
| `MATCH` | EXACT or STRONG confidence tier — two or more strong identifiers corroborate the name match; no conflicting data |
| `POSSIBLE` | POSSIBLE confidence tier — name match plus one contextual identifier; multiple candidates cannot be excluded |
| `NO MATCH` | No match found at any tier after exhausting all configured lists; scope declaration emitted |
| `ESCALATE` | Structural conflict, data insufficiency, or partial-name-match-report (PNMR) condition requiring MLRO review |

### 5.2 Confidence Fields

| Field | Type | Description |
|---|---|---|
| `verdict` | enum | One of MATCH / POSSIBLE / NO MATCH / ESCALATE |
| `confidence` | float [0,1] | Calibrated probability score from the ensemble matcher + disambiguator |
| `verdict_delta` | float [-1,1] | Change in confidence from the prior run (for monitoring use cases) |

### 5.3 Envelope Fields

Every response additionally includes: scope declaration (lists checked, version dates, identifiers matched), findings array, red-flag indicators, coverage gaps, recommended next steps, and an audit-line timestamp with HMAC signature.

---

## 6. Performance Metrics

Metrics reported against an internal labelled test corpus of 12,000 subject-candidate pairs (maintained by the Data Science team, updated quarterly):

| Metric | Value | Target |
|---|---|---|
| **Precision** | 99.1% | ≥99.0% |
| **False Positive Rate** | 2.3% | ≤3.0% |
| **False Negative Rate** | 0.4% | ≤0.5% |
| **Recall (sensitivity)** | 99.6% | ≥99.5% |
| **Latency — p50** | 45 ms | ≤60 ms |
| **Latency — p99** | 120 ms | ≤200 ms |
| **Latency — p99.9** | 310 ms | ≤500 ms |

---

## 7. Disaggregated Fairness Evaluation

Performance is disaggregated across four axes to detect systematic disparities:

### 7.1 By Entity Type

| Entity Type | Precision | FP Rate | Notes |
|---|---|---|---|
| Individual | 99.0% | 2.5% | Highest variation — name transliteration |
| Legal Entity | 99.3% | 1.9% | Improved by LEI/registration-number matching |
| Vessel | 99.4% | 1.7% | IMO number used as primary identifier |
| Aircraft | 99.2% | 2.1% | Tail-number matching; limited training corpus |

### 7.2 By Jurisdiction

| Jurisdiction Group | Precision | FP Rate | Notes |
|---|---|---|---|
| UAE / GCC | 99.2% | 2.1% | Primary operational domain |
| EU / UK | 99.4% | 1.8% | High list data quality |
| MENA (ex-GCC) | 98.6% | 3.4% | Arabic transliteration variation; known limitation |
| East / Southeast Asia | 98.4% | 3.7% | CJK script matching; see Known Limitations |
| Rest of World | 98.9% | 2.8% | Mixed data quality |

### 7.3 By Case Complexity

| Complexity Band | Precision | FP Rate |
|---|---|---|
| Simple (single candidate, strong IDs) | 99.7% | 0.9% |
| Moderate (2–4 candidates, partial IDs) | 98.9% | 2.6% |
| Complex (5+ candidates, name-only) | 97.1% | 5.3% |

### 7.4 By Data Availability

| Data Availability | Precision | FP Rate |
|---|---|---|
| Full identifier set | 99.5% | 1.4% |
| Partial identifier set | 98.3% | 3.1% |
| Name only | 96.8% | 6.2% |

---

## 8. Known Limitations

1. **Arabic / Farsi transliteration variation**: The same Arabic name can produce 3–8 distinct romanisation forms. The cross-script transliteration module covers ISO 233 and common IANA variants, but novel romanisations may reduce match recall.
2. **CJK script matching**: Chinese, Japanese, and Korean name matching relies on phonetic approximation; precision is lower than for Latin-script names.
3. **PDF-format list parsing** (UAE EOCN, UAE Local Terrorist List): PDF ingestion is fragile to format changes. Layout shifts trigger parsing errors that are caught by the validation layer and surfaced as coverage gaps.
4. **Data availability disparity**: Subjects with limited public-registry or identifier data receive higher uncertainty scores; this disproportionately affects subjects from jurisdictions with weak corporate registries.
5. **Training-data currency**: Charter P8 prohibits reliance on training data for current sanctions or PEP status. The engine always requires live list data; if lists are unavailable, it returns a gap rather than a guess.
6. **Stale list detection**: If any configured list has not refreshed within 24 hours, the engine flags a `STALE_DATA` coverage gap in the verdict envelope.

---

## 9. Monitoring and Drift Detection

| Activity | Frequency | Owner | Threshold |
|---|---|---|---|
| UN / OFAC / EU / UK list refresh | Daily (automated) | Engineering | Alert if >24 h stale |
| UAE EOCN / Local Terrorist List refresh | Daily (automated) | Engineering | Alert if >24 h stale |
| OpenSanctions PEP refresh | Weekly (automated) | Engineering | Alert if >7 days stale |
| Adverse-media feed refresh (NewsAPI, GDELT) | 30-minute rolling | Engineering | Alert if >60 min stale |
| Precision / FP rate monitoring | Daily (automated) | Data Science | Alert if FP rate >3.5% |
| Brier score calibration check | Daily via `GET /api/mlro/brier` | Data Science | Alert if Brier >0.08 |
| Verdict-delta drift detection | Per-run (automated) | Engineering | Alert if |delta| >0.3 |
| Monthly bias audit | Monthly | Data Science / MLRO | See FAIRNESS_TESTING_RESULTS.md |
| Quarterly full review | Quarterly | Data Science / MLRO | Full disaggregated report |

---

## 10. Regulatory References

| Regulation | Relevance |
|---|---|
| UAE Federal Decree-Law 20/2018 (as amended by FDL 10/2025) | Primary AML/CFT legal framework; screening obligations |
| Cabinet Decision 10/2019 (as amended by CR 134/2025) | Executive regulations; CDD and list-screening requirements |
| Cabinet Decision 74/2020 | Terrorism lists; TFS obligations; FFR/PNMR filing requirements |
| Cabinet Resolution 16/2021 | Administrative penalties for AML/CFT non-compliance |
| FATF Recommendation 10 | Customer due diligence |
| FATF Recommendation 12 | Politically exposed persons |
| FATF Recommendation 15 | New technologies; AI/ML-based tools |
| FATF Recommendation 6 | Targeted financial sanctions |
| MoE DNFBP Circulars | Sector-specific guidance for precious-metals DNFBPs |

---

## 11. Approvals and Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |

> This model card is reviewed and re-signed at every major version increment (x.y.0) and at minimum annually. The current signed copy is stored in the AI Governance folder within the secure document management system.

---

*Document ID: MC-HS-001-v2.3.1 | Classification: Internal — Regulatory*
