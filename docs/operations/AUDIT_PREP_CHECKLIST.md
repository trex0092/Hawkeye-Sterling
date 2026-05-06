# Audit Preparation Checklist — Regulator Response Runbook

| Field | Value |
|---|---|
| **Document Version** | v1.0.0 |
| **Status** | Active |
| **Owner** | MLRO (primary) / Legal / Engineering |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-11-06 |
| **Applicable Regulators** | UAE FIU (goAML); Ministry of Economy DNFBP Supervision; CBUAE |
| **Target Response Window** | Full package within **48 hours** of UAE FIU / MoE inspector request |
| **Regulatory Framework** | UAE FDL 20/2018 (as amended by FDL 10/2025); Cabinet Decision 10/2019; FATF R.15, R.27, R.29 |

---

> **USE THIS RUNBOOK WHEN**: A UAE FIU inspector, MoE DNFBP supervisor, CBUAE examiner, or any other competent authority requests access to records, AI documentation, or audit materials relating to Hawkeye Sterling's AML/CFT compliance programme. Activate this checklist immediately upon receipt of the request.

---

## 1. Emergency Contacts

| Role | Name | Contact | Availability |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Phone] / [Email] | 24/7 — primary contact for all regulatory requests |
| **Legal (General Counsel / External Counsel)** | [Legal Name] | [Phone] / [Email] | Business hours; 24/7 emergency line |
| **CEO** | [CEO Name] | [Phone] / [Email] | 24/7 — notify for any on-site inspection or formal enforcement action |
| **Engineering Lead** | [Engineering Lead Name] | [Phone] / [Email] | Business hours; on-call for technical production requests |
| **Head of Data Science** | [DS Lead Name] | [Phone] / [Email] | Business hours; on-call for AI model documentation requests |
| **External Auditors** | [Firm Name] | [Contact] | Business hours |

**First call**: Always notify the MLRO first. The MLRO is the single point of contact for all regulatory communications. No member of staff may respond directly to a regulatory request without MLRO coordination.

---

## 2. Immediate Response Protocol (0–4 Hours)

- [ ] **Notify MLRO** within 30 minutes of receiving any regulatory contact.
- [ ] **Notify Legal** within 1 hour.
- [ ] **Notify CEO** if the request involves an on-site inspection, formal notice, or potential enforcement action.
- [ ] **Do not provide any documents, data, or access** until MLRO and Legal have reviewed the request and confirmed scope.
- [ ] **Preserve all records**: Issue a litigation hold — suspend any automated data-retention deletions relating to the subject period.
- [ ] **Log the request**: Create an entry in the Incident Register (date, time, inspector name, badge/credential number, regulatory body, nature of request, documents requested).
- [ ] **Request formal written notice** if the request was made verbally or by telephone. A formal written request is required before producing documents.
- [ ] **Confirm inspector credentials**: Verify inspector identity and authorisation with the regulatory body directly (not via contact details provided by the inspector).

---

## 3. Documents to Produce — Checklist

The following documents form the standard audit package for an AI governance inspection under UAE FDL 10/2025 and FATF R.15. Confirm with Legal which documents are within scope before production.

### 3.1 AI Governance and Inventory

- [ ] **AI_INVENTORY.md** — Complete inventory of all AI systems in production and pilot
  - Location: `docs/governance/AI_INVENTORY.md`
  - Owner: Head of Data Science
  - Export method: Direct file export from repository

- [ ] **AI_GOVERNANCE_POLICY.md** — Board-approved AI governance policy
  - Location: `docs/governance/AI_GOVERNANCE_POLICY.md`
  - Owner: MLRO + CRO
  - Export method: Direct file export from repository

### 3.2 Model Cards (All Five Systems)

- [ ] **HS-001 Screening Engine Model Card**
  - Location: `docs/model-cards/hs-001-screening.md`
  - Owner: Data Science + MLRO (signed)

- [ ] **HS-002 Reasoning Mode Executor Model Card**
  - Location: `docs/model-cards/hs-002-reasoning.md`
  - Owner: Data Science + MLRO (signed)

- [ ] **HS-003 Adverse Media Detector Model Card**
  - Location: `docs/model-cards/hs-003-adverse-media.md`
  - Owner: Data Science + MLRO (signed)

- [ ] **HS-004 MLRO Auto-Dispositioner Model Card** *(PILOT)*
  - Location: `docs/model-cards/hs-004-mlro-dispositioner.md`
  - Owner: Data Science + MLRO + CRO (signed)

- [ ] **HS-005 STR/SAR Narrative Generator Model Card**
  - Location: `docs/model-cards/hs-005-narrative.md`
  - Owner: Data Science + MLRO (signed)

