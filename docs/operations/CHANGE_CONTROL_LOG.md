# Change Control Log — Hawkeye Sterling AI Systems

| Field | Value |
|---|---|
| **Document Version** | v1.0.0 |
| **Status** | Active — append-only |
| **Owner** | Engineering (primary) / MLRO (compliance gate) |
| **Last Updated** | 2026-05-06 |
| **Regulatory Framework** | UAE FDL 10/2025; UAE AI Governance Policy (internal); FATF R.15 |

---

## 1. Purpose

This log is the authoritative record of all changes to Hawkeye Sterling's AI systems, reasoning modes, watchlist adapters, compliance rules, charter prohibitions, and governance configurations. It supports:

- Regulatory inspection and auditability (UAE FDL 10/2025; FATF R.15)
- Post-incident root-cause analysis
- Model drift investigation
- AI Governance Policy compliance

Every entry is append-only. No entry may be modified or deleted after approval. Amendments require a new entry with a cross-reference to the entry being amended.

---

## 2. Log Format

| Column | Description |
|---|---|
| **Date** | ISO 8601 date of deployment (YYYY-MM-DD) |
| **Change ID** | Unique identifier: `CCL-YYYY-NNN` (sequential within year) |
| **System / Component** | Affected system (HS-001 through HS-005) and sub-component |
| **Change Description** | What was changed and why (brief; link to PR for detail) |
| **Change Type** | `NEW_MODE` / `MODE_UPDATE` / `MODE_DEPRECATION` / `LIST_CONFIG` / `CHARTER` / `GOVERNANCE` / `BUG_FIX` / `PERFORMANCE` / `SECURITY` |
| **Author** | Engineer who implemented the change |
| **Reviewer** | Engineer who reviewed the PR |
| **Approved By** | MLRO (required for any mode, charter, or governance change) |
| **PR / Commit** | GitHub PR number or commit SHA |
| **Test Results** | Pass/fail summary and link to test run |

---

## 3. Instructions for Backfilling from Git Log

For the initial population of this log, run the following command from the repository root:

```bash
git log --all --oneline --format="%ci | %H | %an | %s" \
  -- src/brain/ src/policy/ src/services/ \
  | sort
```

For each commit that modified a reasoning mode, watchlist adapter, charter prohibition, or governance component, create a corresponding entry in this log. The PR number can be retrieved via:

```bash
gh pr list --state merged --search "<commit SHA>" --json number,title,author,mergedAt
```

Backfill entries use the commit date as the deployment date and the commit SHA as the PR/Commit reference. Backfill entries should be marked `[BACKFILL]` in the Change Description field.

> **Target**: All commits to `src/brain/reasoning-modes*.ts`, `src/brain/modes/`, `src/policy/`, `src/brain/compliance-policy.ts`, and `src/brain/watchlist-adapters.ts` from the repository's initial commit to the date of this document's creation must have corresponding log entries by 2026-06-06.

---

## 4. GitHub PR Template Requirements

Every pull request that adds, modifies, or deprecates a reasoning mode, watchlist adapter, charter prohibition, or governance configuration **must** include a change log entry. The PR template (`/.github/pull_request_template.md`) enforces this via a mandatory checklist item.

### PR Checklist Item (mandatory for AI system changes)

```markdown
## Change Control Log
- [ ] I have added an entry to `docs/operations/CHANGE_CONTROL_LOG.md` for this change.
- [ ] The entry includes: Date, Change ID, System/Component, Change Description, Change Type, Author, Reviewer, and Approved By (MLRO sign-off obtained before merge).
- [ ] Test results are recorded in the log entry (link to CI run).
```

PRs that add, modify, or deprecate reasoning modes without a change-log entry will be blocked from merge by the pre-deploy check (`scripts/predeploy-check.sh`).

---

## 5. Change Log Entries

