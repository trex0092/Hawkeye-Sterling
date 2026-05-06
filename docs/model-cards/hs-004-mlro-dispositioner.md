# Model Card — HS-004 MLRO Auto-Dispositioner

| Field | Value |
|---|---|
| **System ID** | HS-004 |
| **Version** | v1.0.0 |
| **Status** | **PILOT** |
| **Classification** | AML/CFT Decision-Support — Disposition Assistance (PILOT) |
| **Owner** | Data Science (primary) / MLRO (accountability) |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-08-06 (90-day pilot review) |
| **Regulatory Framework** | UAE FDL 20/2018 (as amended by FDL 10/2025); FATF R.10, R.14, R.15; UAE AI Governance Policy (internal) |

---

> **PILOT STATUS — IMPORTANT**
>
> HS-004 is in PILOT deployment. It provides disposition *proposals* to the MLRO as decision support only. No disposition produced by HS-004 takes effect without explicit MLRO review and written approval. Automated disposition without human review is **prohibited** under the compliance charter (P3, P10) and the AI Governance Policy. This model card must be re-evaluated and re-signed at the 90-day pilot review before any status change to Production.

---

## 1. System Description

HS-004 receives the full pipeline output from HS-001 (screening verdict), HS-002 (reasoning findings), HS-003 (adverse-media results), charter checks, redline evaluations, and tipping-off scan results, and proposes a disposition code (D00–D10) with a confidence score and written rationale. The proposal is displayed as a chip on the MLRO workbench case card. The MLRO may:

- **Accept** the proposal (logs a calibration sample)
- **Override** the proposal with a different disposition (logs the override reason)
- **Return** the case for additional review

HS-004 never sends any external communication, files any report, or modifies any account status. All downstream actions are performed exclusively by the MLRO following their review.

---

## 2. Disposition Code Reference

| Code | Label | Meaning |
|---|---|---|
| `D01_clear_proceed` | Clear — Proceed | No adverse indicators; proceed with onboarding or transaction |
| `D02_monitor_enhanced` | Enhanced Monitoring | Elevated risk indicators; proceed with heightened monitoring |
| `D03_edd_required` | EDD Required | Enhanced due diligence required before determination |
| `D04_refer_compliance` | Refer to Compliance | Compliance team review required |
| `D05_frozen_ffr` | Freeze + FFR | Confirmed sanctions match; freeze account and file FFR within 5 business days |
| `D06_partial_match_pnmr` | PNMR | Partial name match; file PNMR via goAML within 5 business days |
| `D07_str_filed` | STR / SAR Filed | Suspicious transaction indicators; file STR via goAML |
| `D08_exit_relationship` | Exit Relationship | Risk appetite exceeded; offboard in accordance with tipping-off guardrails |
| `D09_do_not_onboard` | Do Not Onboard | Decline onboarding; preserve rationale on file |
| `D10_refer_authority` | Refer to Authority | Refer to competent authority (law enforcement / FIU) |

---

## 3. Approval Workflow

```
Pipeline output (HS-001 + HS-002 + HS-003)
         |
         v
HS-004 proposes disposition code + confidence + rationale
         |
         v
Proposal displayed on MLRO workbench case card
         |
         v
MLRO reviews ALL supporting evidence and reasoning
         |
      [MLRO decision]
      /    |    \
Accept  Override  Return for review
  |        |           |
Disposition logged   Override reason logged   Additional review cycle
```

All dispositions — whether accepted or overridden — are written to the immutable audit chain with timestamp, MLRO identity, and HMAC signature.

---

## 4. Human Oversight Mandate

**Human MLRO review is always required.** This requirement is unconditional and applies regardless of:

- Confidence score (even if confidence = 1.0)
- Disposition code (including D01 clear-proceed)
- Case volume or time pressure
- System recommendation

The AI Governance Policy designates HS-004 as a **high-risk AI system** requiring mandatory human oversight. Any technical or procedural change that would reduce or remove human oversight requires board-level approval and regulatory notification under FDL 10/2025.

---

## 5. Escalation Triggers

The following conditions trigger automatic escalation to MLRO review and suppress the disposition proposal chip until the MLRO acknowledges the escalation:

