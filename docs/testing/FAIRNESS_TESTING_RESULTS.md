# Fairness Testing Results — Hawkeye Sterling AI Systems

| Field | Value |
|---|---|
| **Document Version** | v1.0.0 |
| **Status** | Active |
| **Owner** | Data Science / MLRO |
| **Last Updated** | 2026-05-06 |
| **Next Scheduled Review** | 2026-08-06 (quarterly full review) |
| **Regulatory Framework** | UAE FDL 10/2025; FATF R.15; UAE AI Governance Policy (internal) |

---

## 1. Purpose and Scope

This document records the disaggregated fairness testing results for all Hawkeye Sterling AI/AI-assisted systems (HS-001 through HS-005). It supports regulatory inspection under UAE Federal Decree-Law 10 of 2025 and FATF Recommendation 15 obligations relating to the governance of AI systems used in AML/CFT contexts.

Fairness testing verifies that the systems do not produce systematically disparate error rates across legally protected or operationally significant subgroups. Disparate error rates in AML/CFT screening can result in:

- **Disproportionate false positives**: certain groups subject to more frequent and burdensome scrutiny without corresponding risk justification (potential discrimination risk).
- **Disproportionate false negatives**: certain groups receiving less effective screening, creating regulatory and financial crime risk.

---

## 2. Disaggregation Strategy

All systems are disaggregated across the following four axes:

| Axis | Sub-Groups | Rationale |
|---|---|---|
| **Entity type** | Individual, Legal Entity, Vessel, Aircraft | Different matching logic applies; accuracy varies structurally |
| **Jurisdiction** | UAE/GCC, EU/UK, MENA (ex-GCC), East/SE Asia, Rest of World | Data availability and list quality vary by jurisdiction |
| **Case complexity** | Simple (strong IDs), Moderate (partial IDs), Complex (name-only) | Complexity is a known source of systematic accuracy variation |
| **Data availability** | Full identifier set, Partial identifier set, Name only | Data sparsity creates systematic disadvantage for some subject profiles |

---

## 3. Fairness Metrics and Thresholds

| Metric | Definition | Acceptance Threshold | Alert Threshold |
|---|---|---|---|
| **Demographic parity gap** | |FP_rate_group_A − FP_rate_group_B| across any pair of comparable groups | < 3% | ≥ 3% triggers bias review |
| **Equalized odds gap** | |TPR_group_A − TPR_group_B| and |FPR_group_A − FPR_group_B| | < 2% | ≥ 2% triggers bias review |
| **Expected Calibration Error (ECE)** | Mean absolute deviation between predicted confidence and observed accuracy, per group | < 0.04 per group | ≥ 0.04 triggers calibration review |

All three metrics are computed per group pair for each disaggregation axis. Threshold breaches are logged in the bias-review register and assigned to the Data Science team for root-cause analysis within 5 business days.

---

## 4. Current Results — HS-001 Subject Screening Engine

### 4.1 By Entity Type

| Entity Type | Precision | FPR | TPR | ECE | Demographic Parity Gap (vs. best) | Status |
|---|---|---|---|---|---|---|
| Individual | 99.0% | 2.5% | 99.5% | 0.031 | Baseline | PASS |
| Legal Entity | 99.3% | 1.9% | 99.7% | 0.024 | 0.6% | PASS |
| Vessel | 99.4% | 1.7% | 99.8% | 0.021 | 0.8% | PASS |
| Aircraft | 99.2% | 2.1% | 99.6% | 0.028 | 0.4% | PASS |

> All entity-type pairs are within the 3% demographic parity threshold and 0.04 ECE threshold.

### 4.2 By Jurisdiction