### 3.3 Data Governance

- [ ] **DATA_LINEAGE.md** — Data lineage for all watchlist and training data sources
  - Location: `docs/data-governance/DATA_LINEAGE.md`
  - Owner: Engineering + Data Science
  - Export method: Direct file export from repository

### 3.4 Fairness and Testing

- [ ] **FAIRNESS_TESTING_RESULTS.md** — Disaggregated fairness metrics and bias register
  - Location: `docs/testing/FAIRNESS_TESTING_RESULTS.md`
  - Owner: Data Science + MLRO (signed quarterly)

- [ ] **TEST_PROCEDURES.md** — Full test procedure documentation
  - Location: `docs/testing/TEST_PROCEDURES.md`
  - Owner: Engineering + Data Science + MLRO (signed)

### 3.5 Operations and Incident Management

- [ ] **INCIDENT_RESPONSE_PLAYBOOK.md** — Incident response procedures
  - Location: `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`
  - Owner: MLRO + Engineering

- [ ] **CHANGE_CONTROL_LOG.md** — Complete change history for all AI systems
  - Location: `docs/operations/CHANGE_CONTROL_LOG.md`
  - Owner: Engineering + MLRO

### 3.6 Compliance and Regulatory

- [ ] **SOC2.md** — SOC2 Type II compliance documentation
  - Location: `docs/SOC2.md`

- [ ] **GDPR.md** — GDPR / PDPL compliance documentation
  - Location: `docs/GDPR.md`

- [ ] **ISO27001.md** — ISO 27001 compliance documentation
  - Location: `docs/ISO27001.md`

---

## 4. How to Export the Audit Trail

The immutable audit trail records all screening runs, MLRO decisions, goAML submissions, and system events with HMAC signatures. It is the primary evidentiary record for regulatory inspection.

### 4.1 Audit Trail Viewer

The audit trail is viewable in the browser at:
- URL: `/docs/audit-trail.html` (production instance)
- The viewer provides date-range filtering, subject-name search, and event-type filtering.

### 4.2 JSON Export

To export the audit trail as a JSON file:

```bash
# Via the compliance export API (requires MLRO-level authentication)
curl -X GET \
  -H "Authorization: Bearer <MLRO_JWT>" \
  -H "Content-Type: application/json" \
  "https://<PRODUCTION_HOST>/api/compliance/audit-export?from=<ISO_DATE>&to=<ISO_DATE>" \
  -o audit-trail-export-<DATE>.json
```

The exported JSON includes: run ID, timestamp, subject hash (not plaintext PII — confirm with Legal before producing subject-identifiable data), verdict, confidence, MLRO decision, HMAC signature, and disposition code.

### 4.3 Filtering for Specific Subjects or Time Windows

The `AuditTrailViewer.tsx` component supports the following filters:
- Date range: `from` / `to` ISO 8601 dates
- Subject reference: internal case ID or subject hash
- Event type: `SCREENING_RUN` / `MLRO_DECISION` / `GOAML_SUBMISSION` / `LIST_INGEST` / `SYSTEM_ALERT`
- Verdict: `MATCH` / `POSSIBLE` / `NO MATCH` / `ESCALATE`

---

## 5. How to Verify HMAC Signatures

Every audit chain entry is signed with HMAC-SHA256. To verify integrity:

```bash
# Retrieve the HMAC key from the secure key store (requires Engineering access)
HMAC_KEY=$(vault kv get -field=hmac_key secret/hawkeye/audit-chain)

# Verify a single audit record (replace RECORD_JSON with the JSON object)
echo -n '<CANONICAL_RECORD_JSON>' | \
  openssl dgst -sha256 -hmac "$HMAC_KEY" | \
  awk '{print $2}'
```

The computed digest must match the `hmac` field in the audit record. Any mismatch indicates tampering and must be escalated immediately to the MLRO and Engineering Lead.

**Important**: The HMAC key is held in the secure key store (HashiCorp Vault). Only the Engineering Lead and MLRO have access. Do not expose the key to inspectors; verify signatures in their presence if required and provide the output digest only.

---

## 6. How to Run SOC2 Export

The SOC2 export generates a compliance evidence package suitable for external auditor review:

```bash
# Requires MLRO-level authentication + Engineering co-authorisation
curl -X GET \
  -H "Authorization: Bearer <MLRO_JWT>" \
  -H "X-Engineering-Token: <ENGINEERING_TOKEN>" \
  "https://<PRODUCTION_HOST>/api/compliance/soc2-export?period=<YYYY-QN>" \
  -o soc2-export-<PERIOD>.zip
```

