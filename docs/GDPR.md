# Hawkeye Sterling — GDPR / PDPL data-protection mapping

Data-sovereign design by default. The platform processes three classes
of personal data; each has a documented lawful basis, retention floor
and deletion path.

## Data classes

| Class | Example fields | Lawful basis |
| ----- | -------------- | ------------ |
| Screening subjects | name, DOB, nationality, jurisdiction | GDPR Art. 6(1)(c) — legal obligation (AML) |
| Monitoring deltas | list-match hashes, timestamps | GDPR Art. 6(1)(f) — legitimate interest |
| Analyst feedback | verdicts, analyst ID | GDPR Art. 6(1)(b) — contractual necessity |

Audit-chain anchors (tamper-evident SHA hashes) are retained under
Art. 17(3)(b) — legal obligation for AML record retention.

## Subject rights — endpoints

| Right | Endpoint | Notes |
| ----- | -------- | ----- |
| Access (Art. 15) | `POST /api/gdpr/export` | Returns all tenant-linked rows |
| Rectification (Art. 16) | `POST /api/corrections` | 30-day SLA, unlimited appeals |
| Erasure (Art. 17) | `POST /api/gdpr/delete` | Dry-run mode; audit anchors retained |
| Portability (Art. 20) | Same as export — JSON format |
| Objection (Art. 21) | `POST /api/corrections` with `requesterCapacity: "subject"` |

## Data residency

- **Free / Starter / Pro:** Netlify edge, regionally cached, no
  long-term PII storage (stateless quick-screen; ongoing monitoring
  stores only subject metadata + screening hashes in Netlify Blobs).
- **Enterprise:** Air-gap or single-region (EU-West, ME-Central,
  AP-South) deployment pinned to the customer's choice.

## Sub-processors

| Vendor | Role | Region |
| ------ | ---- | ------ |
| Netlify | Hosting + blob storage | Customer-selected |
| Google News (RSS) | Adverse-media index | Global (read-only) |

No other third-party processors. No sale of data. No cookies outside
session functional cookies.

## UAE PDPL / FATF / DIFC

The platform carries Emirates-specific policy library mappings
(`src/brain/anchors.ts`, `src/brain/emirates-regulators.ts`) that
align the screening taxonomy with:

- UAE Federal PDPL 45/2021
- DIFC DP Law 5/2020
- ADGM DPR 2021
- FATF Recommendations 10 (CDD), 12 (PEP), 20 (STR)

## Data Protection Impact Assessment

A DPIA was conducted for all five AI systems (HS-001 through HS-005) that process personal data in the AML/CFT context, in accordance with GDPR Article 35 and UAE PDPL requirements. Processing is likely to result in high risk to the rights and freedoms of natural persons (systematic profiling, large-scale processing, automated decision-support with significant consequences).

### Trigger Assessment

| System | Systematic Profiling | Large-Scale Processing | High Risk | DPIA Required |
| --- | --- | --- | --- | --- |
| HS-001 Screening Engine | Yes | Yes | Yes — can deny financial services | ✅ Yes |
| HS-002 Reasoning Modes | Yes | Yes | Yes — influences MLRO decisions | ✅ Yes |
| HS-003 Adverse Media | Yes | Yes | Yes — reputational consequences | ✅ Yes |
| HS-004 Auto-Dispositioner | Yes | Pilot scale | Yes — disposition proposals affect individuals | ✅ Yes |
| HS-005 STR/SAR Generator | No | N/A | Yes — regulatory filing consequences | ✅ Yes |

### Risks Identified and Mitigations

| Risk | Severity | Mitigation | Residual Risk |
| --- | --- | --- | --- |
| False positive causes wrongful denial of financial services | HIGH | MLRO mandatory review; charter P6; FPR < 5% target; corrections endpoint | LOW |
| PEP false classification damages reputation | HIGH | MLRO review; D17 declassification; cooling-off monitoring | LOW |
| Common-name adverse-media hit without corroboration | MEDIUM | POSSIBLE confidence max without corroborating ID; MLRO review before actioning | LOW |
| LLM hallucination fabricates adverse evidence | MEDIUM | Hallucination gate (`hallucination-gate.ts`); charter P2 prohibition | LOW |
| Tipping-off of investigation subject via STR narrative | CRITICAL | Tipping-off guard (`tipping-off-guard.ts`) mandatory; fails closed; charter P4 | VERY LOW |
| Retention beyond statutory period | LOW | Retention calculator; MLRO-approved destruction protocol | LOW |
| Unlawful cross-border data transfer | LOW | DPAs with sub-processors; UAE residency option for Enterprise | LOW |

### DPIA Outcomes

Processing may proceed subject to: (1) mandatory MLRO human review on all CRITICAL/HIGH outputs; (2) bias monitor remaining active with ratio ≤ 1.5; (3) data subject rights exercisable via documented endpoints; (4) audit trail tamper-evident and retained for the statutory period.

**DPIA Owner:** MLRO + Legal Counsel  
**Date Conducted:** 2026-05-06  
**Next Review:** 2027-05-06 (annual) or following any material change to processing activities.
