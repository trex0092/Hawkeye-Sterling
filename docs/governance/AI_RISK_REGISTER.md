# AI Risk Register — ISO/IEC 42001:2023 Annex A.7.3

**Document ID:** HS-RISK-001  
**Version:** 1.0.0  
**Effective Date:** 2026-06-10  
**Review Cycle:** Quarterly, at the governance committee meeting following each internal AIMS audit; ad-hoc on any CRITICAL/HIGH incident  
**Owner:** MLRO  
**Classification:** Restricted — Internal Compliance Use Only  
**ISO 42001 Reference:** Annex A.7.3 (AI risk register); Clause 6.1 (actions to address risks); Clause 8.2 (AI risk assessment)

---

## Purpose

This is the unified AI risk register for the Hawkeye Sterling AI Management System (AIMS). It consolidates, in one ISO/IEC 42001:2023 Annex A.7.3 register, the AI risks previously tracked across the CAPA register (`COMPLIANCE_GAPS.md`) and the Data Quality Risk Register (`docs/data-governance/DATA_LINEAGE.md` §7). Its creation closes the A.7.3 "Partial" status recorded in the Statement of Applicability (HS-SOA-001) ahead of the Q3 2026 target.

**Methodology:** Risks are assessed using the four-tier classification of the AI Governance Policy (HS-GOV-001 §3): likelihood and impact are rated LOW / MEDIUM / HIGH / CRITICAL; the inherent rating is the conservative combination of the two; the residual rating reflects implemented controls. Treatment is one of MITIGATE, ACCEPT (operator decision on file), or TRANSFER.

## Subsidiary Registers

This register is the apex record. Detailed line items continue to live in the subsidiary registers and are elevated here when their residual rating is MEDIUM or above:

| Register | Location | Scope |
|---|---|---|
| CAPA / nonconformity register | `COMPLIANCE_GAPS.md` (HS-CAPA-001) | Closed nonconformities and corrective actions with effectiveness evidence |
| Data Quality Risk Register | `docs/data-governance/DATA_LINEAGE.md` §7 | Per-source data quality risks DQR-001…DQR-009 |
| Vendor register | `docs/operations/THIRD_PARTY_MANAGEMENT.md` (HS-OPS-003); `src/brain/vendor-register.ts` | Third-party supply-chain risk |
| Model registry | `web/lib/server/ai-governance.ts` `MODEL_REGISTRY` | Per-model risk tier, approval, attestation status |

---

## Risk Register

