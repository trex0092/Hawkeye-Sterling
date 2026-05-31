# Hawkeye Sterling — Claude Code Project Context

## Identity

Hawkeye Sterling is a production AML/CFT/sanctions/PEP/adverse-media compliance platform.
Regulatory targets: UAE FDL No.20/2018, FDL No.10/2025 (AI governance), Cabinet Decision No.10/2019, FATF Methodology.
Operator: enterprise and regulator-grade financial institutions.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 / React 19 / Tailwind CSS |
| Backend | Next.js App Router route handlers (Node 22) |
| Brain | 481 TypeScript files, 15 faculties, 1475 reasoning modes (`src/brain/`) |
| AI | Anthropic Claude primary + Groq cost fallback via `src/integrations/model-router.ts` |
| DB | MoonDB primary, Netlify Blobs (audit/lists/cache), Upstash Redis (rate limiting) |
| Deployment | Netlify serverless + standalone Docker (`Dockerfile`) + k8s (`k8s/`) |
| Auth | HMAC-SHA256 sessions + JWT HS256 dual-secret + Ed25519 regulator tokens |
| Audit | Dual-chain: append-only HMAC-SHA256 blobs + per-request signing |
| Tests | Vitest unit/integration, Playwright E2E |
| CI | GitHub Actions: lint + typecheck + tests + Semgrep + CodeQL + Trivy + SBOM + prompt-hash |
| Observability | OTel spans (7 boundary points) + 14 Prometheus metrics families + JSON structured logging |

## Architecture Invariants (never break these)

1. **Fail-closed auth**: Every compliance route calls `enforce(req)` (requireAuth defaults to true). Anonymous callers get 401 unless explicitly opted in with `{ requireAuth: false }`.
2. **Audit chain is append-only**: `writeAuditChainEntry()` must be called for every AI decision, screening result, SAR filing, four-eyes action, and egress check. Never bypass.
3. **Dual-secret JWT rotation**: `JWT_SIGNING_SECRET_PREV` path in `jwt.ts` must remain for zero-downtime rotation. Do not collapse to single-secret.
4. **Egress gate is fail-closed**: Missing `ANTHROPIC_API_KEY`, LLM failure, or parse failure returns `held_review` — never `allowed`.
5. **Hallucination gate is fire-and-forget**: It must not block the response path. Any await must be wrapped in `void ... .catch(...)`.
6. **OTel spans use no-op tracer**: `web/lib/server/tracer.ts` wraps the real tracer with a no-op fallback so spans never throw at runtime.
7. **Prometheus metrics are family-grouped**: In `web/app/api/metrics/route.ts`, `# HELP`/`# TYPE` emitted once per metric family, not per label set.
8. **Prompt hashes are CI-validated**: Every `SYSTEM_PROMPT` constant must appear in `scripts/prompt-hash-manifest.json`. Run `node scripts/validate-prompt-hashes.mjs` to verify.
9. **Model registry has riskTier + approval**: All entries in `MODEL_REGISTRY` (`web/lib/server/ai-governance.ts`) must have `riskTier`, `approval`, and `cardRef` populated.
10. **Four-eyes TOCTOU protection**: The `signOff()` function re-reads the record under write lock — never trust in-memory state for approval decisions.

## Key File Locations

| Purpose | File |
|---|---|
| Auth enforcement middleware | `web/lib/server/enforce.ts` |
| JWT sign/verify + dual rotation | `web/lib/server/jwt.ts` |
| Audit chain | `web/lib/server/audit-chain.ts` |
| Drift monitor | `web/lib/server/drift-monitor.ts` |
| Bias monitor | `web/lib/server/bias-monitor.ts` |
| AI governance registry | `web/lib/server/ai-governance.ts` |
| OTel no-op tracer | `web/lib/server/tracer.ts` |
| In-process metrics store | `web/lib/server/metrics-store.ts` |
| Metrics endpoint (Prometheus + JSON) | `web/app/api/metrics/route.ts` |
| LLM pipeline (PII redact→Claude→rehydrate) | `web/lib/server/llm.ts` |
| LLM fallback wrapper | `web/lib/server/llm-fallback.ts` |
| Hallucination gate | `web/lib/server/hallucination-gate.ts` |
| Egress tipping-off gate | `web/lib/server/egress-check.ts` |
| Adversarial probes (16 probes, 6 categories) | `web/lib/server/adversarial-probes.ts` |
| Circuit breaker | `web/lib/server/circuitBreaker.ts` |
| Rate limiting | `web/lib/server/rate-limit.ts` |
| Four-eyes gate | `web/lib/server/four-eyes-gate.ts` |
| Compliance charter / system prompt | `src/policy/systemPrompt.ts` |
| Model router (Claude + Groq) | `src/integrations/model-router.ts` |
| Eval harness (50 scenarios) | `src/brain/registry/eval-harness.ts` |
| Prompt hash manifest | `scripts/prompt-hash-manifest.json` |
| Prompt hash validator | `scripts/validate-prompt-hashes.mjs` |
| Brain integrity check | `scripts/brain-audit.mjs` |
| Lethal trifecta check | `scripts/lethal-trifecta-check.mjs` |
| Compliance gaps tracker | `COMPLIANCE_GAPS.md` |
| Incident runbook | `docs/INCIDENT-RECOVERY.md` |
| Incident log | `docs/INCIDENTS.md` |
| SOC2 mapping | `docs/SOC2.md` |
| AI governance policy | `docs/governance/AI_GOVERNANCE_POLICY.md` |
| CI pipeline | `.github/workflows/ci.yml` |
| CodeQL workflow | `.github/workflows/codeql.yml` |
| SLSA release workflow | `.github/workflows/release.yml` |
| K8s manifests | `k8s/` |
| Hardened Dockerfile | `Dockerfile` |

