# Model Card: MLRO Auto-Dispositioner
## HS-004 — Version 1.0.0 — PILOT

**Document ID:** HS-MC-004
**Status:** PILOT — enhanced human oversight mandatory
**Last Updated:** 2026-05-06

---

## 1. System Identification

| Field | Value |
|---|---|
| System ID | HS-004 |
| System Name | MLRO Auto-Dispositioner |
| Version | 1.0.0 |
| Stage | **PILOT** |
| Powered by | Anthropic Claude (`ADVISOR_MODEL` = `claude-opus-4-7`) |
| Primary Endpoint | Part of `/api/agent/screen` pipeline |

---

## 2. Purpose

Suggests a disposition on a completed screening verdict: escalate to STR, dismiss, or request more information. This is an advisory suggestion only — the MLRO must review and approve every disposition before any action is taken.

---

## 3. CRITICAL Governance Constraints

This system is in PILOT status. The following constraints are absolute:

1. **No autonomous action.** HS-004 cannot and does not submit STRs, file with goAML, or freeze assets.
2. **Human review mandatory.** Every suggestion from HS-004 requires explicit MLRO sign-off before execution.
3. **Confidence threshold.** Any case where HS-004 confidence ≤ 65% outputs "ESCALATE — human review required" regardless of suggested disposition.
4. **Every suggestion is logged** to the audit chain (HMAC-sealed, Netlify Blobs) before MLRO review, creating an immutable record of the AI suggestion vs. the MLRO decision. Verifiable via `GET /api/audit/verify`.
5. **Tipping-off.** HS-004 will never suggest a disposition that involves communicating to the subject that they are under investigation. P4 is absolute.

---

## 4. Graduation Criteria to Production

HS-004 will be evaluated for Production status when:

| Criterion | Target | Current Status |
|---|---|---|
| MLRO-reviewed cases with tracked outcomes | ≥ 500 | In progress |
| Escalation precision (STR cases correctly flagged) | ≥ 95% | Tracking |
| False negative rate (missed STR cases) | ≤ 0.5% | Tracking |
| Sustained performance period | ≥ 90 days | Tracking |
| External review | Completed | Not yet initiated |
| Governance board vote | Required | Pending criteria above |

**Estimated graduation date:** Q4 2026 (subject to above criteria being met)

---

## 5. Compliance Charter Enforcement

All P1–P10 prohibitions enforced. Additional constraints specific to this system:

- P3: No legal conclusions — HS-004 never characterises a case as "money laundering"; it recommends escalation based on indicators
- P4: No tipping-off — dispositions never include customer communication that reveals investigation
- P9: Every disposition suggestion must cite the HS-001 verdict sections that informed it

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Science Lead | | | |
| MLRO | | | |
