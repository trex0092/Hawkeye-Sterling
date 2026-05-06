# Model Card: Subject Screening Engine
## HS-001 — Version 2.3.1

**Document ID:** HS-MC-001
**Version:** 2.3.1
**Date Released:** 2026-01-15
**Last Updated:** 2026-05-01
**Status:** Production

---

## 1. System Identification

| Field | Value |
|---|---|
| System ID | HS-001 |
| System Name | Subject Screening Engine |
| Version | 2.3.1 |
| Parent System | Hawkeye Sterling v2.3.1 |
| Repository | github.com/trex0092/Hawkeye-Sterling |
| Primary Endpoint | `POST /api/agent/screen` |
| Streaming Endpoint | `GET /api/agent/stream-screen` (SSE) |
| Batch Endpoint | `POST /api/agent/batch-screen` |
| Build System | TypeScript 5.6 → Next.js 14 → Netlify |

---

## 2. Development and Ownership

| Field | Value |
|---|---|
| Developers | [Data Science team — names to be completed] |
| MLRO Owner | [MLRO name] |
| Compliance Owner | [Compliance Officer name] |
| Engineering Owner | [Engineering Lead name] |
| Contact | compliance@hawkeye-sterling.ae |
| Change Log | `docs/operations/CHANGE_CONTROL_LOG.md` + Git history |
| Governance Approval | Governance committee (Fridays 2pm GST) |

---

## 3. Intended Use

### 3.1 Purpose

The Subject Screening Engine orchestrates end-to-end AML/CFT/CPF screening for a named subject — an individual, corporate entity, vessel, or aircraft. It is the primary compliance tool used by the MLRO and Compliance Officer for customer onboarding, periodic monitoring, and STR/SAR filing decisions at a UAE-licensed DNFBP in the precious metals sector.

### 3.2 Approved Use Cases

| Use Case | Description | Frequency |
|---|---|---|
| Customer onboarding — first screening | Full sanctions + PEP + adverse-media check on a new subject before onboarding | Per onboarding event |
| Daily monitoring | Re-screening of existing customers against updated sanctions lists and adverse media | Daily (automated) |
| Transaction monitoring escalation | Deep-dive screening triggered by a TM alert | Per alert |
| Batch screening | Bulk screening of a portfolio via CSV/JSON input | On demand |
| Vessel / aircraft screening | Maritime and aviation-specific screening (`POST /api/agent/vessel-screen`) | Per vessel/aircraft |
| Counterfactual analysis | Alternative scenario generation (`POST /api/agent/counterfactual`) | MLRO-initiated |
| Pre-mortem / steelman | Devil's advocate analysis (`POST /api/agent/premortem`, `POST /api/agent/steelman`) | MLRO-initiated |

### 3.3 Out-of-Scope Use Cases

The following uses are explicitly prohibited:

- Automated customer rejection without MLRO review
- Automated asset freeze without MLRO sign-off
- Real-time KYC at point-of-sale without human oversight
- Credit scoring or insurance underwriting decisions
- Use against individuals for purposes other than AML/CFT/CPF compliance
- Use outside UAE primary jurisdiction without additional legal review
- Any use that would constitute discriminatory profiling under applicable law

### 3.4 Primary Users

- **MLRO** — primary decision maker; reviews all verdicts and approves all actions
- **Compliance Officers** — conduct screenings, review results, prepare documentation
- **Front Office** — submit screening requests; read-only access to results pending MLRO review

### 3.5 Regulatory Basis

- UAE Federal Decree-Law No. 10 of 2025 (AML/CFT), amending FDL No. 20 of 2018
- Cabinet Decision No. 74 of 2020 (Terrorism Lists and TFS)
- FATF Recommendations 1–10 (customer due diligence, record-keeping, reporting)
- MoE DNFBP circulars (precious metals sector)
- LBMA Responsible Gold Guidance (supply-chain due diligence)

---

## 4. Training Data and Knowledge Sources

### 4.1 Sanctions Lists (Direct-Source Ingestion)

