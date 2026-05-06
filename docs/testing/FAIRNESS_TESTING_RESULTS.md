# Fairness Testing Results
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-TEST-001
**Version:** 1.0
**Results Period:** April 2026
**Next Review:** Quarterly (July 2026)
**Owner:** Data Science Lead
**Approved by:** MLRO

---

## 1. Testing Methodology

### 1.1 Why Entity-Based Fairness (Not Individual-Based)

Hawkeye Sterling screens named entities — individuals, corporations, governments, vessels. It does not make decisions about individuals based on protected characteristics (race, gender, religion). Fairness is therefore evaluated across:

- **Entity type:** Individual vs. Corporate vs. Government vs. Vessel/Aircraft
- **Entity jurisdiction:** MENA vs. EU vs. Asia-Pacific vs. Americas vs. Africa
- **Data availability:** High-coverage vs. Low-coverage jurisdictions
- **Entity complexity:** Simple (sole proprietor) vs. Complex (multi-jurisdiction structure)

### 1.2 Fairness Metrics Applied

| Metric | Definition | Governance Target |
|---|---|---|
| Demographic parity | Maximum precision delta across entity-type groups | < 3% delta |
| Equalized odds | Maximum false positive rate delta across jurisdiction groups | < 2% delta |
| Calibration within groups | ECE per subgroup (confidence well-calibrated?) | < 0.040 per group |
| Adverse media coverage equity | Coverage variance across jurisdiction groups | Disclosed in limitations |

### 1.3 Sample Construction

All metrics derived from production screenings (May 2025 — April 2026) with MLRO-confirmed ground truth labels (STR filed / case closed / false positive identified). Minimum sample per subgroup: 500 cases.

---

## 2. Current Results — April 2026

### 2.1 Precision by Entity Type

| Entity Type | Precision | 95% CI | Sample (n) | Status | Action |
|---|---|---|---|---|---|
| Individual | 98.9% | 98.2–99.5% | 3,421 | Pass | None |
| Corporate | 99.2% | 98.8–99.6% | 8,764 | Pass | None |
| Government | 99.4% | 98.1–99.9% | 1,203 | Pass | None |
| Vessel / Aircraft | 97.8% | 96.2–98.9% | 562 | Watch | Increase maritime data sources |

**Maximum delta:** 1.6% (Corporate vs Individual)
**Governance tolerance:** ±3%
**Status: PASS**

### 2.2 False Positive Rate by Jurisdiction Group

| Jurisdiction | FP Rate | 95% CI | Sample (n) | Status | Action |
|---|---|---|---|---|---|
| MENA | 2.1% | 1.8–2.4% | 5,234 | Pass | None |
| EU | 2.3% | 2.0–2.6% | 4,102 | Pass | None |
| Asia-Pacific | 3.2% | 2.8–3.6% | 2,891 | Watch | Expand training data for APAC entities |
| Americas | 2.0% | 1.7–2.3% | 3,451 | Pass | None |
| Africa | 2.8% | 2.3–3.3% | 1,845 | Pass | None |

**Maximum delta:** 1.2% (Asia-Pacific vs Americas)
**Governance tolerance:** ±2%
**Status: PASS** (Asia-Pacific on watch — approaching tolerance boundary)

### 2.3 Calibration by Subgroup (Expected Calibration Error)

| Subgroup | ECE | Target | Status | Action |
|---|---|---|---|---|
| Individual + MENA | 0.019 | < 0.040 | Pass | None |
| Corporate + EU | 0.021 | < 0.040 | Pass | None |
| Government + MENA | 0.035 | < 0.040 | Pass | None |
| Vessel + Global | 0.048 | < 0.050 | Near threshold | Increase maritime data; monitor closely |
| Corporate + APAC | 0.038 | < 0.040 | Pass (marginal) | Monitor |

### 2.4 Overall Calibration

| Metric | Value | Target | Status |
|---|---|---|---|
| Overall ECE (Brier score) | 2.1% (0.019) | < 4% | Pass |
| Overconfidence incidents (30 days) | 0 | 0 | Pass |
| Under-triangulation flags | 1.2% of screenings | < 5% | Pass |
| Calibration collapse events (30 days) | 0 | 0 | Pass |

---

