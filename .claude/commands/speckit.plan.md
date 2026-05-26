# /speckit.plan

Generate an implementation plan for a Hawkeye Sterling feature.

## Usage

```
/speckit.plan <feature-description-or-spec-reference>
```

## Output Format

Produce a step-by-step implementation plan:

1. **Affected Files** — List every file to be created or modified
2. **Architecture Decision** — How this fits the existing stack (extend vs. new module)
3. **Implementation Steps** — Ordered list with file:line references where possible
4. **Migration Path** — How existing data/config is handled (backward compatibility)
5. **Rollback Plan** — How to revert if the deployment fails
6. **Test Plan** — Unit, integration, E2E test cases to add
7. **Observability** — Metrics to increment, spans to add, audit entries to write
8. **Estimated Risk** — LOW / MEDIUM / HIGH with justification

## Constitutional Check

Before finalizing the plan, verify against each invariant in `.specify/memory/constitution.md` Article 2 (Security), Article 3 (Audit Trail), and Article 4 (AI Governance).

## Inputs

Accepts either a natural-language description or a reference to an existing spec in `.specify/`.
