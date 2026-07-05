# Contributing to Hawkeye Sterling

Hawkeye Sterling is a regulator-grade AML/CFT compliance platform. Changes are
held to a higher bar than typical software: every contribution must preserve the
**architecture invariants** and pass the full CI gate before review.

> This is proprietary software (see [`LICENSE`](./LICENSE)). Contributions are
> accepted only from authorized contributors under written agreement.

By participating you agree to our [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
Decision rights, the change process, and what requires a governance decision are
defined in [`GOVERNANCE.md`](./GOVERNANCE.md). For help and support routing, see
[`SUPPORT.md`](./SUPPORT.md).

## Branch & commit conventions

- Develop on a feature branch — never commit directly to `main`/`master`.
- Use clear, descriptive commit messages (imperative mood, e.g. "Add egress gate retry").
- **Never** amend or force-push published commits.
- **Never** skip pre-commit hooks (`--no-verify`).

## Local gate — run before every push

```bash
npm run typecheck          # strict TS, zero errors
npm test                   # vitest unit suite
npm run brain:audit        # reasoning-mode registry integrity
node scripts/validate-prompt-hashes.mjs   # FDL 10/2025 Art.18 prompt-hash integrity
node scripts/lethal-trifecta-check.mjs    # governance check
cd web && npm run lint     # ESLint, max-warnings=0
```

Or run the aggregate:

```bash
npm run verify             # typecheck + lint + test + audit + secret scan
```

## CI gate (must be green)

In order: **lint → typecheck → unit tests → security-audit (npm audit
HIGH+CRITICAL, secret scan, Trivy, SBOM) → Semgrep → CodeQL → prompt-hash
integrity → integration tests.**

## Architecture invariants — do not break

1. **Fail-closed auth** — every compliance route calls `enforce(req)`; anonymous callers get `401`.
2. **Append-only audit chain** — `writeAuditChainEntry()` for every AI decision, screening result, SAR filing, and egress check.
3. **Dual-secret JWT rotation** — keep the `JWT_SIGNING_SECRET_PREV` path; HS256 pinned, `alg: none` rejected.
4. **Egress gate is fail-closed** — never return `allowed: true` on an error path; default to `held_review`.
5. **Hallucination gate is fire-and-forget** — must not block the response path.
6. **Prompt hashes are CI-validated** — every `SYSTEM_PROMPT` must appear in `scripts/prompt-hash-manifest.json`.
7. **Four-eyes TOCTOU protection** — `signOff()` re-reads under write lock; never trust in-memory approval state.

See [`CLAUDE.md`](./CLAUDE.md) for the full invariant list and forbidden patterns.

## Pull requests

- Keep PRs focused and reviewable.
- Fill out the PR template checklist, including the compliance-invariant items.
- Reference any related compliance gap from [`COMPLIANCE_GAPS.md`](./COMPLIANCE_GAPS.md).
