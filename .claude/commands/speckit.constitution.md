# /speckit.constitution

Display or validate the Hawkeye Sterling specification constitution.

## Usage

```
/speckit.constitution
/speckit.constitution validate
/speckit.constitution article <N>
```

## Behavior

**No arguments**: Read and display `.specify/memory/constitution.md` in full.

**`validate`**: Check that the codebase satisfies all constitutional invariants:
1. All compliance routes call `enforce(req)` (grep for routes missing it)
2. All `writeAuditChainEntry` calls include `tenantId`
3. All entries in `MODEL_REGISTRY` have `riskTier`, `approval`, and `cardRef`
4. `scripts/prompt-hash-manifest.json` exists and is non-empty
5. `JWT_SIGNING_SECRET_PREV` path exists in `jwt.ts`
6. Egress gate returns `held_review` on error paths (not `allowed`)
7. No raw IP addresses in log statements (check for `ip:` without `Hash`)
8. OTel spans import from `web/lib/server/tracer.ts` not `@opentelemetry/api` directly

**`article <N>`**: Display a specific article (1–8).

## Files

- Constitution: `.specify/memory/constitution.md`
- Project context: `CLAUDE.md`
- Compliance gaps: `COMPLIANCE_GAPS.md`
