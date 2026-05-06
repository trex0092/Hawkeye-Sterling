# Test Procedures — Hawkeye Sterling AI Systems

| Field | Value |
|---|---|
| **Document Version** | v1.0.0 |
| **Status** | Active |
| **Owner** | Engineering (primary) / Data Science (analytics) / MLRO (oversight) |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-11-06 |
| **Regulatory Framework** | UAE FDL 10/2025; FATF R.15; UAE AI Governance Policy (internal) |

---

## 1. Purpose and Scope

This document defines the complete test programme for Hawkeye Sterling's AI/AI-assisted systems (HS-001 through HS-005). It specifies, for each test procedure: frequency, owner, tooling, pass criteria, and failure action. The test programme supports:

- Continuous quality assurance (CI/CD gating)
- Regulatory reporting obligations under UAE FDL 10/2025
- FATF Recommendation 15 — governance of AI systems in AML/CFT
- Pre-deployment verification and post-change regression

All test results are recorded in the audit chain and are available for regulatory inspection.

---

## 2. Test Procedure Index

| # | Procedure Name | Frequency | Owner | Pass Gate |
|---|---|---|---|---|
| TP-01 | Mode Regression Suite | Every PR | Engineering | CI gate |
| TP-02 | Sanctions List Validation | Every ingest | Engineering | Automated |
| TP-03 | Synthetic Case Stress-Test | Monthly | Data Science | Formal report |
| TP-04 | Red-Team Evader Simulation | Monthly | Data Science | Formal report |
| TP-05 | Fairness Audit | Quarterly | Data Science + MLRO | Formal report |
| TP-06 | Calibration Check | Daily | Data Science | Automated alert |

---

## 3. TP-01 — Mode Regression Suite

### 3.1 Overview

The mode regression suite verifies that all reasoning modes, charter enforcement functions, compliance-policy checks, and tipping-off guardrails continue to produce the expected outputs after any code change. It is the primary CI gate preventing regressions from reaching the main branch.

### 3.2 Frequency

**Every pull request** targeting `main` or any release branch. Run automatically by the CI pipeline (GitHub Actions). PRs cannot be merged if the regression suite fails.

### 3.3 Owner

Engineering (automated CI) — alert to Engineering on failure.

### 3.4 Tooling

