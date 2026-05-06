# Governance Committee Meeting Minutes
## Hawkeye Sterling

**Document ID:** HS-GOV-003
**Owner:** Compliance Officer
**Cadence:** Weekly — Fridays 14:00 GST
**Quorum:** MLRO + Compliance Officer + at least one of {Data Science Lead, Engineering Lead, Legal Counsel}
**Approval authority:** MLRO for operational decisions; CEO/Board for charter or risk-tolerance changes

---

## 1. Purpose

This document is the standing minute book for the Hawkeye Sterling AI Governance Committee. Every committee meeting — weekly stand-ups, special sessions called for incidents, and annual recertification — records its decisions here within 48 hours of adjournment. The minute book is part of the audit-readiness package required by HS-GOV-001 §11–§12 and is delivered to regulators on request.

## 2. Meeting Template

Each meeting entry uses the structure below. Do not delete prior entries.

```
### Meeting YYYY-MM-DD (#NNN)

| Field | Value |
|---|---|
| Date / Time | YYYY-MM-DD HH:MM GST |
| Type | weekly | incident | annual-recert | extraordinary |
| Quorum met | yes | no — quorum failure recorded below |
| Chair | [name, role] |
| Minutes | [name, role] |

**Attendees:** [name (role), …]
**Apologies:** [name (role), …]

**1. Standing items**
- Charter changes since last meeting: [link to PR / "none"]
- Mode-Add / Mode-Modify since last meeting: [link to CHG IDs / "none"]
- Open incidents (HS-OPS-001): [list with severity / "none"]
- Drift alerts (>= warn) in last 7 days: [count / "none"]

**2. Decisions**
- DEC-NNN-1: …  Vote: [unanimous | N–N–N (for–against–abstain)]
- DEC-NNN-2: …  Vote: …

**3. Actions**
| Action ID | Owner | Due | Description |
|---|---|---|---|
| ACT-NNN-1 | … | YYYY-MM-DD | … |

**4. Next meeting:** YYYY-MM-DD HH:MM GST.
```

`NNN` is a monotonically increasing meeting sequence number. Decision and action IDs reset per meeting and are prefixed with that meeting's sequence number.

## 3. Standing Agenda

Every weekly meeting works through these items in order:

1. **Confirm minutes** of the previous meeting (motion to accept).
2. **Operational health** — Brier (`/api/mlro/brier`), drift (`/api/mlro/drift-alerts`), audit chain integrity (`/api/audit/verify`), sanctions list freshness (`/api/sanctions/status`).
3. **Incident review** — every CRITICAL/HIGH incident from `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` since the last meeting, with the post-incident review delivered when ready.
4. **Change Control approvals** — pending Mode-Add, Mode-Modify, Policy-Change, Data-Source items from `docs/operations/CHANGE_CONTROL_LOG.md`. The board records its vote here and the change log records the cross-reference.
5. **Pilot status review** — HS-004 (MLRO Auto-Dispositioner) graduation criteria progress (cases reviewed, precision, false-negative rate). See `docs/model-cards/HS-004-mlro-dispositioner.md` §4.
6. **Data quality** — sanctions list completeness, adverse-media latency, reasoning-mode test coverage, audit chain integrity per `docs/data-governance/DATA_LINEAGE.md` §7.
7. **Regulatory pipeline** — any inbound regulator contact, pending notifications, or upcoming filings.
8. **Action items** — review prior actions, accept new ones.
9. **Adjournment.**

## 4. Decision Log Index

Decisions that change the charter, mode registry, risk tolerances, or external commitments are mirrored into `docs/operations/CHANGE_CONTROL_LOG.md` §3 with the meeting reference attached.

## 5. Meeting Minutes

> First entry to be added at the next weekly meeting following adoption of HS-GOV-001 (see governance policy §11 — annual recertification cadence). Until then, this section is intentionally empty.

---

**Maintained by:** Compliance Officer
**Last updated:** 2026-05-06
**Next review:** Annually with HS-GOV-001 recertification