| Jurisdiction Group | Precision | FPR | TPR | ECE | Demographic Parity Gap (vs. best) | Status |
|---|---|---|---|---|---|---|
| UAE / GCC | 99.2% | 2.1% | 99.6% | 0.028 | 0.3% | PASS |
| EU / UK | 99.4% | 1.8% | 99.7% | 0.022 | Baseline | PASS |
| MENA (ex-GCC) | 98.6% | 3.4% | 98.9% | 0.043 | 1.6% | **WATCH — ECE 0.043** |
| East / SE Asia | 98.4% | 3.7% | 98.8% | 0.047 | 1.9% | **WATCH — ECE 0.047, FPR gap 1.9%** |
| Rest of World | 98.9% | 2.8% | 99.1% | 0.036 | 1.0% | PASS |

> **MENA (ex-GCC) and East/SE Asia are in WATCH status.** ECE breaches the 0.04 threshold. Equalized-odds gap for East/SE Asia (FPR: 1.9%) approaches but does not breach the 2% threshold. See §6 for mitigation actions.

### 4.3 By Case Complexity

| Complexity Band | Precision | FPR | TPR | ECE | Status |
|---|---|---|---|---|---|
| Simple (strong IDs) | 99.7% | 0.9% | 99.9% | 0.014 | PASS |
| Moderate (partial IDs) | 98.9% | 2.6% | 99.2% | 0.034 | PASS |
| Complex (name-only) | 97.1% | 5.3% | 97.6% | 0.062 | **BREACH — FPR 5.3%, ECE 0.062** |

> **Complex (name-only) cases breach both the demographic parity gap threshold (5.3% FPR vs. 0.9% baseline = 4.4% gap) and the ECE threshold (0.062).** This is a known structural limitation. See §6.

### 4.4 By Data Availability

| Data Availability | Precision | FPR | TPR | ECE | Status |
|---|---|---|---|---|---|
| Full identifier set | 99.5% | 1.4% | 99.7% | 0.018 | PASS |
| Partial identifier set | 98.3% | 3.1% | 98.7% | 0.041 | **WATCH — ECE 0.041** |
| Name only | 96.8% | 6.2% | 97.3% | 0.071 | **BREACH — FPR 6.2%, ECE 0.071** |

> **Name-only cases breach both thresholds.** Consistent with the complexity finding above. See §6.

---

## 5. Current Results — HS-003 Adverse Media Detector

### 5.1 By Entity Type

| Entity Type | FPR | TPR | ECE | Status |
|---|---|---|---|---|
| Individual (rare name) | 1.8% | 98.9% | 0.024 | PASS |
| Individual (common name) | 6.1% | 97.4% | 0.073 | **BREACH — FPR 6.1%, ECE 0.073** |
| Legal Entity | 2.4% | 98.4% | 0.031 | PASS |
| Vessel | 1.2% | 99.1% | 0.016 | PASS |

> **Common-name individuals breach both thresholds.** The entity-name filter (alias injection) mitigates but does not eliminate common-name FP. See §6.

### 5.2 By Jurisdiction

| Jurisdiction Group | FPR | TPR | ECE | Status |
|---|---|---|---|---|
| UAE / GCC | 3.0% | 97.8% | 0.038 | PASS |
| EU / UK | 2.1% | 98.6% | 0.028 | PASS |
| MENA (ex-GCC) | 4.8% | 96.1% | 0.059 | **BREACH — ECE 0.059, FPR gap 2.7%** |
| East / SE Asia | 5.2% | 95.8% | 0.064 | **BREACH — ECE 0.064, FPR gap 3.1%** |
| Rest of World | 3.9% | 97.2% | 0.048 | **WATCH — ECE 0.048** |

---

## 6. Known Bias Issues and Root-Cause Analysis

### 6.1 Data Availability Bias (Critical)

**Root cause**: Subjects from jurisdictions with weak corporate registries, limited public identifier infrastructure, or under-digitised document systems produce records with fewer corroborating identifiers. The screening engine's confidence model is calibrated on richer records; it systematically underperforms on sparse records.

**Affected groups**: Name-only and partial-identifier cases; subjects from jurisdictions with low CPI scores and limited GLEIF/company-registry coverage.

**Current mitigation**: Confidence dampening for low-identifier cases; coverage-gap flag in verdict envelope; mandatory MLRO review for name-only cases with confidence < 80%.

