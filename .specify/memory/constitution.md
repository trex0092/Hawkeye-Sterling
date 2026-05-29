# Hawkeye Sterling — Specification Constitution

This constitution governs all AI-assisted development on this repository.
Every specification, plan, and implementation decision must comply with these principles.

---

## Article 1 — Regulatory Primacy

1.1 UAE FDL No.20/2018 and FDL No.10/2025 are supreme constraints. Any feature that would violate these laws must be refused regardless of business pressure.

1.2 FATF Methodology (R.10 non-discrimination, R.16 wire transfer, R.20 STR) requirements are non-negotiable minimum controls.

1.3 Every AI-generated compliance decision must be traceable to a human-readable audit entry in the append-only HMAC-SHA256 chain.

1.4 No compliance decision (sanctions hit, SAR filing, PEP match) may be taken by AI alone. The system surfaces risk; human MLRO disposition is always required for enforcement actions.

---

## Article 2 — Security Invariants

2.1 Authentication is fail-closed. Unauthenticated requests to compliance routes return 401. There is no "grace" mode that admits anonymous traffic to regulated endpoints.

2.2 The JWT HS256 implementation pins `alg` server-side. Accepting `alg: none` or any non-HS256 token is permanently forbidden.

2.3 PII (names, identifiers, addresses) must be redacted before transmission to any external LLM API. The `llm.ts` pipeline's redact→Claude→rehydrate pattern is mandatory.

2.4 IP addresses in logs must be HMAC-hashed with a per-deployment key. Raw IPs are never logged.

2.5 The last value of `X-Forwarded-For` is authoritative (proxy-appended). The first value is client-supplied and must never be trusted for rate limiting or audit purposes.

2.6 Secrets are never committed. `.env*` files are gitignored. Sensitive values in CI use GitHub Secrets.

---

## Article 3 — Audit Trail Obligations

3.1 The audit chain (`audit-chain.ts`) is append-only. No implementation may delete, overwrite, or backdate entries.

3.2 Every AI decision must record: `modelId`, `promptVersion`, `promptHash`, `tenantId`, `actor`, `timestamp`, `verdict`, and the sanitized input summary.

3.3 Prompt versions must have a SHA-256 hash registered in `scripts/prompt-hash-manifest.json`. CI enforces this at build time.

3.4 Model registry entries must have `riskTier`, `approval.approvedBy`, `approval.approvedAt`, and `approval.nextAttestationDue` populated. High/critical models with overdue attestation must trigger a 503 from the risk-register endpoint.

---

## Article 4 — AI Governance

4.1 The model registry (`ai-governance.ts`) is the authoritative source for which AI models are approved for production use. No model may be called in a compliance context that is not registered.

4.2 Hallucination detection is mandatory for high-stakes routes (`ai-decision`, `mlro-advisor`). It runs fire-and-forget post-response and writes to the audit chain if detected.

4.3 Adversarial probes (12 probes, 6 categories in `adversarial-probes.ts`) must pass in CI before any prompt change is merged to main.

4.4 Bias monitoring (`bias-monitor.ts`) tracks 9 script groups over a rolling 30-day window. `biasRatio > 1.5` for any group is a FATF R.10 discriminatory screening incident requiring MLRO notification.

4.5 Drift monitoring (`drift-monitor.ts`) tracks verdict distribution shifts. Threshold crossings write to the audit chain and increment `hawkeye_drift_alert_total`.

---

## Article 5 — Data Handling

5.1 Tenant data is isolated by `tenantId` in all Blob keys, database queries, audit entries, and cache namespaces.

5.2 GDPR/PDPL subject erasure requests (CG-6, open gap) must be tracked. Until CG-6 is closed, erasure requests must be routed to the MLRO for manual handling.

5.3 Data retention: audit chain entries are subject to 10-year retention under UAE AML law. Netlify Blobs retention must be contractually confirmed before go-live.

5.4 goAML XML exports must use live entity IDs in production (CG-4 open gap). Test entity IDs from `.env.example` must never reach the UAE CBUAE Financial Intelligence Unit.

---

## Article 6 — Incident Response

6.1 Every production incident must be logged in `docs/INCIDENTS.md` with severity, detected-by, runbook reference, TTR, and MLRO notification confirmation.

6.2 Incident runbooks are maintained in `docs/INCIDENT-RECOVERY.md`. Sections: §1 deployment rollback, §2 API key revocation, §3 rate-limit storm, §4 audit chain integrity failure, §5 LLM API outage, §6 bias alert, §7 data breach, §8 secret rotation, §9 AI model incident, §10 attestation overdue.

6.3 AI model incidents (§9): if `ai.hallucination_detected` appears in audit chain with severity `high`, suspend the route, notify MLRO, and do not resume until a new adversarial probe run passes.

---

## Article 7 — Code Quality

7.1 TypeScript strict mode is mandatory. `any` casts require a comment explaining why the type is unknowable.

7.2 Comments explain WHY (hidden constraint, subtle invariant, regulatory obligation) — never WHAT the code does.

7.3 No feature flags, backwards-compatibility shims, or half-finished implementations may be merged.

7.4 Every new compliance-critical function must have a unit test. Tests must cover: happy path, fail-closed path (missing config/error), and at least one adversarial input.

7.5 The `enforce()` call signature: always use `opts.requireAuth ?? true` defaulting — never pass `{ requireAuth: false }` to a compliance route.

---

## Article 8 — Observability

8.1 OTel spans wrap every compliance decision boundary: `enforce()`, `writeAuditChainEntry()`, `computeDriftReport()`, `computeBiasReport()`, LLM call, `signOff()`, `egressGate.check()`.

8.2 The no-op tracer in `web/lib/server/tracer.ts` ensures spans never throw at runtime when OTel is unavailable. Import from this wrapper, never directly from `@opentelemetry/api`.

8.3 Prometheus metrics families are grouped: one `# HELP`/`# TYPE` declaration per family name, all label-set samples beneath it.

8.4 All 14 metric families (`hawkeye_uptime_seconds`, `hawkeye_redis_configured`, `hawkeye_build_info`, `hawkeye_circuit_breaker_open`, `hawkeye_llm_tokens_total`, `hawkeye_rate_limit_rejections_total`, `hawkeye_audit_chain_entries_total`, `hawkeye_hallucination_detected_total`, `hawkeye_screening_decisions_total`, `hawkeye_drift_alert_total`, `hawkeye_bias_alert_total`, `hawkeye_auth_failures_total`, `hawkeye_jwt_signed_with_prev_key_total`, `hawkeye_llm_fallback_total`) must remain instrumented.

---

## Amendment Protocol

Changes to this constitution require:
1. A written justification referencing the regulatory or architectural reason
2. MLRO review for Articles 1–5
3. CTO review for Articles 6–8
4. The change committed with `constitution: amend article N — <reason>` prefix in the commit message
