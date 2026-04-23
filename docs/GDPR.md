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