| ID | Risk | Category | Anchor | Likelihood | Impact | Inherent | Treatment | Key Controls / Evidence | Residual | Owner | Next Review |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AIR-001 | Model drift degrades screening accuracy below acceptable thresholds | Model performance | ISO A.10.3; FATF R.15 | MEDIUM | HIGH | HIGH | MITIGATE | `web/lib/server/drift-monitor.ts` (verdict/confidence/risk-score drift); appetite `model_drift_score` ≤ 0.15; rollback at 0.20 within 7 days (HS-GOV-001 §5.3); weekly governance review of `/api/mlro/drift-alerts` | LOW-MEDIUM | Data Science Lead | 2026-09-10 |
| AIR-002 | Discriminatory screening outcomes across name scripts or nationalities | Fairness | FATF R.10; FDL 10/2025 Art.18 | MEDIUM | HIGH | HIGH | MITIGATE | `web/lib/server/bias-monitor.ts` (9 name-script groups); internal ratio 1.15 with MLRO acknowledgement (CG-BIAS-001); `FATF_BIAS_RATIO_FLOOR = 1.5` hard-enforced; quarterly disaggregated fairness audit (`docs/testing/FAIRNESS_TESTING_RESULTS.md`) | LOW-MEDIUM | MLRO | 2026-09-04 |
| AIR-003 | LLM hallucination enters a regulatory narrative (STR/SAR/goAML) | Generative AI | FDL 10/2025 Art.18; Charter P2 | MEDIUM | CRITICAL | CRITICAL | MITIGATE | Four-gate output validation: charter redlines, tipping-off guard, hallucination gate (`web/lib/server/hallucination-gate.ts`, fire-and-forget), egress check; mandatory MLRO review + four-eyes on all filings | LOW | MLRO | 2026-09-10 |
| AIR-004 | Prompt injection manipulates AI output or exfiltrates context | AI security | ISO A.6.2.6; MITRE ATLAS | MEDIUM | HIGH | HIGH | MITIGATE | `web/lib/server/sanitize-prompt.ts`; adversarial probe suite (`web/lib/server/adversarial-probes.ts`); prompt-hash CI gate (`scripts/validate-prompt-hashes.mjs`); egress gate fail-closed | LOW | Engineering Lead | 2026-09-10 |
| AIR-005 | LLM provider outage or behavioural change (Anthropic dependency) | Supply chain | ISO Clause 8.4 | MEDIUM | MEDIUM | MEDIUM | MITIGATE | Groq fallback via `src/integrations/model-router.ts`; deterministic rule-based degradation; model version pinning in `MODEL_REGISTRY`; vendor V-011 SLA monitoring | LOW | Engineering Lead | 2026-09-10 |
| AIR-006 | Model attestation lapses without detection (governance drift) | Governance | FDL 10/2025 Art.18 | LOW | MEDIUM | MEDIUM | MITIGATE | `getOverdueModels()` drives `/api/ai-governance/risk-register` health signal; counted in `kri_regulatory_obligation_overdue` (zero-tolerance appetite); quarterly attestation cadence | LOW | MLRO | 2026-09-10 |
| AIR-007 | Auto-dispositioner (HS-004, PILOT) proposes an incorrect disposition | Model performance | FDL 10/2025 Art.18 | MEDIUM | HIGH | HIGH | MITIGATE | PILOT constraints in model card `docs/model-cards/hs-004-mlro-dispositioner.md`; `applyConfidenceGate()` escalates ≤ 65% confidence; advisory-only — MLRO disposition mandatory; pilot exit review CCL-2026-016 | MEDIUM (pilot) | MLRO | Pilot exit (Q3 2026) |
| AIR-008 | Stale sanctions data causes a missed designation | Data | CR 74/2020 Art.4; Charter P8 | LOW-MEDIUM | CRITICAL | HIGH | MITIGATE | Daily refresh with per-list SLA alerts (`/api/sanctions/status`); seed-corpus fallback; DQR-009 publication-lag monitoring; 3×/day re-screen floor (`isScreenDueWithFloor()`, CG-3) | MEDIUM | Engineering Lead | 2026-08-06 |
| AIR-009 | UAE EOCN PDF transcription error (elevation of DQR-001) | Data | CR 74/2020 | MEDIUM | HIGH | HIGH | MITIGATE | Dual review by Compliance Officer + Engineering Lead; Phase 2 XML/structured parser prioritised; stakeholder feedback FB-2026 entry on file | MEDIUM | Engineering Lead | 2026-08-06 |
| AIR-010 | PEP coverage gap — single-source dependency on OpenSanctions (elevation of DQR-004) | Data / supply chain | FATF R.12 | MEDIUM | HIGH | HIGH | MITIGATE | Manual supplementation for high-risk cases; quarterly coverage audit; `kri_vendor_concentration` watches `pep_data` single-provider status; regional-database integration on backlog (CCL-2026-018) | MEDIUM | Data Science Lead | 2026-08-06 |
| AIR-011 | Hosting/storage single-provider dependency (Netlify) | Supply chain | ISO Clause 8.4 | LOW | HIGH | MEDIUM | ACCEPT (with mitigations) | Documented SPOF-by-design (`docs/RELIABILITY-REPORT.md` §2); seed-corpus fallback; nightly S3 audit-chain backup; `kri_vendor_concentration` amber watch | MEDIUM | Engineering Lead | 2026-09-10 |
| AIR-012 | Audit-chain 10-year retention durability (local + Asana arrangement) | Records | FDL 10/2025 Art.24 | LOW | HIGH | MEDIUM | ACCEPT (operator decision 2026-06-04, CG-6) | HMAC-signed append-only chain; nightly S3 mirror; WORM/object-lock upgrade path ready (`netlify/functions/audit-chain-s3-backup.mts`, `S3_BACKUP_*` env vars) | MEDIUM | MLRO | 2026-09-10 |
| AIR-013 | Privileged-access misuse or insider manipulation of compliance decisions | Security | SOC2 CC6.1 | LOW | HIGH | MEDIUM | MITIGATE | RBAC (`src/enterprise/rbac.ts`); four-eyes gate with TOCTOU-safe `signOff()`; appetite `insider_access_anomaly_rate`; quarterly access review (`docs/IDENTITY-ACCESS-ATTESTATION.md`, `ob_access_review`) | LOW | Engineering Lead | 2026-09-10 |
| AIR-014 | Recurring regulatory obligation missed (board MI, audits, attestations, filings cadence) | Governance | CR 134/2025; ISO Clause 9 | MEDIUM | HIGH | HIGH | MITIGATE | Obligations register (`src/brain/regulatory-obligations.ts`) feeding `kri_regulatory_obligation_overdue` on `/api/kri-dashboard`; zero-tolerance appetite `regulatory_obligation_overdue`; governance committee weekly review | LOW | MLRO | 2026-09-10 |

---

## Review and Escalation

- The register is reviewed quarterly alongside the Data Quality Risk Register review (DATA_LINEAGE §7) at the governance committee.
- Any risk whose residual rating rises, or whose controls lapse (e.g. a related KRI turns red), is escalated to the MLRO immediately and to the next Board risk pack.
- New risks identified through incidents (`docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`), stakeholder feedback (HS-GOV-004), or audits are appended with the next AIR ID; closed risks are marked CLOSED with effectiveness evidence, never deleted.
- ACCEPT-treated risks (AIR-011, AIR-012) are re-confirmed by the operator at each annual certification (HS-GOV-001 §8).

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-RISK-001 |
| Version | 1.0.0 |
| Created | 2026-06-10 |
| Next mandatory review | 2026-09-10 |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/STATEMENT_OF_APPLICABILITY.md`, `docs/governance/AI_GOVERNANCE_POLICY.md`, `COMPLIANCE_GAPS.md`, `docs/data-governance/DATA_LINEAGE.md`, `docs/operations/THIRD_PARTY_MANAGEMENT.md`, `docs/governance/FRAMEWORK_COVERAGE.md` |
| Regulatory references | ISO/IEC 42001:2023 Annex A.7.3, Clauses 6.1 + 8.2; UAE FDL 10/2025 Art.18, Art.24; FATF R.10, R.12, R.15 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
