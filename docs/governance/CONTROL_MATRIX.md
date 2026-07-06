# Control Traceability Matrix

A single auditable view that ties each architecture invariant and AI-governance
control to its **implementation**, its **automated enforcement in CI**, its
**decision record (ADR)**, and the **regulation** it serves. This is the map an
auditor or regulator can follow from a legal obligation down to the line of code
that satisfies it — and to the CI gate that keeps it satisfied.

Sources of truth: [`CLAUDE.md`](../../CLAUDE.md) (invariants + forbidden
patterns), [`docs/adr/`](../adr) (decisions), [`.github/codeql/`](../../.github/codeql)
(custom queries), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
(gates), and [`FRAMEWORK_COVERAGE.md`](./FRAMEWORK_COVERAGE.md) (framework map).

Legend — **Enforcement**: 🔒 CodeQL query · ⚙️ CI script/step · 🧪 test suite · 👤 code-owner review.

## 1. Architecture invariants

| # | Invariant | Implementation | Enforcement | ADR | Regulation |
|---|---|---|---|---|---|
| 1 | Fail-closed auth on every regulated route | `web/lib/server/enforce.ts` | 🔒 `missing-enforce-call.ql` · ⚙️ "Auth coverage gate — no silent opt-outs of enforce()" · 🧪 | [0002](../adr/0002-fail-closed-compliance-controls.md) | FDL 20/2018 Art.18 · SOC 2 CC6.1 |
| 2 | Append-only audit chain for every decision | `web/lib/server/audit-chain.ts` | 👤 · 🧪 (tenantId required) | [0003](../adr/0003-append-only-audit-chain.md) | FDL 10/2025 Art.18 · Cabinet Decision 10/2019 |
| 3 | Dual-secret JWT rotation, HS256 pinned | `web/lib/server/jwt.ts` | 🔒 `jwt-decode-outside-jwt-ts.ql` · 🧪 (`alg:none` rejected) | [0004](../adr/0004-dual-secret-jwt-rotation.md) | SOC 2 CC6.1 |
| 4 | Egress gate fail-closed (`held_review`, never `allowed`) | `web/lib/server/egress-check.ts` | 🔒 `egress-allowed-on-error.ql` · 🧪 | [0002](../adr/0002-fail-closed-compliance-controls.md) | Cabinet Decision 10/2019 (STR / tipping-off) |
| 5 | Hallucination gate is fire-and-forget (non-blocking) | `web/lib/server/hallucination-gate.ts` | 👤 · 🧪 (`void … .catch`) | [0007](../adr/0007-pii-redaction-llm-pipeline.md) | FDL 10/2025 (AI reliability) |
| 6 | OTel spans use a no-op-safe tracer | `web/lib/server/tracer.ts` | 👤 · 🧪 | [0008](../adr/0008-observability-noop-tracer-metrics.md) | SOC 2 CC7.x |
| 7 | Prometheus metrics are family-grouped | `web/app/api/metrics/route.ts` | 🧪 (single `# HELP`/`# TYPE` per family) | [0008](../adr/0008-observability-noop-tracer-metrics.md) | SOC 2 CC7.x · ISO 42001 |
| 8 | Prompt hashes are CI-validated | `src/policy/systemPrompt.ts` · `scripts/prompt-hash-manifest.json` | ⚙️ "Prompt hash integrity check" (`validate-prompt-hashes.mjs`) | [0009](../adr/0009-content-frozen-charter-prompt-hash-integrity.md) | FDL 10/2025 Art.18 |
| 9 | Model registry has riskTier + approval + cardRef | `web/lib/server/ai-governance.ts` | 👤 · 🧪 | [0006](../adr/0006-model-router-fallback.md) | FDL 10/2025 · ISO 42001 A.6 |
| 10 | Four-eyes TOCTOU protection (re-read under lock) | `web/lib/server/four-eyes-gate.ts` | 🧪 · 👤 (`requireRole()` RBAC) | [0005](../adr/0005-four-eyes-separation-of-duties.md) | Cabinet Resolution 134/2025 |

## 2. Forbidden patterns → guard