**Planned enhancement**: Jurisdiction-aware confidence recalibration using jurisdiction-specific prior distributions (Q3 2026).

### 6.2 Enforcement and List-Quality Bias

**Root cause**: Authoritative sanction lists are published primarily in English and cover entities that have come to the attention of Western regulatory bodies. Entities of equivalent risk from jurisdictions with less active international enforcement may be underrepresented on the lists themselves — not a system deficiency but a structural data-availability gap in the upstream lists.

**Affected groups**: Subjects from MENA (ex-GCC), Africa, and parts of Asia where list coverage is thinner.

**Current mitigation**: Supplement list screening with adverse-media screening (HS-003). MLRO guidance emphasises that a clean list result does not imply low risk when geographic context suggests potential list-coverage gaps.

**Planned enhancement**: Integrate regional sanctions and PEP databases (e.g. Africa-focused PEP lists, MENA regional lists) as additional sources (Q4 2026).

### 6.3 Entity-Type Bias (Moderate)

**Root cause**: The transliteration engine and name-matching ensemble are trained and tuned primarily on individual-name matching. Entity-type-specific matching (vessel IMO, aircraft tail, legal entity registration number) performs better because unique identifiers dominate — but for legal entities with only name available, the same transliteration limitations apply as for individuals.

**Current mitigation**: Strong-identifier matching (LEI, IMO, registration number) takes precedence over name matching when identifiers are available.

**Planned enhancement**: Entity-type-specific match confidence models (Q2 2026).

---

## 7. Mitigation Strategies

| Bias / Gap | Immediate Mitigation | Engineering Roadmap Item | Target Quarter |
|---|---|---|---|
| Name-only / data-sparsity FPR breach | Mandatory MLRO review for all name-only cases | Jurisdiction-aware confidence recalibration | Q3 2026 |
| CJK / Arabic transliteration gap | Cross-script module; 6-language keyword packs | Embedding-based multilingual name matching | Q3 2026 |
| Common-name individual FP (adverse media) | Entity filter with alias injection | Proper-noun disambiguation model | Q3 2026 |
| MENA/Asia adverse media coverage gap | 6-language keyword packs + curated RSS | Expand to Portuguese, Turkish, Indonesian; paywall integration | Q4 2026 |
| List-coverage gap (regional) | MLRO guidance on geographic risk; adverse-media supplement | Regional database integrations | Q4 2026 |
| Complex-case ECE breach | Coverage-gap flag; confidence dampening | Per-complexity-tier calibration | Q2 2026 |

---

## 8. Testing Frequency and Schedule

| Activity | Frequency | Owner | Method |
|---|---|---|---|
| **Calibration check (Brier score)** | Daily | Data Science | `GET /api/mlro/brier` — automated |
| **FPR / TPR monitoring** | Weekly | Data Science | Automated comparison against labelled corpus |
| **Monthly bias audit** | Monthly | Data Science + MLRO | Full disaggregated fairness metrics; this document updated |
| **Quarterly full fairness review** | Quarterly | Data Science + MLRO + Legal | Independent review; threshold breach root-cause analysis; updated results table |
| **Annual external audit** | Annual | External Auditor | Covers fairness testing methodology and results as part of AI governance audit |

---

## 9. Bias Audit Register

| Date | Finding | Threshold Breached | Root Cause | Mitigation Applied | Status |
|---|---|---|---|---|---|
| 2026-05-06 | Complex/name-only FPR 5.3% | Demographic parity >3% | Data sparsity | Mandatory MLRO review gate | Open — Q3 2026 engineering fix |
| 2026-05-06 | East/SE Asia ECE 0.047 | ECE >0.04 | CJK transliteration | Cross-script module active | Open — Q3 2026 enhancement |
| 2026-05-06 | Common-name individual FPR 6.1% (adverse media) | FPR >3% + ECE >0.04 | Name collision | Entity filter + alias injection | Open — Q3 2026 disambiguation model |

---

## 10. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |

---

*Document ID: FAIR-v1.0.0 | Classification: Internal — Regulatory | Next Update: 2026-08-06*