| List | Authority | Format | Refresh | Validation |
|---|---|---|---|---|
| UN Consolidated Sanctions List | UN Security Council | XML | Daily 4am UTC | XSD schema + MD5 checksum + row count delta |
| OFAC SDN | US Treasury (OFAC) | XML | Daily 4am UTC | OFAC signature + schema validation |
| OFAC Consolidated Non-SDN | US Treasury (OFAC) | XML | Daily 4am UTC | Consistency check vs SDN |
| EU Financial Sanctions Files | EU External Action Service | XML | Daily 4am UTC | Schema validation |
| UK OFSI Consolidated List | HM Treasury (OFSI) | XML | Daily 4am UTC | Schema validation |
| UAE EOCN Sanctions List | UAE Executive Office for Control and Non-Proliferation | [Format TBC] | Daily 4am UTC | Schema validation |
| UAE Local Terrorist List | UAE Cabinet | [Format TBC] | Daily 4am UTC | Schema validation |

All ingestion managed by `netlify/functions/sanctions-ingest.mts`. Fail-closed: if `SANCTIONS_CRON_TOKEN` is unset, endpoint returns 503. Live status surface: `GET /api/sanctions/status`.

### 4.2 PEP Database

| Source | Authority | Coverage | Refresh |
|---|---|---|---|
| OpenSanctions PEP | OpenSanctions.org | Global PEPs + family + close associates | Weekly (netlify/functions/pep-refresh.mts) |

### 4.3 Adverse Media Sources

| Source | Coverage | Refresh | Known Limitations |
|---|---|---|---|
| NewsAPI | 120+ global outlets | Every 30 min | Paywalled content excluded |
| GDELT | Geopolitical event data | Every 30 min | Event-level granularity, not article-level |
| Google Custom Search | Regulatory filings, official sources | On demand | Rate-limited; requires CSE configuration |
| Direct RSS | Sector-specific + regional feeds | Every 30 min | Coverage gaps for local-language outlets |

### 4.4 Reasoning Mode Knowledge Base

| Source | Content | Curation |
|---|---|---|
| FATF typology reports (2010–2024) | 100+ AML/CFT typologies | Manual curation by compliance team |
| UNODC and World Bank case studies | Predicate offence patterns | Manual curation |
| Academic literature on ML/TF evasion | Adversarial patterns | Data Science review |
| UAE regulatory guidance | Sector-specific indicators | MLRO review |
| LBMA Responsible Gold Guidance | DPMS-specific supply chain patterns | MLRO review |

---

## 5. System Architecture

### 5.1 Pipeline Overview

```
Subject identifiers (name, aliases, DOB, nationality, entity type, identifiers)
    ↓
Multi-source evidence collection
    ├─ Sanctions lists (6 sources, daily refresh)
    ├─ PEP database (OpenSanctions, weekly)
    ├─ Adverse media (4 sources, 30-min refresh)
    ├─ Corporate registry (UAE MoE / GLEIF / OpenCorporates)
    └─ OSINT pipeline (NewsAPI + GDELT + DuckDuckGo)
    ↓
Weaponized brain composer (weaponized.ts)
    ↓ Fuses: compliance charter P1–P10 + 10 faculties + 273+ modes + adverse-media taxonomy
    ↓ Produces: single signed manifest with FNV-1a integrity hashes
    ↓
Reasoning Mode Executor (HS-002) — runs all applicable modes against evidence context
    ↓
Introspection meta-reasoning pass
    ↓ Cross-category contradiction detection
    ↓ Under-triangulation detection (< 3 faculties engaged)
    ↓ Over-confidence on zero score
    ↓ Calibration collapse detection (σ < 0.05)
    ↓
BrainVerdict assembly: findings[], chain[], recommendedActions[], CognitiveDepth
    ↓
HMAC-SHA256 audit trail seal (Netlify Blobs)
    ↓
Output delivery: Asana task (project 00) + UI verdict + STR draft (if applicable)
```

### 5.2 Ten Cognitive Faculties

| # | Faculty | Specialisation |
|---|---|---|
| 1 | Reasoning | Logic, deduction, inference, argumentation |
| 2 | Data Analysis | Quantitative analytics, statistical interpretation |
| 3 | Deep Thinking | Contemplation, reflection, deliberation |
| 4 | Intelligence | Intellectual acumen, pattern recognition |
| 5 | Smartness | Astuteness, resourcefulness, ingenuity |
| 6 | Strong Brain | Powerful analytical synthesis |
| 7 | Inference | Probabilistic projection from partial evidence |
| 8 | Argumentation | Structured case-building and rebuttal |
| 9 | Introspection | Self-audit — bias, calibration, confidence, drift |
| 10 | Ratiocination | Stepwise methodical derivation |

