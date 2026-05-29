# /speckit.tasks

List outstanding Hawkeye Sterling development tasks with priority and regulatory urgency.

## Usage

```
/speckit.tasks
/speckit.tasks <filter>
```

Filters: `critical`, `high`, `medium`, `low`, `tier1`, `tier2`, `tier3`, `tier4`, `open-gaps`

## Behavior

1. Read `COMPLIANCE_GAPS.md` for open regulatory items
2. Read the plan at `/root/.claude/plans/you-are-an-autonomous-shimmying-harbor.md` if present
3. Synthesize into a prioritized task list

## Output Format

For each task:
```
[PRIORITY] ID — Title
  Regulatory: <FDL/FATF reference if applicable>
  Files: <files to touch>
  Effort: <S/M/L>
  Status: <not-started | in-progress | blocked | complete>
```

## Open Compliance Gaps (as of 2026-05-26)

| Gap | Severity | Description |
|---|---|---|
| CG-1 | CRITICAL | `/api/quick-screen` allows anonymous callers — pending MLRO sign-off |
| CG-2 | HIGH | No OFAC SDN delta feed subscription |
| CG-3 | MEDIUM | PEP tier-2 relatives not screened |
| CG-4 | HIGH | goAML live entity IDs are placeholders |
| CG-6 | MEDIUM | GDPR/PDPL erasure not automated |
| CG-8 | MEDIUM | Four-eyes quorum is 2, not ≥3 |
