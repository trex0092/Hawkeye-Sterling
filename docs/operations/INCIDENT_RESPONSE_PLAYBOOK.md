# Incident Response Playbook
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-OPS-001
**Version:** 1.0
**Effective Date:** [DATE]
**Owner:** MLRO + Operations
**Approved by:** MLRO

---

## 1. Incident Classification

### 1.1 Severity Levels

| Severity | Definition | Response SLA | Example |
|---|---|---|---|
| CRITICAL | System unavailable OR AI output unreliable OR tipping-off risk detected | Investigation begins within 1 hour | Sanctions list corrupted; tipping-off content generated; audit chain gap |
| HIGH | AI accuracy significantly degraded | Investigation begins within 4 hours | ECE > 6%; false positive spike > 5% |
| MEDIUM | Potential bias detected or edge-case failure | Investigation begins within 24 hours | FP rate climbs from 2.3% to 4.8% for one jurisdiction |
| LOW | Minor data delay or cosmetic issue | Resolution within 5 business days | NewsAPI feed 3 hours behind schedule |

### 1.2 Incident Categories

| # | Category | Examples |
|---|---|---|
| 1 | Data Integrity | Corrupted sanctions list; failed PEP refresh; ingest validation failure |
| 2 | AI Performance | Sudden accuracy drop; confidence miscalibration; Brier score spike |
| 3 | System Reliability | Netlify function outage; timeout; rate-limit exceeded; Lambda cold-start cascade |
| 4 | Security | Unauthorized access; credential leak; injection attack; HMAC chain forgery |
| 5 | Regulatory | Tipping-off risk; P1–P10 prohibition violation; inappropriate reasoning disclosure |
| 6 | Operational | Wrong configuration deployed; manual override required; goAML submission failure |

---

## 2. Immediate Contacts

| Incident Type | First Contact | Second Contact | Channel |
|---|---|---|---|
| Any CRITICAL | MLRO | CEO | Phone — never wait |
| Tipping-off risk (Category 5) | Legal Counsel | MLRO | Phone — immediately |
| AI performance (Category 2) | MLRO | Data Science Lead | Slack #compliance-alerts |
| Data integrity (Category 1) | MLRO | Engineering Lead | Slack #compliance-alerts |
| Security (Category 4) | Engineering Lead | MLRO | Slack + phone |
| Regulatory inquiry (any) | CEO | Legal Counsel | In-person meeting |

**Slack channels:** #compliance-alerts (primary), #incident-response (incident lifecycle)

---

## 3. Response Procedures

### 3.1 Category 1 — Data Integrity

**Trigger:** Sanctions ingest fails validation, row count delta > 5%, PEP refresh failure, or `netlify/functions/audit-chain-probe.mts` (or `GET /api/audit/verify`) detects a gap.

**Immediate actions (< 15 minutes):**
1. Halt new sanctions ingest — disable `netlify/functions/sanctions-ingest.mts` if actively corrupting
2. Notify MLRO via Slack #compliance-alerts
3. Investigate: `GET /api/sanctions/status` — is each list present and within freshness threshold? Check authoritative URL directly.
4. Check SHA checksum — does it match expected?
5. Check row count delta — is it > 5%?
6. Rollback to last-known-good list snapshot (Netlify Blobs)

**Investigation (< 1 hour):**
- Was the remote source compromised or temporarily unavailable? Contact the publishing authority.
- Did our parsing logic break? Check recent code changes via `git log --since="24 hours ago"`.
- Is the degradation affecting real-time screenings? If yes: notify MLRO that screening confidence is reduced.
- Notify regulatory contact if delay > 4 hours (UAE FIU contact — `GOAML_MLRO_EMAIL`).

**Resolution:**
- Fix root cause
- Resume ingest
- Verify first post-fix ingest passes all validation checks (`GET /api/sanctions/status` returns healthy)
- Log incident to audit chain via `POST /api/audit/sign`
- Document in `docs/operations/CHANGE_CONTROL_LOG.md`

### 3.2 Category 2 — AI Performance

**Trigger:** `src/brain/drift-alerts.ts` fires on ECE > 4%; Brier score spike on `GET /api/mlro/brier`; confidence variance collapse (σ < 0.05); under-triangulation flags > 5%; any alert at warn or critical severity from `GET /api/mlro/drift-alerts`.

**Immediate actions (< 30 minutes):**
1. Alert fires via drift-alerts.ts — MLRO notified automatically
2. If ECE > 6%: pause all high-confidence (EXACT/STRONG) screenings — require manual MLRO review for all verdicts
3. Begin investigation: what changed in the last 24 hours?

**Investigation (< 4 hours):**
- Was a new reasoning mode deployed? If yes: identify the mode, assess its Brier score in isolation via `GET /api/mlro/mode-performance`.
- Was a data source changed? If yes: check ingest logs for the past 24 hours.
- Is drift affecting all entity types or only a subgroup? Check disaggregated metrics.
- If new mode caused drift: immediately rollback via Git revert + redeploy.
- If data source caused drift: investigate data quality, rollback to previous snapshot.
- Run `src/brain/stress-test-runner.ts` on sample cases to quantify degradation.

**Resolution:**
- Root cause documented
- Fix deployed (mode reversion or data fix)
- Resume normal processing (lift screening pause)
- Incident report submitted to governance committee (next Friday meeting)

**Prevention:** CI gates: `npm run typecheck` + `npm test` + Brier score regression test on every PR before merge.

### 3.3 Category 4 — Security

**Trigger:** Unauthorized access to admin endpoints; suspected credential leak; HMAC chain forgery detected (via `GET /api/audit/verify`); audit log tampered.