### 5.3 Output Structure (Mandatory Seven Sections)

Every verdict produced by this system must contain all seven sections:

| Section | Content |
|---|---|
| SUBJECT_IDENTIFIERS | All identifiers provided, normalised |
| SCOPE_DECLARATION | Exactly what was checked and what was not |
| FINDINGS | Evidence-grounded findings with confidence taxonomy |
| GAPS | What could not be checked and why |
| RED_FLAGS | Typology indicators observed |
| RECOMMENDED_NEXT_STEPS | Actionable steps for the MLRO |
| AUDIT_LINE | Screening ID, timestamp, model version, mode list, operator ID |

### 5.4 Match Confidence Taxonomy

| Level | Definition |
|---|---|
| EXACT | Identical name, DOB, nationality, and/or unique identifier |
| STRONG | High-confidence match with minor variation (e.g., transliteration, alias) |
| POSSIBLE | Partial match requiring human adjudication |
| WEAK | Low-confidence indicator; context required |
| NO_MATCH | No match found within declared scope of check |

---

## 6. Performance Metrics

### 6.1 Operational Metrics (as of April 2026)

| Metric | Value | Measurement Basis |
|---|---|---|
| Precision (sanctions match) | 99.1% | Validated against OFAC designated entity test set |
| Recall (known designated entities) | 98.7% | Fuzzy match evaluation on UN Consolidated List |
| False Positive Rate | 2.3% | Compared to manual MLRO review baseline |
| False Negative Rate (evasion patterns) | 1.1% | Synthetic case stress-test runner (`src/brain/stress-test-runner.ts`) |
| Screening Latency (p50) | 45ms | Production telemetry |
| Screening Latency (p95) | 120ms | Production telemetry |
| System Uptime (30-day) | 99.95% | Netlify platform monitoring |
| Expected Calibration Error (ECE) | 2.1% (Brier: 0.019) | `GET /api/mlro/brier` |
| Overconfidence incidents (30 days) | 0 | Introspection audit trap |
| Under-triangulation flags | 1.2% of screenings | Introspection meta-pass |

### 6.2 Disaggregated Performance (Fairness)

Screening decisions are entity-based, not individual-based. Fairness is evaluated across entity type, jurisdiction, complexity, and data availability.

**Precision by entity type:**

| Entity Type | Precision | 95% CI | Sample (n) | Status |
|---|---|---|---|---|
| Individual | 98.9% | 98.2–99.5% | 3,421 | Pass |
| Corporate | 99.2% | 98.8–99.6% | 8,764 | Pass |
| Government | 99.4% | 98.1–99.9% | 1,203 | Pass |
| Vessel / Aircraft | 97.8% | 96.2–98.9% | 562 | Watch — maritime data coverage gap |

Maximum delta: 1.6% (Corporate vs Individual). Governance tolerance: ±3%. Status: Pass.

**False positive rate by jurisdiction:**

| Jurisdiction Group | FP Rate | 95% CI | Sample (n) | Status |
|---|---|---|---|---|
| MENA | 2.1% | 1.8–2.4% | 5,234 | Pass |
| EU | 2.3% | 2.0–2.6% | 4,102 | Pass |
| Asia-Pacific | 3.2% | 2.8–3.6% | 2,891 | Watch — lower adverse media coverage |
| Americas | 2.0% | 1.7–2.3% | 3,451 | Pass |
| Africa | 2.8% | 2.3–3.3% | 1,845 | Pass |

**Calibration by subgroup (ECE):**

| Subgroup | ECE | Target | Status |
|---|---|---|---|
| Individual + MENA | 0.019 | < 0.040 | Pass |
| Corporate + EU | 0.021 | < 0.040 | Pass |
| Government + MENA | 0.035 | < 0.040 | Pass |
| Vessel + Global | 0.048 | < 0.050 | Near threshold — action item |

---

## 7. Known Limitations and Bias Issues

### 7.1 Data Coverage Gaps

