# Audit Preparation Checklist and Regulator Response Runbook
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-OPS-003
**Version:** 1.0
**Effective Date:** [DATE]
**Owner:** MLRO
**Approved by:** MLRO + CEO

---

## PART 1 — IF A REGULATOR CONTACTS YOU TODAY

### Step 1: Do Not Panic. Do Not Delay.

When you receive a regulatory inquiry (UAE FIU, MoE, CBUAE, or EU AI Office), the clock starts immediately.

**First 30 minutes:**
1. Call Legal Counsel — before responding to the regulator
2. Call CEO — immediately
3. Do not confirm or deny anything to the regulator until Legal Counsel has advised
4. Record the date, time, name of regulator contact, and exact request
5. Acknowledge receipt only — do not provide documents yet

**Within 2 hours:**
- Legal Counsel, MLRO, CEO, and Compliance Officer convene (in person or call)
- Agree response strategy
- Identify which documents are requested
- Confirm timeline the regulator has set (typical UAE FIU: 5 business days; EU AI Office: 14 days)

---

### Step 2: Produce the Documentation Package

The following documents can be produced within **48 hours** from any system with access to the Hawkeye Sterling repository and Netlify deployment:

| Document | Location | Estimated Time to Produce |
|---|---|---|
| AI Governance Policy (board-signed) | `docs/governance/AI_GOVERNANCE_POLICY.md` | < 5 minutes (print/export) |
| AI System Inventory | `docs/governance/AI_INVENTORY.md` | < 5 minutes |
| Model Cards (all 5) | `docs/model-cards/HS-001 through HS-005` | < 10 minutes |
| Data Lineage | `docs/data-governance/DATA_LINEAGE.md` | < 5 minutes |
| Fairness Testing Results | `docs/testing/FAIRNESS_TESTING_RESULTS.md` | < 5 minutes |
| Incident Playbook | `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` | < 5 minutes |
| Change Control Log | `docs/operations/CHANGE_CONTROL_LOG.md` | < 5 minutes |
| Audit trail (specific screening IDs) | `GET /api/audit/view?screening_id=XXX` — Export JSON or CSV | < 10 minutes per screening |
| Audit chain integrity check | `GET /api/audit/verify` | < 5 minutes |
| SOC2-ready audit log export | `GET /api/compliance/soc2-export` | < 15 minutes |
| Brier score calibration report | `GET /api/mlro/brier` — export | < 5 minutes |
| Drift alerts | `GET /api/mlro/drift-alerts` | < 5 minutes |
| Mode performance leaderboard | `GET /api/mlro/mode-performance` | < 5 minutes |
| Sanctions list freshness | `GET /api/sanctions/status` | < 5 minutes |
| Compliance charter (P1–P10) | `src/policy/systemPrompt.ts` | < 5 minutes |
| goAML submission records | `POST /api/goaml/auto-submit` logs in Netlify Blobs | < 15 minutes |

**Total estimated time to full package: < 2 hours**

---

### Step 3: Verification Checks Before Submission

Before sending any document to a regulator, verify:

- [ ] AI Governance Policy has CEO/Board signature and effective date
- [ ] All model cards have MLRO and Data Science Lead signatures
- [ ] Audit trail HMAC signatures are verifiable (`GET /api/audit/verify`)
- [ ] All screening IDs requested by regulator are present in the audit chain
- [ ] All goAML submissions referenced have a corresponding audit trail entry
- [ ] Data lineage document reflects current data sources (not stale)
- [ ] Legal Counsel has reviewed the package before submission

---

## PART 2 — PRE-INSPECTION SELF-AUDIT CHECKLIST

Run this checklist quarterly and before any known inspection.

### Section A: Governance Documentation (NIST AI RMF — GOVERN)

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| A1 | AI Governance Policy exists and is board-signed | Signed by CEO/Board with date ≤ 12 months ago | |
| A2 | AI System Inventory is current | All 5 systems listed; versions current; no new unregistered systems | |
| A3 | Governance committee has met in the last 30 days | Meeting minutes on file | |
| A4 | Change Control Log is current | Last entry within 7 days or confirmed no changes | |
| A5 | Incident log is current | All incidents logged; all CRITICAL/HIGH incidents have post-incident review | |
| A6 | Annual recertification is current | CEO/Board re-signature within the last 12 months | |

### Section B: Model Documentation (NIST AI RMF — MAP / EU AI Act Art. 30)

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| B1 | Model card HS-001 exists and is signed | MLRO + Data Science Lead signatures; version matches current deployment | |
| B2 | Model card HS-002 exists and is signed | Signed; mode count accurate (273 wave-1/2 + 100+ wave-3) | |
| B3 | Model card HS-003 exists and is signed | Signed; data sources current | |
| B4 | Model card HS-004 exists and is signed | PILOT status correctly stated; human oversight requirement documented | |
| B5 | Model card HS-005 exists and is signed | Signed; goAML integration documented; REPLACE_ME values resolved | |
| B6 | Data lineage document is current | All active data sources documented; quality SLAs current | |
| B7 | Mode version registry is populated | Every mode has version, deployedDate, contentHash, author, approvedBy | |