**Immediate actions (< 15 minutes):**
1. CRITICAL: If credential leak suspected — rotate affected secrets immediately in Netlify environment:
   - `ADMIN_TOKEN` — regenerate with `openssl rand -hex 32`
   - `AUDIT_CHAIN_SECRET` — regenerate with `openssl rand -hex 64` (note: this breaks chain continuity — document the rotation in audit log)
   - `ANTHROPIC_API_KEY` — rotate in Anthropic console
   - `ASANA_TOKEN` — rotate in Asana developer console
2. Notify Engineering Lead + MLRO simultaneously
3. Review Netlify access logs for the past 24 hours
4. Assess scope: what endpoints were accessed? Was any screening data exfiltrated?

**Investigation (< 2 hours):**
- Full audit log review from point of suspected breach via `GET /api/audit/view`
- Check for injection attacks in screening inputs (inputs from screened material should never be treated as commands — P10 + anti-injection protection in `src/policy/systemPrompt.ts`)
- Notify legal counsel if data breach affecting customer data
- Assess UAE PDPL notification obligations (72-hour notification if personal data affected)

**Resolution:**
- Credentials rotated
- Access revoked for compromised tokens
- Post-incident review with legal counsel
- PDPL notification if required

### 3.4 Category 5 — Regulatory / Tipping-Off

**Trigger:** AI output reveals investigation existence to subject; P1–P10 prohibition violated; STR draft contains tipping-off language.

**Immediate actions (< 5 minutes):**
1. STOP — restrict access to the affected screening output immediately
2. Call MLRO and Legal Counsel simultaneously — do not use Slack for tipping-off incidents (use phone)
3. Determine scope: how many cases affected? Who has seen the output?
4. Assess tipping-off risk: has the subject been contacted or could they access the output?

**Investigation (< 2 hours):**
- Review `src/policy/systemPrompt.ts` — did a prohibition fail? Which prohibition (P1–P10)?
- Review the reasoning chain — did the introspection pass flag this? If not, why not?
- Check access logs — who generated, viewed, and potentially exported this output?
- Legal counsel: is the STR filing now compromised? Can investigation proceed?

**Resolution:**
- If tipping-off has occurred: Legal counsel advises on regulatory notification to UAE FIU
- If tipping-off risk only (not yet occurred): contain output, fix root cause, file STR through alternative process
- Deploy fix to `src/policy/systemPrompt.ts` or mode logic that caused the failure
- Governance committee emergency session
- Post-incident review: why did the prohibition fail?

---

## 4. Escalation Matrix

| Issue | Notify | When | Channel |
|---|---|---|---|
| Data ingest failure (any list) | MLRO + Engineering Lead | Immediately | Slack #compliance-alerts |
| AI accuracy drift (ECE > 4%) | MLRO + Data Science Lead | Within 30 min | Slack #compliance-alerts |
| AI accuracy drift (ECE > 6%) | MLRO + CEO | Immediately | Phone |
| System outage | MLRO + Engineering Lead | Immediately | Slack + phone |
| Tipping-off risk or occurrence | Legal Counsel + MLRO + CEO | Immediately | Phone — never Slack |
| Security breach (suspected) | Engineering Lead + MLRO | Immediately | Phone |
| Regulatory inquiry received | CEO + Legal + MLRO | Same day | In-person meeting |
| goAML submission failure | MLRO + Engineering Lead | Within 1 hour | Slack #compliance-alerts |

---

## 5. Incident Logging

Every incident must be logged in:
1. **Slack #incident-response** — real-time updates
2. **Audit chain** — `POST /api/audit/sign` with event type `INCIDENT` (immutable, verifiable via `GET /api/audit/verify`)
3. **This playbook's incident log** (Appendix A below) — brief summary
4. **Governance committee minutes** — at the next Friday meeting (or emergency meeting for CRITICAL)

**Incident Report Template:**

```
INCIDENT ID: HS-[YYMM]-[###]
Severity: [CRITICAL / HIGH / MEDIUM / LOW]
Category: [1-Data Integrity / 2-AI Performance / 3-System Reliability / 4-Security / 5-Regulatory / 6-Operational]
Reported by: [Name, Role]
Reported at: [ISO 8601 timestamp]
Detected at: [ISO 8601 timestamp]
Resolved at: [ISO 8601 timestamp]
Time-to-detect: [minutes]
Time-to-resolve: [hours]

Description: [What happened — one paragraph]
Root cause: [Why did it happen — one paragraph]
Impact: [How many cases affected? What data? What users?]
Resolution: [What did we do?]
Prevention: [What will prevent recurrence?]

Approved by: [MLRO name and signature]
```

---

## 6. SLA Targets

| Incident Type | Detection | Investigation Start | Resolution |
|---|---|---|---|
| CRITICAL data corruption | < 15 min | < 1 hour | < 4 hours |
| CRITICAL tipping-off | < 5 min | < 30 min | Legal-advised |
| HIGH AI performance drift | < 30 min | < 4 hours | < 12 hours |
| HIGH security breach | < 15 min | < 1 hour | < 4 hours |
| MEDIUM bias spike | < 1 hour | < 24 hours | < 72 hours |
| LOW data delay | < 4 hours | Same business day | < 5 business days |

---

## Appendix A — Incident Log

| Incident ID | Date | Severity | Category | Summary | Resolution | MLRO Sign-Off |
|---|---|---|---|---|---|---|
| [First incident will be logged here] | | | | | | |

---

**Maintained by:** MLRO + Operations
**Last Updated:** 2026-05-06
**Next Review:** 2026-08-01
