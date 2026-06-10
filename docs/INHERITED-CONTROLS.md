# Inherited Controls Register — Platform-Provider Security

**Document ID:** HS-SEC-003  
**Version:** 1.0.0  
**Effective Date:** 2026-06-10  
**Review Cycle:** Annual, alongside the vendor register review (`ob_vendor_annual_review`); ad-hoc on any provider incident or attestation lapse  
**Owner:** Engineering Lead  
**Classification:** Restricted — Internal Security Use Only  
**Framework references:** SOC2 CSOC/CUEC model; ISO/IEC 42001:2023 Clause 8.4

---

## Purpose

Hawkeye Sterling deploys to managed platforms, so several cybersecurity control categories are operated by providers rather than in this repository. This register states explicitly which controls are inherited, from whom, the provider attestation relied upon, and what residual responsibility stays with the operator. Without this record, "covered by Netlify/GitHub" is an assumption; with it, it is an auditable control.

## 1. Inherited Control Matrix

| Control area | Provider | Inherited controls | Provider attestation relied upon | Residual operator responsibility |
|---|---|---|---|---|
| External attack surface & DDoS | Netlify | Edge network, WAF, DDoS absorption, TLS termination and certificate lifecycle | Netlify SOC 2 Type II [operator to obtain current report annually] | Keep the deployed surface minimal; `web/middleware.ts` edge gating; HSTS posture (CG-8) |
| Network segmentation | Netlify | Function isolation, tenant separation of serverless runtime, internal network controls | Netlify SOC 2 Type II | Egress allowlist (`docs/EGRESS-ALLOWLIST.md`); fail-closed egress gate |
| Cloud storage durability | Netlify | Blobs replication and durability; platform access control | Netlify SOC 2 Type II; Netlify DPA (accepted — see HS-OPS-003 V-010) | Seed-corpus fallback; nightly S3 audit-chain backup; data-residency selection for Enterprise deployments |
| Source-code platform security | GitHub | Repository access control, branch protection enforcement, Actions runner isolation, secret scanning, Dependabot vulnerability intelligence | GitHub SOC 2 Type II [operator to obtain current report annually] | Branch-protection configuration; CI gate definitions (`.github/workflows/`); collaborator review (HS-SEC-001 §2) |
| Vulnerability intelligence | GitHub / Semgrep | CVE feeds, advisory database, SAST rule maintenance | Provider-published advisories | Acting on findings within remediation SLAs; CI fail-on-severity configuration |
| Rate-limit data store | Upstash | Redis encryption at rest/in transit, platform access control | Upstash SOC 2 [operator to obtain current report annually] | Fail-open vs fail-closed behaviour of `rate-limit.ts`; key hygiene |
| Endpoint security | — | **Not inherited, not applicable**: serverless platform, no managed endpoints or EDR estate | — | Operator workstation hygiene (outside platform scope) |
| Email security | — | **Not inherited, not applicable**: platform sends no email; no mail gateway exists | — | Operator-side mail provider controls |

## 2. Annual Verification Procedure

At each vendor register review (`ob_vendor_annual_review`, next due 2027-06-09):

1. Obtain or re-confirm each provider's current SOC 2 / ISO attestation listed in §1; record the report date in §3.
2. Confirm no provider incident in the past year invalidated an inherited control (check `docs/INCIDENTS.md` and provider status-page history).
3. Confirm residual-responsibility items still have owners and live evidence (middleware, egress allowlist, CI gates, backups).
4. Record the outcome in §3 and report exceptions to the governance committee.

## 3. Verification Log

| Date | Reviewer | Providers verified | Attestation reports sighted | Exceptions | Next due |
|---|---|---|---|---|---|
| 2026-06-10 | Engineering (gap-closure session) | Register established; control inheritance mapped from `docs/SOC2.md`, `docs/SECURITY-NOTES.md`, HS-OPS-003 | None sighted yet — [operator to obtain current SOC 2 reports from Netlify, GitHub, Upstash] | Attestation reports not yet on file | 2027-06-09 |

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-SEC-003 |
| Version | 1.0.0 |
| Created | 2026-06-10 |
| Next mandatory review | 2027-06-09 |
| Approver (Engineering Lead) | [Signature required] |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/operations/THIRD_PARTY_MANAGEMENT.md`, `docs/SOC2.md`, `docs/SECURITY-NOTES.md`, `docs/governance/FRAMEWORK_COVERAGE.md` |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
