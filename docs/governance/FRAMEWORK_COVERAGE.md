# Framework Coverage Matrix — Traceability Register

**Document ID:** HS-GOV-005  
**Version:** 1.0.0  
**Effective Date:** 2026-06-10  
**Review Cycle:** Semi-annual; updated on any control addition/removal or framework revision  
**Owner:** MLRO (compliance frameworks); Engineering Lead (cybersecurity frameworks)  
**Classification:** Restricted — Internal Compliance Use Only

---

## Purpose

Single point of traceability from five externally recognised framework checklists to their Hawkeye Sterling implementations. Auditors and operators should answer "is X integrated?" from this document without a codebase search. Statuses: **COVERED** (implemented with evidence), **PARTIAL** (implemented with a registered gap), **N/A** (not applicable, justification recorded).

Frameworks mapped:

1. ISO/IEC 42001:2023 mandatory documented information (33 core + 2026-focus additions)
2. AML alert typologies / red flags (13 standard categories)
3. GRC KPIs & KRIs (12 domains)
4. Cybersecurity KPIs & KRIs (12 categories)
5. CBUAE AI Guidance Note — 9 obligations for licensed financial institutions (with EU AI Act convergence)

---

## 1. ISO/IEC 42001:2023 Mandatory Documents

Authoritative mapping lives in the Statement of Applicability (`docs/governance/STATEMENT_OF_APPLICABILITY.md`, HS-SOA-001). Summary:

| # | Document type | Status | Primary evidence |
|---|---|---|---|
| 1 | AIMS scope | COVERED | `docs/governance/AI_GOVERNANCE_POLICY.md` §2; `docs/governance/AI_INVENTORY.md` §1.1 |
| 2 | Interested parties & requirements | COVERED | `docs/governance/STAKEHOLDER_FEEDBACK_LOG.md`; policy §6.4 |
| 3 | AI system inventory | COVERED | `docs/governance/AI_INVENTORY.md` (HS-001…HS-005) |
| 4 | AI context & applicability | COVERED | `docs/data-governance/DATA_LINEAGE.md` §2.0 |
| 5 | AI policy | COVERED | `docs/governance/AI_GOVERNANCE_POLICY.md` (HS-GOV-001) |
| 6 | Roles & responsibilities | COVERED | Policy §6 (RACI); `AI_INVENTORY.md` §7 |
| 7 | Risk assessment methodology | COVERED | Policy §3 |
| 8 | AI risk register | COVERED | `docs/governance/AI_RISK_REGISTER.md` (HS-RISK-001, created 2026-06-10) |
| 9 | AI objectives & plans | COVERED | Policy §1.3 (OBJ-001…010); per-system objectives in inventory |
| 10 | Statement of Applicability | COVERED | `docs/governance/STATEMENT_OF_APPLICABILITY.md` (HS-SOA-001) |
| 11 | Competency & awareness records | COVERED | `AI_INVENTORY.md` §7 |
| 12 | Communication procedures | COVERED | Policy §6.5 |
| 13 | Document control | COVERED | Policy §11; per-document control blocks |
| 14 | AI lifecycle management | COVERED | Policy §5 (incl. §5.6 decommissioning, added 2026-06-10); `docs/operations/CHANGE_CONTROL_LOG.md` |
| 15 | Human oversight mechanism | COVERED | `web/lib/server/four-eyes-gate.ts`; "AI proposes; MLRO decides" (policy §1.1) |
| 16 | Incident management | COVERED | `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` (HS-OPS-001) |
| 17 | Change management | COVERED | Policy §5; `CHANGE_CONTROL_LOG.md` |
| 18 | Monitoring & validation records | COVERED | `web/lib/server/drift-monitor.ts`, `bias-monitor.ts`; weekly committee review |
| 19 | Internal audit protocols | COVERED | `docs/operations/AUDIT_PREP_CHECKLIST.md` §0 |
| 20 | Management review records | COVERED | `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` |
| 21 | KPI / monitoring metrics | COVERED | Policy §4; `src/brain/dpms-kpis.ts` (30 KPIs); `src/brain/kri-registry.ts` (19 KRIs) |
| 22 | Nonconformity & corrective action | COVERED | `COMPLIANCE_GAPS.md` (HS-CAPA-001) |
| 23 | Continual improvement | COVERED | Committee §5.1 register; CAPA improvement initiatives |
| 24 | AI impact assessment | COVERED | `docs/GDPR.md` (DPIA); model cards |
| 25 | Data governance records | COVERED | `docs/data-governance/DATA_LINEAGE.md` (HS-DG-001) |
| 26 | Model governance records | COVERED | `docs/model-cards/hs-00*.md`; `MODEL_REGISTRY` |
| 27 | Third-party management | COVERED | `docs/operations/THIRD_PARTY_MANAGEMENT.md` (HS-OPS-003); `src/brain/vendor-register.ts` |
| 28 | Cybersecurity integration | COVERED | CI security gates; `docs/SECURITY-NOTES.md`; `docs/INHERITED-CONTROLS.md` |
| 29 | Legal & regulatory compliance | COVERED | Policy §1.2; `AUDIT_PREP_CHECKLIST.md` regulatory runbook |
| 30 | Stakeholder feedback | COVERED | `docs/governance/STAKEHOLDER_FEEDBACK_LOG.md` (HS-GOV-004) |
| 31 | Bias & fairness assessment | COVERED | `docs/testing/FAIRNESS_TESTING_RESULTS.md`; `bias-monitor.ts` |
| 32 | Explainability & transparency | COVERED | Model cards; reasoning-chain persistence; prompt-hash CI gate |
| 33 | Business continuity & resilience | PARTIAL | `docs/INCIDENT-RECOVERY.md`, `docs/RELIABILITY-REPORT.md`, `docs/SLA.md`; WORM S3 path built, not activated — operator-accepted CG-6 (AIR-012) |
| 34+ | 2026 focus: AI ethics; GenAI risk & content; AI security & adversarial; DPIA; prompt security & LLM risk | COVERED | Policy §2.4, §5.5; `adversarial-probes.ts`; `hallucination-gate.ts`; `docs/GDPR.md`; prompt-hash manifest |