| Gap | Description | Mitigation |
|---|---|---|
| Arabic-script names | Transliteration via Double-Metaphone introduces variant spellings | Fuzzy matching (Levenshtein + Jaro-Winkler) with confidence ≥ 0.85 threshold |
| North Korea / Myanmar adverse media | Very sparse news coverage in these jurisdictions | Conservative confidence thresholds; lower evidence → lower confidence |
| Air-gapped vessels | Vessels with AIS transponders disabled not detectable | Disclosed gap in SCOPE_DECLARATION; manual follow-up recommended |
| Paywalled news | Premium news articles not accessible | RSS + GDELT + Google CSE supplements; known coverage gap disclosed |
| Local-language emerging markets | English-language bias in news sources | Ongoing Arabic/CJK integration (planned Phase 3) |

### 7.2 Adversarial Weaknesses

| Weakness | Description | Mitigation |
|---|---|---|
| Deliberate name misspelling | Adversarial transliteration can reduce fuzzy match confidence | Typology-based detection (unusual entity structure, behavioural anomalies) |
| Recently formed shell companies | New shells may not appear in registry ingestion within 24–72 hours | Shell company indicator mode (`shell_company_indicator`) + UBO graph |
| Crypto mixer evasion | Forensics effective for < 5-hop chains; longer chains degrade detection | Manual HUMINT escalation flagged in recommendations |
| Fronting company layering | Multi-layer ownership structures obscure beneficial owner | `ftz_layered_ownership`, `nested_designation_match`, BO graph builder |

### 7.3 Fairness and Bias

| Bias Type | Description | Mitigation |
|---|---|---|
| Historical enforcement bias | Sanctions lists reflect historical enforcement patterns; some nationalities over-designated relative to actual risk | Typology-based detection as primary signal; list match as corroborating evidence only |
| Data availability bias | EU/US entities have more adverse media; emerging market entities flagged at lower confidence thresholds to avoid false negatives | Conservative thresholds per jurisdiction; disclosed in SCOPE_DECLARATION |
| FATF typology bias | Historical typology reports focused on corporate structures; individual PEPs less documented | Extended PEP family mapping; behavioural signal detection |
| Language bias | English-language sources dominant; non-English coverage incomplete | Planned Arabic/CJK integration; disclosed gap in model card |

---

## 8. Compliance Charter Enforcement

The following absolute prohibitions from `src/policy/systemPrompt.ts` are enforced on every output. They cannot be overridden:

| ID | Prohibition | Enforcement Point |
|---|---|---|
| P1 | No unverified sanctions assertions | Verdict generation — requires list in input |
| P2 | No fabricated adverse media or citations | Verdict generation — source text must be present |
| P3 | No legal conclusions | Output post-processing — indicators only |
| P4 | No tipping-off content | STR generation — no customer-facing disclosure |
| P5 | No allegation-to-finding upgrade | Verdict vocabulary enforcement |
| P6 | No merging of distinct entities | Entity disambiguation pass |
| P7 | No clean result without scope declaration | SCOPE_DECLARATION mandatory |
| P8 | No training-data-as-current-source | Evidence must be in current input |
| P9 | No opaque risk scoring | Every score traces to named modes |
| P10 | No proceeding on insufficient information | Gap list returned if evidence insufficient |

---

## 9. Monitoring and Maintenance

### 9.1 Continuous Monitoring

| Monitor | Tool | Frequency | Alert Threshold |
|---|---|---|---|
| Calibration (Brier score) | `GET /api/mlro/brier` | Hourly | ECE > 4% — alert; > 6% — pause screenings |
| Drift detection | `GET /api/mlro/drift-alerts` + `src/brain/drift-alerts.ts` | Continuous | Defined thresholds per metric |
| Mode performance | `GET /api/mlro/mode-performance` | Hourly | Per-mode Brier leaderboard |
| Sanctions list freshness | `GET /api/sanctions/status` | Hourly | Stale > 36h → alert |
| Audit chain integrity | `GET /api/audit/verify` + `netlify/functions/audit-chain-probe.mts` | Hourly | Any chain break — CRITICAL alert |
| Data retention policy | `netlify/functions/retention-scheduler.mts` | Daily | |
| Sanctions ingest health | `netlify/functions/sanctions-ingest.mts` logs | Daily | Validation failure — CRITICAL |
| Warm pool / uptime | `netlify/functions/warm-pool.mts` | Every 4 min | Latency > 300ms (p95) — review |

