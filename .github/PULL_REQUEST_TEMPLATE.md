# Pull Request

## Summary

<!-- What does this change do, and why? -->

## Related

<!-- Link issues / compliance gaps (COMPLIANCE_GAPS.md), e.g. Closes #123, CG-7 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Compliance / governance change
- [ ] Documentation / presentation
- [ ] Refactor (no behaviour change)

## Compliance invariant checklist

- [ ] Regulated routes still call `enforce(req)` (fail-closed auth preserved)
- [ ] `writeAuditChainEntry()` is called for every new AI decision / screening / SAR / egress check (with `tenantId`)
- [ ] Egress gate never returns `allowed: true` on an error path
- [ ] JWT remains HS256 with dual-secret rotation intact (`alg: none` rejected)
- [ ] No raw IPs / API keys logged (IPs HMAC-hashed via `anonIpKey()`)
- [ ] Any new `SYSTEM_PROMPT` added to `scripts/prompt-hash-manifest.json`
- [ ] Four-eyes `signOff()` re-reads under write lock (no in-memory trust)

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run brain:audit` passes
- [ ] `cd web && npm run lint` passes
- [ ] Prompt-hash + lethal-trifecta governance checks pass

## Notes for reviewers

<!-- Anything specific you want reviewers to focus on -->