### Section C: Performance Monitoring (NIST AI RMF — MEASURE)

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| C1 | Brier score is within tolerance | ECE ≤ 4% (check `GET /api/mlro/brier`) | |
| C2 | No active drift alerts | `GET /api/mlro/drift-alerts` returns empty or resolved alerts only | |
| C3 | Fairness testing results are current | Results within the last 90 days; no group exceeding tolerance | |
| C4 | Last monthly stress-test passed | `src/brain/stress-test-runner.ts` result: detection rate ≥ 97% | |
| C5 | Last monthly red-team simulation passed | `src/brain/evader-simulator.ts` result: detection rate ≥ 97% | |
| C6 | Disaggregated precision within tolerance | All entity-type groups within ±3% delta of overall precision | |

### Section D: Risk Management (NIST AI RMF — MANAGE)

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| D1 | Audit chain has no gaps | `GET /api/audit/verify` returns ok=true; no broken links / sequence gaps | |
| D2 | Audit trail viewer is functional | `GET /api/audit/view?screening_id=XXX` returns valid JSON for any recent screening | |
| D3 | HMAC signatures are verifiable | `GET /api/audit/verify` confirms integrity for last 10 random screenings | |
| D4 | Incident response playbook is current | Tested in last 90 days via dry-run | |
| D5 | Data retention policy is enforced | `netlify/functions/retention-scheduler.mts` last ran successfully | |
| D6 | GDPR/PDPL erasure is functional | `POST /api/compliance/gdpr-erasure` endpoint tested in last 90 days | |

### Section E: Security and Configuration

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| E1 | All required env vars are set | `AUDIT_CHAIN_SECRET` (64 hex), `ADMIN_TOKEN`, `ONGOING_RUN_TOKEN`, `SANCTIONS_CRON_TOKEN` — all set in Netlify | |
| E2 | No secrets in git history | `git log -S "password" -p` returns no credential-looking strings | |
| E3 | npm audit clean | `npm audit --production` returns 0 critical vulnerabilities | |
| E4 | All goAML entity IDs are set | No `REPLACE_ME` values in `HAWKEYE_ENTITIES` | |
| E5 | CSP headers are active | `netlify.toml` CSP header present; `X-Frame-Options: SAMEORIGIN` active | |
| E6 | All fail-closed endpoints verified | `SANCTIONS_CRON_TOKEN` unset → 503 confirmed; `ADMIN_TOKEN` unset → 503 confirmed | |

### Section F: Human Oversight

| # | Check | Pass Criteria | Status |
|---|---|---|---|
| F1 | No STR submitted without MLRO sign-off | goAML submission logs show MLRO approval timestamp for every submission | |
| F2 | HS-004 (Auto-Dispositioner) PILOT constraints observed | No autonomous actions taken; all dispositions have MLRO override record | |
| F3 | Confidence ≤ 65% cases always escalated | Sample check: 10 random low-confidence cases all show "ESCALATE" verdict | |
| F4 | MLRO training is current | Annual AI governance training completed; attendance record on file | |

---

## PART 3 — DAY-BY-DAY REGULATOR INSPECTION GUIDE

### Day 1 Morning — Documentation Review

**What auditors ask:** "Show us your AI governance framework."

**What to produce (target: < 10 minutes):**

1. Open `docs/governance/AI_GOVERNANCE_POLICY.md` — present signed policy
2. Open `docs/governance/AI_INVENTORY.md` — show all 5 registered systems
3. Walk through the risk classification (high-risk, EU AI Act)
4. Show the compliance charter P1–P10 from `src/policy/systemPrompt.ts`

**What to say:** "We operate Hawkeye Sterling under a board-signed AI Governance Policy, effective [date]. It covers risk classification, risk tolerance, change management, human oversight, and annual recertification. Our MLRO is the designated responsible officer. The governance committee meets weekly."

### Day 1 Afternoon — Model Transparency

**What auditors ask:** "Explain how this system makes decisions."

**What to produce:**

1. Open model card HS-001 — walk through the 10 faculties and 373+ reasoning modes
2. Show the output structure (7 mandatory sections)
3. Show match confidence taxonomy (EXACT → NO MATCH)
4. Run a live demonstration screening and show the reasoning chain in real time
5. Show the introspection meta-reasoning pass (how the system audits itself)