## 3. Known Bias Issues and Mitigation

### 3.1 Historical Enforcement Bias

| Field | Detail |
|---|---|
| Issue | Sanctions lists reflect historical enforcement patterns. Some nationalities are more represented in sanctions lists than their actual risk would justify, due to geopolitical factors. |
| Evidence | FATF typology reports acknowledge this — enforcement varies significantly by resource availability of national regulators |
| Mitigation | Typology-based detection is the primary signal. List match is corroborating evidence only, not determinative. SCOPE_DECLARATION always declares the basis of every finding. |
| Residual risk | Low — mode architecture prevents list match alone from producing a high-confidence MATCH verdict without typology corroboration |

### 3.2 Data Availability Bias

| Field | Detail |
|---|---|
| Issue | EU and US entities have significantly more adverse media coverage than entities from emerging markets. Entities from low-coverage jurisdictions receive lower confidence scores even when risk may be equal. |
| Evidence | NewsAPI coverage analysis: EU/US entities have on average 4.2x more indexed articles than comparable MENA entities; 8.1x vs Asia-Pacific |
| Mitigation | Conservative confidence thresholds for low-coverage jurisdictions. SCOPE_DECLARATION explicitly notes when adverse media coverage is sparse. MLRO escalation recommended for high-value customers from low-coverage jurisdictions. |
| Action item | Expand RSS + OSINT sources for Arabic-language and Chinese-language media (planned Phase 3) |

### 3.3 Entity-Type Bias in Training Data

| Field | Detail |
|---|---|
| Issue | FATF typology reports historically focused on corporate structures. Individual PEPs and non-corporate arrangements are less represented. |
| Mitigation | Extended PEP database (OpenSanctions family + close associate mapping). Behavioral signal detection modes supplement typology modes for individuals. |
| Residual risk | Moderate — vessel/aircraft screening has the highest precision gap; maritime typology modes being enhanced |

### 3.4 Language and Script Bias

| Field | Detail |
|---|---|
| Issue | System processes primarily English-language adverse media. Arabic-script names subject to transliteration variability. |
| Mitigation | Double-Metaphone transliteration + Jaro-Winkler fuzzy matching. Confidence thresholds calibrated to account for transliteration uncertainty. |
| Action item | Arabic and CJK normalisation (Phase 3 integration) |

---

## 4. Testing Schedule and Ownership

| Test | Frequency | Owner | Tool / Method | Pass Criteria |
|---|---|---|---|---|
| Disaggregated precision by entity type | Daily | Data Science | Production telemetry + `GET /api/mlro/brier` + `GET /api/mlro/mode-performance` | Precision delta < 3% by group |
| False positive rate by jurisdiction | Daily | Data Science | Production telemetry | FP delta < 2% by group |
| Calibration audit (overall ECE) | Hourly | Automated | `src/brain/drift-alerts.ts` + `GET /api/mlro/drift-alerts` | ECE < 4% |
| Comprehensive bias audit | Quarterly | Compliance + Data Science | Full subgroup analysis | ECE < 0.04 per subgroup |
| Red-team evader simulation | Monthly | Data Science | `src/brain/evader-simulator.ts` | Detection rate ≥ 97% |
| Synthetic case stress-test | Monthly | Data Science | `src/brain/stress-test-runner.ts` (1,000+ cases) | Detection rate ≥ 97% |
| Fairness impact assessment | Annually | Governance Board | Full review of all bias findings | Document and remediate any new biases |

---

## 5. Audit Trail for Testing Results

All testing results are immutably logged:

- Daily calibration: `GET /api/mlro/brier` — hourly updated
- Mode leaderboard: `GET /api/mlro/mode-performance` — sortable per-mode ranking
- Drift anomaly alerts: `GET /api/mlro/drift-alerts` + `src/brain/drift-alerts.ts` — continuous
- Audit chain integrity: `GET /api/audit/verify` + `netlify/functions/audit-chain-probe.mts` — hourly HMAC-sealed log
- Monthly stress test results: stored in Netlify Blobs with timestamp and SHA-256 hash

---

**Prepared by:** [Data Science Lead]
**Approved by:** [MLRO]
**Last Updated:** 2026-05-06
**Next Quarterly Review:** 2026-08-01