## Forbidden Patterns

- **Never** `enforce(req)` with `requireAuth: false` on a route that handles regulated data.
- **Never** log raw IP addresses — always HMAC-hash with `anonIpKey()`.
- **Never** log API key values — use `keyIdPrefix: plaintext.slice(0, 8)` at most.
- **Never** trust the first value in `X-Forwarded-For` — always use the last (proxy-appended) IP.
- **Never** use `alg: none` or accept non-HS256 JWTs — `jwt.ts` pins to HS256.
- **Never** call `writeAuditChainEntry()` without a tenantId — use `tenantIdFromGate(gate)`.
- **Never** return `allowed: true` from egress gate on an error path.
- **Never** emit `# HELP`/`# TYPE` more than once per Prometheus metric family.
- **Never** amend published commits (`--amend` on pushed commits).
- **Never** force-push main/master.
- **Never** skip pre-commit hooks (`--no-verify`).

## Test Commands

```bash
# Typecheck (run from repo root)
npm run typecheck

# Unit tests
npx vitest run

# Integration tests
npx vitest run --config vitest.integration.ts

# Brain integrity
npm run brain:audit

# Lethal trifecta governance check
node scripts/lethal-trifecta-check.mjs

# Prompt hash integrity (FDL 10/2025 Art.18)
node scripts/validate-prompt-hashes.mjs

# Lint (from web/)
cd web && npm run lint

# E2E tests
cd web && npx playwright test
```

## CI Steps (in order)

1. `lint` — ESLint max-warnings=0 on web/
2. `typecheck` — tsc --noEmit root + web
3. `test` — vitest unit suite
4. `security-audit` — npm audit HIGH+CRITICAL, secret scan, Trivy fs, SBOM
5. `semgrep` — SAST p/typescript + p/nodejs + p/nextjs
6. `codeql` — weekly + on PR to main
7. Prompt hash integrity check (FDL 10/2025 Art.18)
8. Integration tests (requires ANTHROPIC_API_KEY secret)

## Compliance References

| Regulation | Key Article | Implementation |
|---|---|---|
| UAE FDL 20/2018 | Art.18 (CDD) | `screening/run`, `quick-screen`, `smart-disambiguate` |
| UAE FDL 10/2025 | Art.18 (AI audit trail) | `audit-chain.ts`, prompt-hash-manifest, model registry |
| FATF R.10 | Non-discrimination | `bias-monitor.ts`, `bias-report` endpoint, biasRatio ≤ 1.5 |
| FATF R.16 | Wire transfer data | `screening/run` + `goaml` |
| Cabinet Decision 10/2019 | STR filing | `sar-report`, `goaml` + egress gate |
| SOC2 CC7.4 | Incident response | `docs/INCIDENT-RECOVERY.md` |
| SOC2 CC6.1 | Logical access | `enforce.ts` fail-closed auth |

## Open Compliance Gaps

See `COMPLIANCE_GAPS.md` for full details. As of 2026-05-31:

**Open / Partial (require operator or MLRO action):**
- CG-2 (false-positive whitelist): PARTIAL — mechanism implemented; MLRO workflow approval pending
- CG-3 (periodic re-screening): PARTIAL — cadences implemented; enrollment confirmation pending
- CG-4 (goAML entity IDs): OPEN — `REPLACE_ME` placeholders in env; operator must set real goAML Rentity IDs
- CG-6 (audit chain 10-yr retention): PARTIAL — S3/WORM backup implemented; MLRO/CTO must configure bucket + sign off
- CG-8 (HSTS preload): OPEN — operator must submit domain to hstspreload.org
- CG-BIAS-001 (bias threshold): DELIBERATE DEVIATION — threshold 1.15 (tighter than FATF floor 1.5); MLRO acknowledgement required

**Closed:**
- CG-1 CLOSED 2026-05-26 — requireAuth:true on /api/quick-screen; auth coverage gate enforces it in CI
- CG-5 CLOSED 2026-05-26 — fonts.bunny.net confirmed GDPR/PDPL compliant
- CG-7 CLOSED 2026-05-26 — egressGate wired to SAR/goAML narrative routes
- CG-9 CLOSED 2026-05-27 — requireRole() RBAC on SAR, goAML, four-eyes, ai-override
- CG-GOV-001 CLOSED 2026-05-31 — all 463 reasoning modes have explicit version pins; CI gate passes