| Date | Change ID | System / Component | Change Description | Change Type | Author | Reviewer | Approved By | PR / Commit | Test Results |
|---|---|---|---|---|---|---|---|---|---|
| 2026-05-06 | CCL-2026-001 | HS-001 / entity-screening-engine | [INITIAL] Three-tier screening pipeline (identifier-exact, name-exact, fuzzy+matrix); charter P1–P10 enforcement wired | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | All mode regression tests PASS |
| 2026-05-06 | CCL-2026-002 | HS-002 / reasoning-modes (Wave 1+2) | [INITIAL] 273 core and extended reasoning modes (Wave 1+2) wired into MODE_OVERRIDES | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | compliance-modes, logic-modes, meta-modes, integrity-modes tests PASS |
| 2026-05-06 | CCL-2026-003 | HS-002 / reasoning-modes-wave-3 | [INITIAL] 100 Wave 3 specialist modes: on-chain forensics, trade finance, real estate, insurance, NPO, maritime, ESG, insider/market-abuse, cyber, precious metals, free zones, art/luxury | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | uae-advanced-modes, weaponize-modes tests PASS |
| 2026-05-06 | CCL-2026-004 | HS-002 / introspection | [INITIAL] Introspection meta-pass: contradiction detection, under-triangulation, overconfidence, calibration collapse; confidence adjustment [-0.2, +0.2] | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | meta-modes tests PASS |
| 2026-05-06 | CCL-2026-005 | HS-003 / adverse-media | [INITIAL] Five-category adverse-media taxonomy; 180+ keyword dictionary; boolean query builder; source-tier weighting; multilingual packs (ar, fa, fr, es, ru, zh) | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | Adverse media regression tests PASS |
| 2026-05-06 | CCL-2026-006 | HS-003 / adverse-media-i18n | [INITIAL] Multilingual keyword classification module supporting 6 languages | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | i18n integration tests PASS |
| 2026-05-06 | CCL-2026-007 | HS-004 / mlro-auto-dispositioner | [INITIAL] PILOT auto-dispositioner v1.0.0; D00–D10 disposition codes; rule-based regex engine; confidence threshold <65% escalation; tipping-off pre-check | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | Dispositioner unit tests PASS; PILOT flag confirmed |
| 2026-05-06 | CCL-2026-008 | HS-005 / str-narratives | [INITIAL] STR/SAR skeleton templates for 12 typologies; 7-section mandatory structure; tipping-off guard integration; goAML XML schema validation; goAML auto-submit endpoint (disabled by default) | NEW_MODE | [Author] | [Reviewer] | [MLRO] | Initial commit | Narrative generation tests PASS; tipping-off guard tests PASS |
| 2026-05-06 | CCL-2026-009 | HS-001 / watchlist-adapters | [INITIAL] Watchlist adapter contracts for 7 sources: UN-1267, OFAC-SDN, OFAC-CONS, EU-FSF, UK-OFSI, UAE-EOCN, UAE-Local-Terrorist | LIST_CONFIG | [Author] | [Reviewer] | [MLRO] | Initial commit | Adapter validation tests PASS |
| 2026-05-06 | CCL-2026-010 | ALL / compliance-policy | [INITIAL] Charter prohibitions P1–P10 formalised; match-confidence taxonomy (EXACT/STRONG/POSSIBLE/WEAK/NO_MATCH); COMPLIANCE_POLICY_VERSION 2026.04-UAE-DNFBP-PM | CHARTER | [Author] | [Reviewer] | [MLRO] | Initial commit | Charter enforcement tests PASS |
| 2026-05-06 | CCL-2026-011 | HS-001 / tipping-off-guard | [INITIAL] Tipping-off egress guard; 11 pattern rules (HIGH/MEDIUM); fails closed on any HIGH match; FDL 10/2025 Art. X alignment | CHARTER | [Author] | [Reviewer] | [MLRO] | Initial commit | Tipping-off guard tests PASS — zero false negatives |
| 2026-05-06 | CCL-2026-012 | ALL / AI governance docs | Model cards HS-001 through HS-005 created; FAIRNESS_TESTING_RESULTS.md; CHANGE_CONTROL_LOG.md; TEST_PROCEDURES.md; AUDIT_PREP_CHECKLIST.md | GOVERNANCE | [Author] | [Reviewer] | [MLRO] | docs/model-cards/* | Documentation review PASS |

---

## 6. Pending Changes

| Change ID | System / Component | Description | Status | Target Date |
|---|---|---|---|---|
| CCL-2026-013 | HS-001 | Jurisdiction-aware confidence recalibration (MENA/Asia ECE breach mitigation) | Engineering backlog | Q3 2026 |
| CCL-2026-014 | HS-003 | Proper-noun disambiguation model for common-name individuals | Engineering backlog | Q3 2026 |
| CCL-2026-015 | HS-002 | Wave 3 stub-mode full implementation (mixer forensics, modern slavery, supply chain) | Engineering backlog | Q3 2026 |
| CCL-2026-016 | HS-004 | PILOT → Production status upgrade (subject to 90-day review) | Pending pilot review | Q3 2026 |
| CCL-2026-017 | HS-003 | Language pack expansion: Portuguese, Turkish, Indonesian | Engineering backlog | Q4 2026 |
| CCL-2026-018 | HS-001 | Regional database integrations: Africa PEP, MENA regional lists | Engineering backlog | Q4 2026 |

---

## 7. Approval Authority Matrix

| Change Type | Engineering Review | MLRO Approval | CRO Approval | Board Notification |
|---|---|---|---|---|
| New reasoning mode | Required | Required | Not required | Not required |
| Mode update (non-material) | Required | Required | Not required | Not required |
| Mode deprecation | Required | Required | Not required | Not required |
| Charter prohibition change | Required | Required | Required | Required |
| Governance configuration change | Required | Required | Required | Required |
| Watchlist source addition/removal | Required | Required | Not required | Not required |
| PILOT → Production status change | Required | Required | Required | Required |
| Human-oversight reduction | Required | Required | Required | Regulatory notification required |

---

*Document ID: CCL-v1.0.0 | Classification: Internal — Regulatory | Append-only*