- **Test framework**: [Vitest](https://vitest.dev/) (`vitest.config.ts` at repository root)
- **Test files**:
  - `src/brain/__tests__/compliance-modes.test.ts` — charter P1–P10 enforcement
  - `src/brain/__tests__/logic-modes.test.ts` — core logic and probabilistic modes
  - `src/brain/__tests__/integrity-modes.test.ts` — data integrity and corroboration
  - `src/brain/__tests__/meta-modes.test.ts` — introspection and calibration modes
  - `src/brain/__tests__/uae-advanced-modes.test.ts` — UAE-specific and DNFBP modes
  - `src/brain/__tests__/weaponize-modes.test.ts` — Wave 3 specialist modes
- **Run command**: `npm run test` (full suite) or `npx vitest --run` (CI)

### 3.5 Pass Criteria

| Criterion | Threshold | Notes |
|---|---|---|
| All test assertions pass | 100% | Zero tolerance for regression failures |
| Tipping-off guard — false negatives | 0 | Any HIGH-severity miss is a blocking failure |
| Charter P1–P10 enforcement | All tests pass | Any charter enforcement failure blocks merge |
| Introspection pass rate | ≥95% | Measured against the test corpus |
| Code coverage (reasoning modules) | ≥80% | `vitest --coverage` generates the report |

### 3.6 Failure Action

1. CI blocks the PR from merging immediately.
2. The PR author receives an automated notification with the test output.
3. If the failure is in a charter enforcement or tipping-off guard test, the Engineering Lead and MLRO are notified within 1 hour.
4. The failure is not cleared until the root cause is identified and fixed, and a new commit passes all tests.
5. If a tipping-off guard false negative is confirmed, a CHANGE_CONTROL_LOG entry is created immediately and the MLRO is notified under the Incident Response Playbook (SIRT-level: High).

---

## 4. TP-02 — Sanctions List Validation

### 4.1 Overview

Every ingestion of a watchlist (UN, OFAC, EU, UK, UAE EOCN, UAE Local Terrorist, OpenSanctions PEP) must be validated before the new list version is activated for live screening. This procedure ensures that ingested data is structurally valid, tamper-evidenced, and consistent with the prior version before it goes live.

### 4.2 Frequency

**Every ingest event** — triggered automatically on each scheduled and ad-hoc list download. Ingest schedule: UN/OFAC/EU/UK daily; UAE EOCN/Local Terrorist daily; OpenSanctions PEP weekly.

### 4.3 Owner

Engineering (automated) — alert to Engineering + MLRO on failure.

### 4.4 Tooling

- **Adapter validation**: `watchlist-adapters.ts` — `validate()` function per adapter
- **Schema validation**: Each adapter validates required fields (`listId`, `sourceRef`, `primaryName`, `entityType`, `ingestedAt`, `rawHash`)
- **Tamper evidence**: SHA-256 / FNV hash of raw record stored in `rawHash`; mismatches trigger `TAMPER_DETECTED` alert
- **Delta analysis**: `sanction-delta.ts` — computes additions, removals, and modifications since the last successful ingest
- **Staleness check**: If list has not refreshed within the configured window (24 hours for daily lists; 7 days for weekly), a `STALE_DATA` gap flag is raised

### 4.5 Pass Criteria

| Criterion | Threshold | Notes |
|---|---|---|
| Schema validation | 100% of entries pass | Any entry failing validation is quarantined; list is not activated |
| rawHash integrity | 100% match | Any hash mismatch triggers `TAMPER_DETECTED` and halts activation |
| Required field completeness | 100% | `listId`, `sourceRef`, `primaryName`, `entityType`, `ingestedAt`, `rawHash` all present |
| Delta within expected bounds | Additions/removals <10% of list size per ingest | Outlier deltas trigger manual Engineering + MLRO review before activation |
| Download integrity (TLS, source URL) | Source URL matches `authoritativeUrlEnvKey` | Non-authoritative source triggers automatic rejection |

### 4.6 Failure Action

1. Failed ingest is quarantined; the previous validated list version remains active.
2. Engineering is notified immediately via automated alert.
3. If the failure is a `TAMPER_DETECTED` event, MLRO is notified within 15 minutes and the Incident Response Playbook (SIRT-level: Critical) is triggered.
4. If a daily list has not refreshed successfully within 24 hours, a `STALE_DATA` coverage-gap flag is propagated to all active screening runs and MLRO is notified.
5. Engineering resolves the ingest failure and runs a manual re-ingest, which triggers a new TP-02 validation cycle.

---

## 5. TP-03 — Synthetic Case Stress-Test

### 5.1 Overview

The synthetic case stress-test generates a large volume of borderline, adversarial, and edge-case subject-candidate pairs and evaluates the screening pipeline's outputs against a set of explicit expectations. It is the primary tool for detecting unexpected behavioural regressions and surfacing which modes or pipelines produce surprising outputs.

### 5.2 Frequency

**Monthly** — run on the first Monday of each month. Additionally run before any major version release. Results are reviewed in the monthly Data Science / MLRO operations meeting.

### 5.3 Owner

Data Science (run and analysis) — results reviewed by MLRO.

### 5.4 Tooling

- **Stress-test runner**: `src/brain/stress-test-runner.ts`
- **Run command**: `npm run brain:stress-test`
- **Minimum case count**: 1,000 cases per monthly run
- **Case generators** (current):
  - `sanctions_partial_match` — names one character off a known designation
  - `cross_script_alias` — same subject in Latin / Arabic / Cyrillic
  - `training_data_evidence` — claims with ONLY training_data citations (P8 cap test)
  - `unanimous_designation` — every regime designates → must escalate
  - `split_regime` — UN designates; OFAC clean (conflict case)
  - `pep_no_role_text` — name without a role string supplied
  - `high_amount_burst` — 5 transactions just under threshold in 60 seconds
  - `opaque_ubo_chain` — 5 layers of nominee + bearer shares
- **Output**: `StressReport` — total cases, assertions, pass/fail counts, failure details

### 5.5 Pass Criteria

| Criterion | Threshold | Notes |
|---|---|---|
| Overall assertion pass rate | ≥99% | ≥990 of 1,000 assertions pass |
| Charter P8 cap (training-data citations) | 100% — corroboration capped at 0.3 | Hard requirement |
| ESCALATE on unanimous designation | 100% | Any miss is a critical failure |
| Split-regime conflict surface rate | 100% | Conflict must be surfaced as a `FindingConflict` |
| No regression vs. prior month | Zero new failure categories | New failure categories trigger a CHANGE_CONTROL_LOG entry |
| Stub-mode coverage | Documented — no silent expansion | Stub count must not increase without a CCL entry |

### 5.6 Failure Action

1. Data Science prepares a failure analysis report within 2 business days of the test run.
2. Any new failure category is documented in the CHANGE_CONTROL_LOG.
3. Critical failures (P8 cap, unanimous-designation miss) trigger immediate Engineering fix and a re-run before the next business day.
4. MLRO reviews the failure analysis report and signs off that no live screening quality is impaired.
5. If live screening quality is confirmed to be impaired, the Incident Response Playbook is triggered.

---

## 6. TP-04 — Red-Team Evader Simulation

### 6.1 Overview

The evader simulator models the AML/sanctions screening system as a game between the system (defender) and an adversarial evader (attacker). It evaluates which evasion strategies are most effective against the current mode configuration, ranks strategies by expected utility to the evader, and surfaces the defender's weakest points. This is a proactive threat-modelling exercise.

### 6.2 Frequency

**Monthly** — run on the same schedule as TP-03 (first Monday of each month). Results reviewed alongside TP-03 in the monthly operations meeting.

### 6.3 Owner

Data Science (run and analysis) — results reviewed by MLRO. Engineering reviews the defender recommendations.

### 6.4 Tooling

- **Evader simulator**: `src/brain/evader-simulator.ts`
- **Evasion strategies modelled**:
  - `structuring` — splits below threshold
  - `jurisdictional_layering` — route through low-risk jurisdictions
  - `nominee_directors` — opacity in UBO chain
  - `timing_dispersion` — spread transactions over time
  - `channel_mixing` — bank + crypto + cash
  - `nominal_substitution` — different name spelling on documents
  - `phantom_employment` — fake role string to defeat PEP classifier
- **Output**: `StrategyEvaluation[]` — per-strategy P(undetected), evader cost, expected utility, rationale, and defender recommendation

### 6.5 Pass Criteria

| Criterion | Threshold | Notes |
|---|---|---|
| P(undetected) for any strategy | ≤0.20 (production target) | Strategies with P(undetected) >0.20 trigger a defender-recommendation engineering ticket |
| Maximum expected utility to evader | ≤0.10 | High-utility strategies represent highest-priority gaps |
| Structuring detection P(undetected) | ≤0.15 | Structuring is the highest-frequency evasion tactic |
| UBO chain opacity P(undetected) | ≤0.15 | UBO disclosure is a primary FATF R.24/25 obligation |
| Month-over-month improvement | P(undetected) non-increasing for any strategy | Any regression vs. prior month triggers review |

### 6.6 Failure Action

1. Strategies with P(undetected) >0.20 are assigned an Engineering ticket with the defender recommendation from the simulator output.
2. The ticket is prioritised in the next sprint and a CHANGE_CONTROL_LOG entry is created when the fix is deployed.
3. MLRO reviews the evader report and documents any residual risk acceptance for strategies that cannot be mitigated in the current quarter.
4. If a strategy P(undetected) exceeds 0.35, the MLRO is notified as a priority risk and the risk is escalated to the CRO.

---

## 7. TP-05 — Fairness Audit

### 7.1 Overview

The quarterly fairness audit produces a full disaggregated performance report across all four fairness axes (entity type, jurisdiction, complexity, data availability) for all five Hawkeye Sterling systems. Results are recorded in `docs/testing/FAIRNESS_TESTING_RESULTS.md`. Threshold breaches are tracked in the bias-audit register.

### 7.2 Frequency

**Quarterly** — Q1 (January), Q2 (April), Q3 (July), Q4 (October). The full-year audit for Q4 also covers the annual AI governance review.

### 7.3 Owner

Data Science (analysis) + MLRO (sign-off) + Legal (Q4 review only).

### 7.4 Tooling

- **Fairness metrics**: Demographic parity gap, equalized odds gap, ECE — computed using the labelled test corpus (maintained by Data Science)
- **Calibration**: `GET /api/mlro/brier` — Brier scores per mode per group
- **Corpus management**: Data Science maintains a minimum 12,000 labelled subject-candidate pairs, updated quarterly
- **Output**: Updated `docs/testing/FAIRNESS_TESTING_RESULTS.md` with results table, bias register entries, and mitigation status

### 7.5 Pass Criteria

| Metric | Threshold | Action on Breach |
|---|---|---|
| Demographic parity gap | < 3% for all group pairs | Bias review + mitigation plan within 5 business days |
| Equalized odds gap | < 2% for all group pairs | Bias review + mitigation plan within 5 business days |
| ECE per group | < 0.04 | Calibration review + recalibration plan within 5 business days |
| Known breach mitigation progress | On-track for committed quarter | MLRO escalation if delayed |

### 7.6 Failure Action

1. Any threshold breach is logged in the bias-audit register in `FAIRNESS_TESTING_RESULTS.md`.
2. Data Science produces a root-cause analysis within 5 business days.
3. An engineering mitigation ticket is created with a committed delivery quarter.
4. MLRO signs off the updated FAIRNESS_TESTING_RESULTS.md after each quarterly audit.
5. Persistent breaches (not remediated within 2 quarters) are escalated to the Board Risk Committee.

---

## 8. TP-06 — Calibration Check

### 8.1 Overview

The daily calibration check monitors the Brier score of each active reasoning mode and the aggregate system-level Brier score. It detects calibration drift — the divergence between the system's expressed confidence and its empirical accuracy — before it becomes a material risk to screening quality.

### 8.2 Frequency

**Daily** — automated, runs at 06:00 UAE time. Results are visible on the MLRO calibration dashboard (`/docs/calibration.html`).

### 8.3 Owner

Data Science (automated monitoring) — alert to Data Science + MLRO on breach.

### 8.4 Tooling

- **Calibration endpoint**: `GET /api/mlro/brier`
- **Calibration ledger**: `src/brain/mlro-calibration.ts` — `CalibrationLedger` tracks every predicted verdict + ground-truth outcome
- **Output fields**: `brierScore`, `logScore`, `hitRate`, `byMode` (per-mode Brier), `drift.warning`
- **Minimum sample size for reliable Brier**: ≥30 labelled samples per mode; modes below this threshold are in "warm-up" and excluded from breach alerts

### 8.5 Pass Criteria

| Metric | Threshold | Notes |
|---|---|---|
| Aggregate Brier score (30-day rolling) | ≤0.08 | Alert if breached |
| Per-mode Brier score (7-day rolling) | ≤0.15 | Alert + Data Science review ticket if breached for 7 consecutive days |
| Drift warning flag | False | `drift.warning = true` (|delta| >0.15) triggers Data Science review |
| hitRate (30-day) | ≥0.75 | Alert if below threshold |

### 8.6 Failure Action

1. Automated alert is sent to Data Science and MLRO dashboard flagged.
2. Data Science reviews the mode-level breakdown from `GET /api/mlro/brier` within 1 business day.
3. If the per-mode Brier breach persists for 7 consecutive days, an Engineering review ticket is created.
4. If the aggregate Brier breaches 0.12 (critical threshold), the MLRO is notified immediately and the mode is flagged in all active screening runs pending recalibration.
5. Recalibration requires a new labelled sample batch and a CHANGE_CONTROL_LOG entry.

---

## 9. Test Environment Requirements

| Environment | Purpose | Data |
|---|---|---|
| **Development** | Unit and integration tests | Synthetic data only — no live PII |
| **Staging** | Pre-release regression and stress-test | Anonymised production-derived test corpus |
| **Production** | Live screening + daily calibration monitoring | Live production data; access controlled |

All test environments maintain environment-variable separation for API keys and watchlist URLs. The `.env.example` at the repository root documents all required variables.

---

## 10. Audit Trail for Test Results

All test runs produce machine-readable output that is stored in the audit chain:

- Mode regression suite: vitest JSON report, stored per-run
- Sanctions list validation: ingest validation log, HMAC-signed, stored per-ingest
- Stress-test: `StressReport` JSON, stored per-run
- Evader simulation: `StrategyEvaluation[]` JSON, stored per-run
- Fairness audit: Updated `FAIRNESS_TESTING_RESULTS.md` with MLRO signature, quarterly
- Calibration check: `CalibrationReport` JSON, stored daily via `GET /api/mlro/brier`

All stored test results are available for export via `GET /api/compliance/soc2-export` and are included in the regulator audit package (see `AUDIT_PREP_CHECKLIST.md`).

---

## 11. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **Engineering Lead** | [Engineering Lead Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |

---

*Document ID: TP-v1.0.0 | Classification: Internal — Regulatory*