**Open item:** #33 stays PARTIAL until the operator either activates the WORM S3 archive (`S3_BACKUP_*` env vars) or re-confirms the CG-6 acceptance at annual certification.

---

## 2. AML Alert Typologies (13 categories)

All thirteen categories are implemented. Detection logic is declarative and explainable: red flags bind to reasoning modes and typology IDs.

| # | Typology | Status | Primary evidence |
|---|---|---|---|
| 1 | Unusual transaction activity | COVERED | `src/brain/tm-rules.ts` (`tm_velocity_spike_7d`, `tm_pattern_dormant_reactivation`); `red-flags.ts` (`rf_pattern_change`, `rf_unexpected_velocity`) |
| 2 | High-risk jurisdiction | COVERED | `tm_geo_high_risk_nexus`; `rf_high_risk_jurisdiction`, `rf_sanctioned_ip`; jurisdiction matrix in screening |
| 3 | Transaction monitoring (layering, round-tripping) | COVERED | `tm_pattern_pass_through_same_day`, `tm_pattern_round_amounts`; `rf_tbml_round_trip`, `rf_loan_back_scheme` |
| 4 | Ownership structure / UBO | COVERED | `src/brain/bo-graph-builder.ts`; `rf_complex_ownership`, `rf_ubo_chain_break`, `rf_25_pct_avoidance`; eval `ubo-001…010` |
| 5 | Sanctions screening matches | COVERED | `web/app/api/screening/run`; `rf_close_match`, `rf_50_pct_aggregation`; eval `sa-001…015` |
| 6 | Structuring / smurfing | COVERED | `src/brain/smurfing-detector.ts` (threshold configurable via `DetectOptions.thresholdAed`, default AED 55,000); `fiu_dpms_01`; eval `tx-002`, `tx-006` |
| 7 | Third-party payments | COVERED | `rf_third_party_funding`, `rf_third_party_payment`; eval `tx-004`, `tx-011`, `tx-012` (latter two added 2026-06-10) |
| 8 | PEP alerts | COVERED | `src/brain/pep-classifier.ts` (18 rules, RCA/family detection); screening PEP corpus; eval `tx-010`, `ubo-008/009` |
| 9 | Adverse media | COVERED | `src/brain/adverse-media*.ts` (multilingual NLP); `adverse-media-scorer.ts`; `rf_arrest_article` |
| 10 | Source of funds | COVERED | `rf_disproportionate_wealth`, `rf_undocumented_wealth`, `rf_unverifiable_sof`; eval `tx-003` |
| 11 | Cash activity | COVERED | `tm_cash_single_above_dpms`, `tm_cash_linked_above_dpms`; `rf_cash_above_threshold`; eval `tx-001`, `tx-007` |
| 12 | Customer behaviour red flags | COVERED | `rf_incomplete_kyc`, `rf_unusual_purpose`, `rfx_cb_*` extended flags; eval `tx-013`, `tx-014` (added 2026-06-10) |
| 13 | Unusual business activity | COVERED | `rf_pattern_change`, `rf_offshore_concentration`; DPMS typologies (`refining_margin_abuse`, `free_zone_re_export_structuring`) |