The ZIP package includes:
- Access control logs (who accessed what, when)
- Encryption-at-rest and in-transit configuration evidence
- Backup and recovery test records
- Vulnerability scan results
- Penetration test summary (redacted)
- Change management log (links to CHANGE_CONTROL_LOG.md entries)
- Incident log for the period

**Note**: The SOC2 export does not include PII or individual subject screening records. For subject-specific data, use the audit trail export (§4.2).

---

## 7. How to Perform GDPR / PDPL Erasure

If a regulator or data subject requests erasure of personal data under GDPR / UAE PDPL:

```bash
# Step 1: Confirm erasure eligibility with Legal before proceeding.
# Step 2: Obtain MLRO written authorisation.
# Step 3: Execute erasure (irreversible — dual authorisation required)
curl -X POST \
  -H "Authorization: Bearer <MLRO_JWT>" \
  -H "X-Legal-Token: <LEGAL_AUTHORISATION_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"subjectId": "<INTERNAL_SUBJECT_ID>", "reason": "<ERASURE_REASON>", "authorisedBy": "<MLRO_NAME>"}' \
  "https://<PRODUCTION_HOST>/api/compliance/gdpr-erasure"
```

**Important caveats**:
1. AML/CFT retention obligations (UAE FDL 20/2018 Art. 23: 5-year minimum retention after relationship end) **supersede** erasure requests. Legal must confirm that the retention period has elapsed before erasure is executed.
2. Erasure of audit chain records relating to STR/SAR/FFR/PNMR filings is prohibited while regulatory proceedings are ongoing.
3. Every erasure is logged in the audit chain (the erasure event record itself is retained even if the subject data is removed).
4. Notify the relevant DPA / TDRA if the erasure relates to a subject complaint.

---

## 8. Time-Boxed 48-Hour Package Preparation

Upon receipt of a formal UAE FIU or MoE inspector request, the full audit package must be assembled and verified within **48 hours**. Use the following timeline:

| Time | Action | Owner |
|---|---|---|
| **T+0** | Receive formal written request | MLRO |
| **T+1h** | Notify Legal, CEO; issue litigation hold; log request in Incident Register | MLRO |
| **T+2h** | Confirm scope with Legal; identify which documents are within scope | MLRO + Legal |
| **T+4h** | Begin document collection (§3 checklist); assign owners for each item | MLRO |
| **T+8h** | Engineering exports audit trail for requested period (§4) | Engineering |
| **T+12h** | MLRO reviews all documents for completeness and accuracy | MLRO |
| **T+16h** | Legal reviews documents for privilege and legal-professional privilege claims | Legal |
| **T+24h** | First-pass package assembled; MLRO and Legal sign off | MLRO + Legal |
| **T+36h** | Engineering verifies HMAC signatures on audit trail (§5) | Engineering |
| **T+40h** | SOC2 export generated if in scope (§6) | Engineering + MLRO |
| **T+44h** | Final package review; CEO briefed if enforcement risk identified | MLRO + Legal + CEO |
| **T+48h** | Package produced to inspector in agreed format (encrypted ZIP + delivery receipt) | MLRO |

**If any item cannot be produced within 48 hours**: Notify the inspector proactively, state the reason, and provide a revised date. Do not miss the deadline without communication.

---

## 9. Document Version Control Confirmation

Before producing any document, confirm:

- [ ] The document is the **current signed version** (check signature date vs. last git commit).
- [ ] The document has **not been amended** since the last signature (git diff).
- [ ] If the document has been amended since the last signature, the MLRO re-signs before production.
- [ ] All model cards carry the **MLRO and Data Science signatures** required by the AI Governance Policy.

---

## 10. Post-Inspection Actions

- [ ] **Debrief**: MLRO, Legal, and Engineering debrief within 5 business days of inspection completion.
- [ ] **Findings log**: Document any findings, improvement requests, or follow-up commitments from the inspector.
- [ ] **Remediation plan**: For any findings, create a remediation plan with committed dates and owners.
- [ ] **Board notification**: Notify the Board Risk Committee of any material findings within 10 business days.
- [ ] **Update runbook**: Update this checklist if the inspection revealed gaps in the preparation process.
- [ ] **CHANGE_CONTROL_LOG entry**: Log any system changes made in response to inspection findings.

---

## 11. Document Custodian Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Legal (General Counsel)** | [Legal Name] | [Signature on file] | 2026-05-06 |
| **CEO** | [CEO Name] | [Signature on file] | 2026-05-06 |

---

*Document ID: APC-v1.0.0 | Classification: Strictly Confidential — Regulatory | Review: Semi-annual or immediately following any inspection*