**Key point to make:** "Every verdict traces every finding to the named reasoning mode that produced it. There is no black box. The MLRO can inspect every step of the reasoning chain for every decision, years after the fact."

### Day 2 Morning — Audit Trail

**What auditors ask:** "Show us your audit trail for the last 30 days."

**What to produce:**

1. Open the AuditTrailViewer panel in the MLRO portal
2. Query a specific screening by ID — show decision envelope, reasoning chain, HMAC seal
3. Click "Verify signatures" — show the chain is intact and tamper-evident (calls `GET /api/audit/verify`)
4. Export a sample screening as JSON or CSV — hand to auditor
5. Show `GET /api/compliance/soc2-export` for the bulk log

**Key point to make:** "Every screening decision is sealed with HMAC-SHA256 into an append-only chain in Netlify Blobs. The chain can be verified at any time. 10-year retention is enforced under FDL 10/2025 Art. 24."

### Day 2 Afternoon — Performance and Monitoring

**What auditors ask:** "How do you know the system is working correctly?"

**What to produce:**

1. Open the PerformanceMonitoringDashboard — show live Brier score, mode performance, fairness metrics
2. Open `docs/testing/FAIRNESS_TESTING_RESULTS.md` — walk through disaggregated results
3. Show drift alert thresholds via `GET /api/mlro/drift-alerts` and explain what fires when
4. Show the monthly stress-test and red-team simulation results
5. Show `src/brain/drift-alerts.ts` — explain continuous self-monitoring

**Key point to make:** "We do not deploy and forget. The system monitors its own calibration hourly, runs adversarial simulations monthly, and the governance committee reviews performance data every Friday."

### Day 3 Morning — End-to-End Walk-Through

**What auditors ask:** "Walk us through a single screening decision from start to finish."

**What to produce:**

1. Take a subject name (use a known designated entity from a public list for demonstration)
2. Submit via the screening interface (Module 01)
3. Show: sanctions check → PEP check → adverse media → reasoning mode execution → introspection pass → verdict → Asana task created
4. Open the audit trail for that screening — show the full chain
5. Show the MLRO disposition process (how the MLRO reviews and approves)

**What to say:** "From submission to MLRO-reviewed verdict takes approximately 45 seconds. The full reasoning chain — every inference, every mode that ran, every piece of evidence considered — is logged and sealed before the MLRO sees the result."

### Day 3 Afternoon — Human Oversight Demonstration

**What auditors ask:** "How do you ensure humans remain in control?"

**What to produce:**

1. Show HS-004 model card — PILOT status, human review mandatory
2. Show the confidence threshold: ≤ 65% always escalates
3. Show the goAML submission flow: AI drafts → MLRO reviews → MLRO approves → submission fires
4. Show the `DispositionButton.tsx` — MLRO must actively approve before any action
5. Show the STR draft review UI (`StrDraftPreview.tsx`)

**Key point to make:** "No STR is filed, no customer is offboarded, and no asset is frozen without explicit MLRO sign-off. The AI provides evidence and recommendations. Every consequential decision is made by a licensed human professional."

---

## PART 4 — FREQUENTLY ASKED REGULATOR QUESTIONS

**Q: Can you demonstrate that this system does not produce tipping-off content?**
A: Yes. The compliance charter (`src/policy/systemPrompt.ts`) contains prohibition P4, which is content-frozen and cannot be overridden. We can demonstrate a test input that attempts to generate tipping-off content and show that the system refuses and proposes a compliant alternative.

**Q: What happens if the system gives a wrong answer?**
A: The system produces recommendations for MLRO review, not decisions. If the MLRO disagrees with a verdict, they override it and the override is logged to the audit chain. The introspection pass also flags low-confidence results and under-triangulated findings automatically.

**Q: How do you handle data from sanctioned jurisdictions?**
A: All sanctions lists (UN, OFAC, EU, UK, UAE EOCN, UAE Local Terrorist List) are ingested daily. We screen against all lists simultaneously. The system cannot assert sanctions status unless the designation appears in a currently ingested authoritative list (prohibition P1 in the compliance charter).

**Q: Is this system compliant with UAE FDL 10/2025?**
A: The system is designed for and operated by a UAE DNFBP. It references FDL 10/2025 throughout. Item #38 (FDL 20/2018 — 10/2025 article crosswalk) is pending legal counsel verification and will be completed by [DATE]. Until complete, the system references both the old and new framework where articles overlap.

**Q: Can we take a copy of your audit trail?**
A: Yes. `GET /api/compliance/soc2-export` generates a full export. `GET /api/audit/view` exports individual screenings in JSON or CSV. We can provide any date range requested. Legal Counsel will review the export before delivery per our regulator response procedure.

---

**Document maintained by:** MLRO
**Last Updated:** 2026-05-06
**Next Review:** 2026-08-01
