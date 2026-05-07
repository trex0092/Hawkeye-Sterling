# Wave-3 Mode Spec Drafts — Batch 3 (10 more modes)

Same approval workflow as Batch 1 + 2. Each module's top-of-file
docstring cites its anchor + threshold source. ⚠️ VERIFY = MLRO
override expected.

| # | Mode | Public-reg source |
|---|---|---|
| 1 | `ins_early_surrender_cash` | IAIS ICP 22 + FATF Life-Insurance Guidance (Oct 2018) §3.4 |
| 2 | `ins_premium_overfund` | FATF Life-Insurance Guidance §3.5 + IAIS ICP 22 |
| 3 | `ins_policy_assignment` | FATF Life-Insurance Guidance §3.6 + IAIS Application Paper AML 2019 |
| 4 | `ins_beneficiary_rotation` | FATF Life-Insurance Guidance §3.3 + IAIS ICP 22 |
| 5 | `ins_cross_border_nominee` | FATF Life-Insurance Guidance §3.7 + UAE CBUAE Reg 26/2014 |
| 6 | `ins_single_premium_scrutiny` | FATF Life-Insurance Guidance §3.4 + IAIS ICP 22 |
| 7 | `email_spoof_forensic` | NIST SP 800-177r1 + FBI IC3 BEC Typology |
| 8 | `typosquat_domain_detection` | NIST SP 800-177r1 + ICANN abuse-reporting framework |
| 9 | `invoice_redirection_trace` | FBI IC3 BEC Annual Report + UK Action Fraud BEC typology |
| 10 | `ceo_impersonation_signal` | FBI IC3 BEC §"CEO Fraud" + UAE CBUAE Cyber Risk Management Standard 21/2018 |

Insurance anchors:
- **IAIS ICP 22** — Insurance Core Principle on AML/CFT (2019 revision)
- **FATF Risk-Based Approach for Life Insurance** (Oct 2018) — sectoral typologies + thresholds
- **IAIS Application Paper on AML/CFT** (Nov 2019)
- **UAE CBUAE Insurance Authority Regulation 26/2014** (AML/CFT for insurance)

Cyber-fraud anchors:
- **NIST SP 800-177 Rev. 1** — Trustworthy Email (DMARC/SPF/DKIM)
- **FBI IC3 BEC Annual Reports** (publicly published typologies)
- **ICANN Abuse Reporting** (typosquat / look-alike domain framework)
- **UAE CBUAE Cyber Risk Management Standard 21/2018**
- **UK Action Fraud BEC Typology Bulletin**