Each forbidden pattern in [`CLAUDE.md`](../../CLAUDE.md) has an automated or
review guard:

| Forbidden pattern | Guard |
|---|---|
| `enforce(req)` with `requireAuth:false` on a regulated route | 🔒 `missing-enforce-call.ql` · ⚙️ Auth coverage gate |
| Logging raw IP addresses (not `anonIpKey()`) | 🔒 `raw-ip-logged.ql` |
| Trusting the first `X-Forwarded-For` value | 🔒 `first-forwarded-for.ql` |
| `alg: none` / non-HS256 JWT | 🔒 `jwt-decode-outside-jwt-ts.ql` · 🧪 |
| Egress `allowed: true` on an error path | 🔒 `egress-allowed-on-error.ql` |
| Logging API-key values | ⚙️ "Secret leak check" · gitleaks · GitGuardian |
| Direct Anthropic client instantiation (PII bypass) | ⚙️ "PII guard — no direct Anthropic client instantiation" |
| `writeAuditChainEntry()` without a tenantId | 🧪 · 👤 |
| Emitting `# HELP`/`# TYPE` more than once per family | 🧪 |
| Lethal-trifecta capability combination | ⚙️ "Lethal-trifecta governance check (Control 5.08)" (`lethal-trifecta-check.mjs`) |

## 3. AI-governance controls (NIST AI RMF · ISO 42001)

| Control | Implementation | Enforcement | Regulation |
|---|---|---|---|
| Content-frozen compliance charter (P1–P10) | `src/policy/systemPrompt.ts` | ⚙️ prompt-hash · 👤 | FDL 10/2025 · FATF |
| Adversarial probes (30 probes, 10 categories) | `web/lib/server/adversarial-probes.ts` | ⚙️ `adversarial-runner.mjs` · nightly eval | ATLAS · NIST AI RMF MEASURE |
| Bias monitoring (ratio ≤ 1.5) | `web/lib/server/bias-monitor.ts` | 🧪 · `bias-report` endpoint | FATF R.10 |
| Drift monitoring (threshold 0.15) | `web/lib/server/drift-monitor.ts` | 🧪 · governance escalation | ISO 42001 · NIST AI RMF MANAGE |
| Reasoning-mode version pinning | `src/brain/reasoning-modes.ts` | ⚙️ `check-mode-versions.mjs` | FDL 10/2025 Art.16 |
| Model risk tiering & approval | `web/lib/server/ai-governance.ts` (`MODEL_REGISTRY`) | 👤 · 🧪 | FDL 10/2025 · ISO 42001 A.6 |
| Governance-surface consistency | `scripts/validate-governance.mjs` | ⚙️ "Governance check" workflow | ISO 42001 (documented controls) |

## 4. Supply-chain & CI security gates

| Gate | Tooling | Workflow |
|---|---|---|
| Dependency advisories (HIGH+CRITICAL) | `npm audit` · Dependency Review | `ci.yml` · `dependency-review.yml` |
| SAST | Semgrep · CodeQL (+ 5 custom compliance queries) | `semgrep.yml` · `codeql.yml` |
| Secret scanning | gitleaks · GitGuardian · CI secret check | `ci.yml` |
| Container / filesystem CVEs | Trivy | `ci.yml` |
| SBOM | CycloneDX | `ci.yml` |
| Supply-chain posture | OpenSSF Scorecard · Security Insights | `scorecard.yml` · `SECURITY-INSIGHTS.yml` |
| Release provenance | SLSA attestation · Cosign signing | `release.yml` · `release-provenance.yml` |

## 5. How to keep this matrix true

This matrix is prose and can drift. When you change a control:

1. Update the implementation and its ADR (write a superseding ADR if reversing a decision).
2. Update the enforcing query/script/test.
3. Update the relevant row here and in [`FRAMEWORK_COVERAGE.md`](./FRAMEWORK_COVERAGE.md).

The [`Governance check`](../../.github/workflows/governance-check.yml) gate keeps
the *structural* surface honest (files, labels, ADR index, CODEOWNERS,
`security.txt`); the row-level accuracy of this table is a code-owner review
responsibility on any control-path change.