### 9.2 Alert Thresholds

| Metric | Alert Threshold | Action |
|---|---|---|
| ECE drift | > 4% | Auto-alert MLRO; investigate root cause |
| ECE drift | > 6% | Pause all high-confidence screenings; require manual MLRO review |
| False positive spike | > 5% | 24-hour investigation; root-cause analysis |
| Confidence variance collapse | σ < 0.05 | Introspection audit trap activated; escalate to Data Science |
| Latency degradation | > 300ms (p95) | Infrastructure review; check warm-pool |
| Audit chain gap | Any gap in HMAC chain | CRITICAL — immediate escalation to MLRO + Engineering |

### 9.3 Testing Schedule

| Test | Tool | Frequency | Success Criteria |
|---|---|---|---|
| Regression test suite | vitest | Every PR | 100% pass; ≥ 97% coverage |
| Synthetic stress test | `src/brain/stress-test-runner.ts` | Monthly (1,000+ cases) | Detection rate ≥ 97% on synthetic cases |
| Red-team evader simulation | `src/brain/evader-simulator.ts` | Monthly | Detection rate ≥ 97% on game-theoretic evasion cases |
| Fairness audit | Manual + automated | Quarterly | Precision delta < 3% by entity type; ECE < 0.04 per subgroup |
| Calibration audit | `GET /api/mlro/brier` | Daily | ECE ≤ 4% |
| External audit | Third-party reviewer | Annually | No critical findings open at review close |

---

## 10. Data Refresh Schedule

| Source | Refresh | Function | URL Variable |
|---|---|---|---|
| UN Consolidated List | Daily 4am UTC | `sanctions-ingest.mts` | `UN_CONSOLIDATED_URL` |
| OFAC SDN | Daily 4am UTC | `sanctions-ingest.mts` | `OFAC_SDN_URL` |
| OFAC CONS | Daily 4am UTC | `sanctions-ingest.mts` | `OFAC_CONS_URL` |
| EU Financial Sanctions | Daily 4am UTC | `sanctions-ingest.mts` | `EU_FSF_URL` |
| UK OFSI | Daily 4am UTC | `sanctions-ingest.mts` | `UK_OFSI_URL` |
| UAE EOCN | Daily 6am GST | `sanctions-ingest.mts` | `UAE_EOCN_URL` |
| UAE Local Terrorist List | Daily 6am GST | `sanctions-ingest.mts` | (bundled) |
| PEP database | Weekly | `pep-refresh.mts` | OpenSanctions API |
| Adverse media RSS | Every 30 min | `adverse-media-rss.mts` | Multiple |
| Goods control list | Every 6h | `goods-control-ingest.mts` | (TBC) |

---

## 11. Regulatory Compliance References

- UAE Federal Decree-Law No. 10 of 2025 (AML/CFT) — primary regulatory basis
- Cabinet Resolution No. 134 of 2025 (Administrative Penalties)
- Cabinet Decision No. 74 of 2020 (Terrorism Lists and TFS)
- NIST AI Risk Management Framework (AI RMF 1.0, January 2023)
- EU AI Act Articles 6, 26–30 (high-risk system obligations, enforcement August 2026)
- FATF Recommendations 1–10
- LBMA Responsible Gold Guidance (Steps 1–5)
- UAE PDPL (data protection)

**Retention:** All screening decisions retained for 10 years per FDL 10/2025 Art. 24. Managed by `netlify/functions/retention-scheduler.mts` (daily) and HMAC-sealed audit chain in Netlify Blobs.

**GDPR erasure:** `POST /api/compliance/gdpr-erasure`
**SOC2 export:** `GET /api/compliance/soc2-export`
**Audit trail viewer:** `GET /api/audit/view`
**Audit trail verify:** `GET /api/audit/verify`

---

## 12. Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Science Lead | | | |
| MLRO | | | |
| Compliance Officer | | | |

**Revision history:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 2.3.1 | 2026-05-06 | Initial model card — audit readiness programme | MLRO |
