# Model Card: STR/SAR Narrative Generator
## HS-005 — Version 1.2.1

**Document ID:** HS-MC-005
**Status:** Production
**Last Updated:** 2026-05-06

---

## 1. System Identification

| Field | Value |
|---|---|
| System ID | HS-005 |
| System Name | STR/SAR Narrative Generator |
| Version | 1.2.1 |
| Powered by | Anthropic Claude (`EXECUTOR_MODEL` = `claude-sonnet-4-6`) |
| Preview UI | `web/components/screening/StrDraftPreview.tsx` |
| Submission endpoint | `POST /api/goaml/auto-submit` |

---

## 2. Purpose

Generates structured STR/SAR narrative text from the HS-001 screening verdict and the MLRO's case notes. Follows the UAE FIU goAML XML schema. The MLRO reviews and approves the draft before submission. After MLRO approval, the system submits via `POST /api/goaml/auto-submit`.

---

## 3. goAML Integration

### Multi-Entity Configuration

| Variable | Description |
|---|---|
| `HAWKEYE_ENTITIES` | JSON array of up to 7 UAE legal entities. Each has: `id`, `name`, `goamlRentityId`, `goamlBranch` (optional), `jurisdiction` (default: AE) |
| `HAWKEYE_DEFAULT_ENTITY_ID` | Preselected entity on STR/SAR form |
| `GOAML_MLRO_FULL_NAME` | MLRO name embedded in every goAML XML submission |
| `GOAML_MLRO_EMAIL` | MLRO email |
| `GOAML_MLRO_PHONE` | MLRO phone |

**CRITICAL:** All `goamlRentityId` values must be replaced from `REPLACE_ME` to the actual FIU-assigned ID before any live STR submission. Submitting with `REPLACE_ME` will be rejected by the UAE FIU system.

### Single-Entity Fallback

If `HAWKEYE_ENTITIES` is unset, the system uses `GOAML_RENTITY_ID` + `GOAML_RENTITY_BRANCH` for backwards compatibility.

---

## 4. Mandatory Output Structure

Every STR/SAR narrative produced by HS-005 must contain the seven mandatory sections from the compliance charter:

1. SUBJECT_IDENTIFIERS
2. SCOPE_DECLARATION
3. FINDINGS
4. GAPS
5. RED_FLAGS
6. RECOMMENDED_NEXT_STEPS
7. AUDIT_LINE

The MLRO reviews the draft against these sections before approval.

---

## 5. Human Oversight Requirement

**No STR is submitted without explicit MLRO sign-off.**

The workflow is:
1. HS-005 generates draft narrative (displayed in `StrDraftPreview.tsx`)
2. MLRO reviews draft — edits, annotates, or rejects
3. MLRO clicks "Approve and Submit" (disposition button, `DispositionButton.tsx`)
4. Only after approval: `POST /api/goaml/auto-submit` fires
5. Submission logged to audit chain with MLRO identity and timestamp; verifiable via `GET /api/audit/verify`

---

## 6. Compliance Charter Enforcement

| Prohibition | Application to HS-005 |
|---|---|
| P1 | Sanctions assertions in the narrative must cite the specific list entry from the current screening |
| P2 | All adverse media cited in narrative must trace to source articles in the HS-001 verdict |
| P3 | Narrative uses indicator language ("observed," "detected," "flagged") not legal conclusions |
| P4 | Narrative is for the FIU only — never shared with or accessible to the subject |
| P5 | Narrative reflects the HS-001 verdict confidence levels — allegations remain allegations |
| P9 | Narrative must reference the reasoning modes that produced the key findings |

---

## 7. Retention

All generated STR/SAR drafts (including rejected drafts) are retained for 10 years per FDL 10/2025 Art. 24. Both the MLRO-approved version and any earlier drafts are retained with timestamps.

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Science Lead | | | |
| MLRO | | | |
| Legal Counsel | | | |
