# Hawkeye-Sterling — Incident Log

Maintained per `docs/INCIDENT-RECOVERY.md` §9 ("After every incident").

Each entry documents:
- **Date** — UTC date the incident began
- **Severity** — P1 (service down) / P2 (degraded) / P3 (near-miss / informational)
- **Symptom** — what was observed
- **Root cause** — what caused it
- **Resolution** — how it was resolved, with runbook reference
- **Time-to-recover** — wall-clock time from detection to resolution
- **Follow-up** — any open PR, ticket, or preventive action

> Append entries in reverse-chronological order (newest at top).
> For incidents involving the audit chain (§6 of runbook), the MLRO must be listed.
> For AI model incidents (§9), include the model ID, route affected, and whether AI-assisted decisions made during the incident have been reviewed.

---

## Incident template

```
### YYYY-MM-DD — [Short title]

| Field | Value |
|---|---|
| Severity | P? |
| Detected by | [who / which monitor] |
| Runbook section | [§N] |
| Time-to-recover | [X min] |
| MLRO notified | Yes / No / N/A |

**Symptom:** [what was observed]

**Root cause:** [what caused it]

**Resolution:** [steps taken, referencing runbook section]

**Follow-up:** [PR / ticket / accepted risk]
```

---

<!-- Insert real incidents above this line, newest first. -->
<!-- Do not delete this comment — it marks the boundary for automated appends. -->