### Detection enhancement backlog (registered, not gaps)

| ID | Enhancement | Target |
|---|---|---|
| EN-001 | Per-customer-segment anomaly baselines for typology #1 (beyond global velocity thresholds) | Backlog — Q4 2026 |
| EN-002 | Carousel-fraud multi-hop pattern matching for TBML (#3) | Backlog — Q4 2026 |
| EN-003 | Nominee-director network clustering across entities (#4) | Backlog — Q4 2026 |
| EN-004 | Automated source-of-funds adequacy scoring (#10) | Backlog — Q4 2026 |

---

## 3. GRC KPIs & KRIs (12 domains)

KRI machinery: `src/brain/kri-registry.ts` (19 KRIs) + `src/brain/risk-appetite.ts` (25 appetite dimensions) + live computation on `/api/kri-dashboard`. KPI machinery: `src/brain/dpms-kpis.ts` (30 KPIs) + `/api/kpi-metrics`, `/api/board-dashboard`.

| # | Domain | Status | Primary evidence |
|---|---|---|---|
| 1 | Governance oversight | COVERED | Board MI cadence (`dpms_kpi_25`); `/api/board-dashboard`; committee meeting register |
| 2 | Regulatory change | COVERED | Obligations register (`src/brain/regulatory-obligations.ts`) + `kri_regulatory_obligation_overdue` (added 2026-06-10); regulatory anchors on all 30 KPIs |
| 3 | Enterprise risk | COVERED | Risk-appetite registry; KRI dashboard amber/red = appetite breach; `AI_RISK_REGISTER.md` |
| 4 | AI governance | COVERED | `MODEL_REGISTRY` + attestation status; drift/bias monitors; `/api/ai-governance/*` |
| 5 | Cyber resilience | COVERED | `docs/INCIDENT-RECOVERY.md` (RTO/RPO); quarterly DR test (`ob_dr_test`) |
| 6 | Third-party risk | COVERED | Vendor register + `kri_vendor_concentration` (added 2026-06-10); HS-OPS-003 annual review |
| 7 | Operational resilience | COVERED | `docs/RELIABILITY-REPORT.md` (SPOF analysis); `docs/SLA.md` |
| 8 | Control effectiveness | PARTIAL | Calibration harness + CI gates; `kri_repeat_control_failures` registered — control-test result feed pending (see Feed-pending KRIs below) |
| 9 | Data governance | COVERED | `DATA_LINEAGE.md` quality gates; `dpms_kpi_29/30`; `/api/sanctions/status` |
| 10 | Privacy & ethics | PARTIAL | GDPR/PDPL routes + policy §2.4; `kri_privacy_request_overdue` registered — intake-log feed pending |
| 11 | Continuous assurance | COVERED | `docs/OBSERVABILITY-STANDARDS.md`; `/api/status` health monitoring; `AUDIT_PREP_CHECKLIST.md` |
| 12 | Executive reporting | COVERED | `/api/kri-dashboard` (green/amber/red + summary); `/api/board-dashboard` |

### Feed-pending KRIs

Three KRIs are registered with bands and appetite bindings but render an explicit `no_data` state until their operator feed exists (house pattern — never fake zeros):

| KRI | Pending feed | Owner |
|---|---|---|
| `kri_privacy_request_overdue` | Privacy-request intake log (request + completion timestamps) | Compliance Officer |
| `kri_training_completion` | Training tracker (per-role completion against `AI_INVENTORY.md` §7) | Compliance Officer |
| `kri_repeat_control_failures` | Control-test result log (calibration/CI outcomes by control ID) | Engineering Lead |

---

## 4. Cybersecurity KPIs & KRIs (12 categories)

| # | Category | Status | Primary evidence |
|---|---|---|---|
| 1 | Identity security | COVERED | JWT HS256 dual-secret (`web/lib/server/jwt.ts`); RBAC; MFA attestation + quarterly access review (`docs/IDENTITY-ACCESS-ATTESTATION.md`, `ob_access_review`, added 2026-06-10) |
| 2 | External attack surface | INHERITED | Netlify-managed edge/WAF — `docs/INHERITED-CONTROLS.md` |
| 3 | Vulnerability management | COVERED | Semgrep + CodeQL + Trivy + npm audit + dependency review in CI (`.github/workflows/`) |
| 4 | Secure configuration | COVERED | CI governance gates (prompt-hash, mode versions, lethal-trifecta); `/api/status` config checks |
| 5 | Endpoint security | N/A | Serverless platform — no managed endpoints; justification in `INHERITED-CONTROLS.md` |
| 6 | Email & social engineering | N/A | Not an email platform; operator-side responsibility |
| 7 | Network security | INHERITED | Netlify segmentation + `web/middleware.ts` edge gating; egress allowlist (`docs/EGRESS-ALLOWLIST.md`) |
| 8 | Application & API security | COVERED | `enforce()` fail-closed auth; rate limiting; integration test suite; SAST gates |
| 9 | Cloud security | INHERITED | Netlify SOC 2 inheritance + API-key least-privilege tiers; `INHERITED-CONTROLS.md` |
| 10 | Data security | COVERED | PII redaction (`src/brain/redactor.ts`); data minimisation (Charter P3); retention policy |
| 11 | Detection & incident response | COVERED | Incident SLAs (Sev-1 15 min) in `docs/SLA.md`; audit-chain tamper detection; circuit breakers |
| 12 | Resilience & recovery | COVERED | Quarterly DR tests; nightly S3 audit-chain backup; RTO/RPO targets; annual pentest scheduled (`docs/PENTEST-LOG.md`) |

**INHERITED** = control operated by the platform provider; verified annually via `docs/INHERITED-CONTROLS.md` and the vendor review (`ob_vendor_annual_review`).

---

## 5. CBUAE AI Guidance Note — 9 Obligations for Licensed Financial Institutions

Mapping of the Central Bank of the UAE AI Guidance Note (2025) obligations to existing Hawkeye Sterling mechanisms. No new controls were created for this mapping — every obligation is discharged by mechanisms already operated under ISO 42001, FDL 10/2025, and the EU AI Act. The convergence column records the corresponding EU AI Act (Regulation (EU) 2024/1689) provision so a single self-assessment evidences both regimes. Annual self-assessment is tracked as `ob_cbuae_ai_guidance_selfassessment` in `src/brain/regulatory-obligations.ts`.

| # | Obligation | Status | Primary evidence | EU AI Act convergence |
|---|---|---|---|---|
| 1 | Governance & Accountability | COVERED | `AI_GOVERNANCE_POLICY.md` §6 (RACI, MLRO accountability); `MODEL_REGISTRY` approval records (`web/lib/server/ai-governance.ts`); annual certification §8 | Art. 16–17 (provider obligations, quality management) |
| 2 | Fairness & Non-Discrimination | COVERED | `web/lib/server/bias-monitor.ts` (9 name-script groups, ratio ≤ 1.15 internal / 1.5 FATF floor); AIR-002; `docs/testing/FAIRNESS_TESTING_RESULTS.md` | Art. 10 (data governance, bias mitigation) |
| 3 | Transparency & Explainability | COVERED | Charter P9 (opacity prohibition, `src/policy/systemPrompt.ts`); model cards `docs/model-cards/hs-00*.md`; reasoning-chain persistence; prompt-hash CI gate | Art. 13 (transparency to deployers) |
| 4 | Data Quality, Privacy & Security | COVERED | `docs/data-governance/DATA_LINEAGE.md` (validation checks, freshness SLAs); PII redaction pipeline (`web/lib/server/redact.ts`, `sanitize-prompt.ts`); PDPL controls (`docs/GDPR.md`) | Art. 10, Art. 15 (accuracy, robustness, cybersecurity) |
| 5 | Continuous Monitoring & Review | COVERED | `web/lib/server/drift-monitor.ts` (drift ≤ 0.15); `/api/kri-dashboard` (19 KRIs); weekly governance committee; quarterly model attestation | Art. 15, Art. 72 (post-market monitoring) |
| 6 | Human Oversight & Consumer Protection | PARTIAL | `web/lib/server/four-eyes-gate.ts` (TOCTOU-safe sign-off); "AI proposes; the MLRO decides" (policy §1.1); no autonomous disposition/filing/freeze. Gap: RBAC models human roles only — AI agent/service identities are not first-class principals; enhancement registered below | Art. 14 (human oversight) |
| 7 | Integration with Existing Frameworks | COVERED | `src/brain/regulatory-obligations.ts` (standing obligations register); `src/brain/policy-library.ts` (64 policies); ISO 42001 SoA (`STATEMENT_OF_APPLICABILITY.md`) | Art. 17 (integration with existing QMS) |
| 8 | Outsourcing & Third-Party Risk | COVERED | `src/brain/vendor-register.ts` (11 vendors, risk tiers, contingencies); `docs/operations/THIRD_PARTY_MANAGEMENT.md` (HS-OPS-003); annual review `ob_vendor_annual_review` | Art. 25 (third-party responsibilities along the value chain) |
| 9 | Ethical Collaboration & Innovation | COVERED | `AI_GOVERNANCE_POLICY.md` §2.4 (ethical principles per UNESCO Recommendation); `web/lib/server/adversarial-probes.ts` (24-probe red-team suite); HS-004 pilot governance (advisory-only, exit review Q3 2026) | Art. 95 (voluntary codes of conduct); innovation recitals |

**Open item:** #6 stays PARTIAL until AI agent/service identities (scheduled functions, API integrations) are modelled as distinct principals in RBAC (`web/lib/server/rbac.ts`) with their own permission sets and audit attribution, or the MLRO records a documented acceptance of the human-centric model at annual certification.

---

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-GOV-005 |
| Version | 1.1.0 |
| Created | 2026-06-10 |
| Last amended | 2026-06-11 — added §5 CBUAE AI Guidance Note mapping with EU AI Act convergence |
| Next mandatory review | 2026-12-10 |
| Approver (MLRO) | [Signature required] |
| Approver (Engineering Lead) | [Signature required] |
| Related documents | `docs/governance/STATEMENT_OF_APPLICABILITY.md`, `docs/governance/AI_RISK_REGISTER.md`, `docs/IDENTITY-ACCESS-ATTESTATION.md`, `docs/INHERITED-CONTROLS.md`, `docs/PENTEST-LOG.md`, `COMPLIANCE_GAPS.md` |
| Regulatory references | ISO/IEC 42001:2023; UAE FDL 10/2025; FATF Methodology; SOC2 TSC; CBUAE AI Guidance Note (2025); EU AI Act (Regulation (EU) 2024/1689) |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