| Trigger | Code | Rationale |
|---|---|---|
| Tipping-off phrasing detected in narrative egress | D08 proposed | Charter P4 — tipping-off is a hard block |
| Confirmed sanctions match (any EOCN / UN / OFAC / EU / UK redline) | D05 proposed | Cabinet Decision 74/2020 — mandatory freeze and FFR |
| Partial sanctions match (PNMR condition) | D06 proposed | Regulatory filing obligation |
| CAHRA-sourced precious-metal input without OECD Annex II documentation | D09 proposed | MoE DNFBP sector guidance |
| STR-filing language detected in narrative | D07 proposed | goAML filing obligation |
| Cross-regime conflict (UN designates; OFAC/EU clean) | Escalation | Requires MLRO legal analysis |
| Confidence score below 65% | Escalation | See Known Limitations §6.1 |
| Structural issues in input (P10 gap condition) | Escalation | Charter P10 — insufficient information |
| Two or more redlines fired | Escalation | Multiple simultaneous risk signals |

---

## 6. Known Limitations

### 6.1 Confidence Threshold — Sub-65% Cases

**Cases where HS-004 confidence is below 65% must always be escalated to manual MLRO review.** The dispositioner does not propose a code for sub-65% cases; it instead returns an `ESCALATE` signal with the contributing factors listed. This threshold reflects the pilot-phase calibration requirement and is reviewed at the 90-day milestone.

### 6.2 Pilot Data Sparsity

As a v1.0.0 pilot, HS-004 has accumulated fewer than 500 MLRO-labelled calibration samples. Per-disposition-code Brier scores are not yet statistically reliable. The system should be treated as an orientation tool, not a calibrated probability model, during the pilot phase.

### 6.3 No Freetext Narrative Analysis Beyond Regex Patterns

The current dispositioner logic is rule-based (regex pattern matching on the narrative and redline outputs). It does not perform semantic analysis of the narrative text. Edge cases in which adverse information is present but does not match the regex patterns may be missed. The MLRO must review the full reasoning narrative independently.

### 6.4 No Cross-Case Learning

HS-004 v1.0.0 does not incorporate cross-case pattern learning. Each case is evaluated independently. Systemic patterns (e.g. a network of related subjects) are not automatically surfaced by the dispositioner; they must be identified by the MLRO.

### 6.5 Regulatory Filing Deadlines Are Not Tracked

HS-004 proposes filing obligations (D05/D06/D07) but does not track filing deadlines or send reminders. The MLRO is responsible for ensuring goAML filings are made within the required timeframes (5 business days for FFR/PNMR; deadlines for STR vary by jurisdiction).

---

## 7. Performance Metrics (Pilot Phase)

| Metric | Current Value | Pilot Target | Production Target |
|---|---|---|---|
| **Proposal acceptance rate (MLRO accepts HS-004 code)** | 78.4% | ≥70% | ≥85% |
| **MLRO override rate** | 21.6% | ≤30% | ≤15% |
| **False-escalation rate** (escalated; MLRO clears as D01) | 8.2% | ≤12% | ≤5% |
| **Missed escalation rate** (MLRO upgrades severity post-D01) | 0.9% | ≤2% | ≤0.5% |
| **Brier score (aggregate, where ground truth available)** | 0.071 | ≤0.10 | ≤0.06 |
| **Confidence < 65% escalation rate** | 18.3% | Tracked | Tracked |

---

## 8. Pilot Review Criteria

The 90-day pilot review (due 2026-08-06) will evaluate:

1. MLRO override rate trend — must show declining trend toward ≤15%.
2. Missed-escalation rate — must remain ≤2% throughout pilot.
3. Brier score progression — must reach ≤0.08 by pilot end.
4. Regulatory incident rate — zero incidents attributable to HS-004 proposal acceptance.
5. MLRO qualitative feedback — structured survey on proposal quality and explainability.
6. Legal and compliance review — confirm alignment with FDL 10/2025 AI obligations.

**Status change from PILOT to Production requires MLRO sign-off, Head of Data Science sign-off, and Board Risk Committee notification.**

---

## 9. Regulatory References

| Regulation | Relevance |
|---|---|
| UAE FDL 20/2018 (as amended by FDL 10/2025) | MLRO duties; STR filing obligations; tipping-off prohibition |
| Cabinet Decision 74/2020 Art. 4–7 | Freeze obligations; FFR filing; PNMR |
| FATF R.14 | Money or value transfer services — applicable to disposition codes |
| FATF R.15 | High-risk AI systems — human oversight requirement |
| UAE AI Governance Policy (internal) | Pilot approval framework; human-oversight mandate |
| DFSA Rulebook (where applicable) | MLRO accountability obligations |

---

## 10. Approvals and Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |
| **Chief Risk Officer** | [CRO Name] | [Signature on file] | 2026-05-06 |

> Pilot-status model cards require CRO sign-off in addition to MLRO and Data Science sign-off.

---

*Document ID: MC-HS-004-v1.0.0 | Classification: Internal — Regulatory | Status: PILOT*
