# Project Governance

This document describes how Hawkeye Sterling is governed: who holds decision
rights, how changes are proposed and ratified, and how the project's regulatory
and AI-governance obligations are discharged. It is the repository-level
companion to the operational governance records under
[`docs/governance/`](./docs/governance/).

> Hawkeye Sterling is proprietary software (see [`LICENSE`](./LICENSE)). This is
> not an open-governance / open-contribution project. Governance here means the
> control model that keeps a regulated compliance platform accountable, not a
> community-membership ladder.

## 1. Roles & decision rights

| Role | Held by | Authority |
|---|---|---|
| **MLRO (Chair)** | Repository maintainer / Money Laundering Reporting Officer | Final decision authority on compliance, risk-appetite, and AI-governance matters; casting vote where committee consensus fails. |
| **Compliance Officer** | Compliance function | Regulatory interpretation; quarterly Board Risk Committee reporting. |
| **Engineering Lead** | Engineering function | Technical design, CI integrity, release sign-off. |
| **Data Science Lead** | Model-risk function | Model performance, drift, calibration, and bias review. |
| **Board Risk Committee** | Operator board | Receives quarterly AI-governance reports; ratifies material changes. |

For a single-operator deployment these roles may be discharged by one
accountable person; the **separation of duties** required by regulated actions
(four-eyes on SAR/goAML, override, whitelist) is enforced in code regardless —
see the four-eyes gate and `requireRole()` RBAC.

The authoritative committee cadence, quorum, and escalation rules are recorded
in
[`docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md`](./docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md).

## 2. What requires a governance decision

A change **must** be raised as a governance decision (committee minute + record)
— not merged on engineering review alone — when it:

1. Weakens or removes any **architecture invariant** listed in [`CLAUDE.md`](./CLAUDE.md).
2. Alters the **compliance charter** / system prompt (`src/policy/systemPrompt.ts`)
   — every change is prompt-hash-tracked (FDL 10/2025 Art.18).
3. Adds, retires, or re-tiers a model in the **model registry**
   (`web/lib/server/ai-governance.ts`).
4. Changes a **risk-appetite threshold**, KRI, or bias/drift floor
   (`src/brain/risk-appetite.ts`, `bias-monitor.ts`, `drift-monitor.ts`).
5. Opens, changes the severity of, or closes a **compliance gap**
   ([`COMPLIANCE_GAPS.md`](./COMPLIANCE_GAPS.md)).
6. Relaxes an **egress, auth, audit, or four-eyes** control path.

Everything else (features, fixes, refactors, docs) proceeds through the normal
pull-request review defined in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## 3. Change process

```
Proposal ──▶ Pull request ──▶ CI gate (must be green) ──▶ Code-owner review
                                                              │
                        ┌─────────────────────────────────────┘
                        ▼
        Governance-impacting?  ── no ──▶ Merge on maintainer/code-owner review
                        │
                       yes
                        ▼
        Committee decision recorded ──▶ Ratify ──▶ Merge ──▶ Update registers
        (minute + COMPLIANCE_GAPS.md / model registry / risk appetite as applicable)
```

- **CI is the objective gate.** No change merges with a red pipeline. The order
  is: lint → typecheck → unit tests → security-audit → Semgrep → CodeQL →
  prompt-hash integrity → integration tests.
- **Code owners** (see [`.github/CODEOWNERS`](./.github/CODEOWNERS)) are required
  reviewers on security-, audit-, and compliance-critical paths.
- **Governance-impacting changes** additionally require a recorded committee
  decision before merge, and an update to the relevant register.

## 4. Registers of record

Governance state lives in version-controlled registers, so every decision is
auditable from the git history:

| Register | Location |
|---|---|
| Architecture decisions (ADRs) | [`docs/adr/`](./docs/adr/) |
| Maintainer roster & review ownership | [`MAINTAINERS.md`](./MAINTAINERS.md) |
| Compliance gaps (lifecycle) | [`COMPLIANCE_GAPS.md`](./COMPLIANCE_GAPS.md) |
| AI governance policy | [`docs/governance/AI_GOVERNANCE_POLICY.md`](./docs/governance/AI_GOVERNANCE_POLICY.md) |
| AI risk register (ISO 42001 A.7.3) | [`docs/governance/AI_RISK_REGISTER.md`](./docs/governance/AI_RISK_REGISTER.md) |
| AI inventory | [`docs/governance/AI_INVENTORY.md`](./docs/governance/AI_INVENTORY.md) |
| Statement of Applicability | [`docs/governance/STATEMENT_OF_APPLICABILITY.md`](./docs/governance/STATEMENT_OF_APPLICABILITY.md) |
| Framework traceability | [`docs/governance/FRAMEWORK_COVERAGE.md`](./docs/governance/FRAMEWORK_COVERAGE.md) |
| Committee minutes | [`docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md`](./docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md) |
| Stakeholder feedback | [`docs/governance/STAKEHOLDER_FEEDBACK_LOG.md`](./docs/governance/STAKEHOLDER_FEEDBACK_LOG.md) |
| Incident log & runbook | [`docs/INCIDENTS.md`](./docs/INCIDENTS.md) · [`docs/INCIDENT-RECOVERY.md`](./docs/INCIDENT-RECOVERY.md) |
| Model risk tiers & approvals | `web/lib/server/ai-governance.ts` (`MODEL_REGISTRY`) |
| Risk appetite / KRIs | `src/brain/risk-appetite.ts` · `src/brain/kri-registry.ts` |

## 5. Regulatory anchors

| Framework | Governance touchpoint |
|---|---|
| UAE FDL 20/2018 | CDD, screening, record-keeping |
| UAE FDL 10/2025 (Art.18) | AI audit trail, prompt-hash integrity, model registry |
| Cabinet Decision 10/2019 | STR filing (four-eyes + egress gate) |
| Cabinet Resolution 134/2025 | Four-eyes, separation of duties, senior-management accountability |
| FATF Methodology / R.10 · R.16 | Non-discrimination (bias floor), wire-transfer data |
| ISO/IEC 42001 | AI management system — SoA, risk register, committee cadence |
| SOC 2 (CC6.1, CC7.4) | Logical access (fail-closed auth), incident response |

See [`docs/governance/FRAMEWORK_COVERAGE.md`](./docs/governance/FRAMEWORK_COVERAGE.md)
for the full control-to-implementation traceability matrix.

## 6. Amending this document

Changes to this governance model are themselves governance-impacting (§2) and
require MLRO approval, recorded in the committee minutes. This file is
code-owned; see [`.github/CODEOWNERS`](./.github/CODEOWNERS).
