# /speckit.implement

Implement a planned Hawkeye Sterling feature end-to-end.

## Usage

```
/speckit.implement <plan-reference-or-description>
```

## Behavior

1. Read `CLAUDE.md` for architecture context and forbidden patterns
2. Read `.specify/memory/constitution.md` for constitutional invariants
3. Implement the feature following the plan
4. Add required tests (unit, integration if applicable)
5. Increment relevant Prometheus metrics in `metrics-store.ts`
6. Add OTel span at any new compliance boundary
7. Add audit chain entry for any new AI decision or regulated action
8. Run smoke test sequence:
   ```bash
   npm run typecheck
   npx vitest run
   node scripts/validate-prompt-hashes.mjs
   node scripts/lethal-trifecta-check.mjs
   npm run brain:audit
   ```
9. Commit with descriptive message referencing the regulatory article if applicable

## Quality Gates (must all pass before committing)

- [ ] TypeScript: no errors
- [ ] Vitest: no regressions
- [ ] Prompt hash manifest: up to date
- [ ] No forbidden patterns (see `CLAUDE.md`)
- [ ] Audit chain entry written for regulated action
- [ ] Prometheus metric incremented
