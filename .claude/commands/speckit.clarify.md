# /speckit.clarify

Ask targeted clarifying questions about an ambiguous Hawkeye Sterling requirement before implementation.

## Usage

```
/speckit.clarify <ambiguous-requirement-or-feature>
```

## Behavior

Read `CLAUDE.md` and `.specify/memory/constitution.md`, then produce 3–7 targeted questions that:

1. Identify regulatory decisions needing MLRO input (auth requirements, data retention, STR thresholds)
2. Identify architectural decisions needing CTO input (new external API, schema change, auth model change)
3. Surface any constitutional conflicts that must be resolved before implementation begins
4. Clarify edge cases that affect the audit trail, fail-closed behavior, or PII handling

## Output Format

```
Clarifications needed before implementing <feature>:

MLRO Input Required:
1. <question> [FDL Art.N reference]
2. <question>

CTO Input Required:
3. <question>
4. <question>

Constitutional Check:
5. This feature conflicts with Article N (X) because Y — how should we resolve?

Assumptions (proceeding unless corrected):
- <assumption 1>
- <assumption 2>
```

## When to Use

Use before any change that affects: authentication model, audit trail schema, AI model selection, sanctions list sources, data retention policy, STR/SAR filing logic, or tenant isolation.
