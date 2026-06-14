# Security Policy

Hawkeye Sterling processes regulated AML/CFT data and is built fail-closed by
design. Security is a first-class, continuously-tested property of this
codebase.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately to the repository owner (see the repository contact / owner
profile). Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected component(s) and version / commit.

We aim to acknowledge reports promptly and will coordinate a fix and disclosure
timeline with you.

## Scope

In scope: authentication (`web/lib/server/enforce.ts`, `jwt.ts`), the audit
chain (`audit-chain.ts`), the egress tipping-off gate (`egress-check.ts`), the
four-eyes gate (`four-eyes-gate.ts`), rate limiting, the LLM pipeline (PII
redaction → model → rehydration), and the adversarial-probe suite.

## Security posture

- **Fail-closed auth** on every regulated route (`enforce(req)`, default `requireAuth: true`).
- **Append-only audit chain** (HMAC-SHA256) for every AI decision, screening result, and egress check.
- **Fail-closed egress gate** — missing key / LLM failure / parse failure returns `held_review`, never `allowed`.
- **JWT** pinned to HS256 with dual-secret rotation; `alg: none` rejected.
- **No raw PII or secrets in logs** — IPs HMAC-hashed (`anonIpKey()`), API keys never logged in full.
- **CI security gates** — npm audit (HIGH+CRITICAL), secret scan, Trivy, SBOM, Semgrep, CodeQL, prompt-hash integrity.

## Related documentation

- Penetration-test log: [`docs/PENTEST-LOG.md`](./docs/PENTEST-LOG.md)
- Incident runbook: [`docs/INCIDENT-RECOVERY.md`](./docs/INCIDENT-RECOVERY.md)
- AI governance policy: [`docs/governance/AI_GOVERNANCE_POLICY.md`](./docs/governance/AI_GOVERNANCE_POLICY.md)
- Architecture invariants & forbidden patterns: [`CLAUDE.md`](./CLAUDE.md)
