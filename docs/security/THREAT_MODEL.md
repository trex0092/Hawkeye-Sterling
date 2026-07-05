# Threat Model — Hawkeye Sterling

> Scope: the compliance control plane — auth, audit chain, egress/tipping-off,
> four-eyes, the LLM pipeline, and the AI-governance surface. This document is a
> living artifact; material changes are recorded as ADRs (`docs/adr/`) and, where
> governance-impacting, committee minutes.
>
> Frameworks applied: **STRIDE** (design threats), **MITRE ATT&CK** (adversary
> TTPs), **MITRE ATLAS** (AI-specific adversarial ML), and **NIST AI RMF**
> (GOVERN / MAP / MEASURE / MANAGE).

## 1. Assets

| Asset | Sensitivity | Primary protection |
|---|---|---|
| Customer PII / screening subjects | Regulated (highest) | PII redaction before egress; no raw PII in logs |
| Sanctions/PEP/adverse-media findings | Regulated | Fail-closed auth; append-only audit |
| SAR/STR & goAML narratives | Regulated + tipping-off risk | Egress gate (`held_review` default); four-eyes |
| Audit chain | Evidentiary | Append-only HMAC-SHA256 dual chain (ADR-0003) |
| Signing secrets / API keys | Secret | Never logged; dual-secret JWT rotation (ADR-0004) |
| Compliance charter / system prompts | Integrity-critical | Prompt-hash manifest, CI-validated (FDL 10/2025 Art.18) |
| Model registry & governance config | Integrity-critical | riskTier + approval fields; code-owner review |

## 2. Trust boundaries

1. **Anonymous → authenticated** — every regulated route crosses `enforce(req)`
   (fail-closed, default `requireAuth: true`).
2. **Application → LLM provider** — PII is redacted before the prompt leaves the
   process; the response is rehydrated inside the boundary; egress narratives
   pass the tipping-off gate.
3. **Application → external sinks** (Asana, goAML, blobs) — egress-checked and
   audit-logged.
4. **Reverse proxy → app** — client IP taken from the **last** `X-Forwarded-For`
   hop (proxy-appended), never the first (spoofable), and HMAC-hashed.

## 3. STRIDE analysis

| Threat | Example | Mitigation | Invariant / ADR |
|---|---|---|---|
| **Spoofing** | Forged/`alg:none` JWT | HS256 pinned; `alg:none` rejected; dual-secret verify | #3 / ADR-0004 |
| **Tampering** | Altering an audit entry | Append-only dual chain; per-request signing | #2 / ADR-0003 |
| **Repudiation** | Denying an AI decision | Every decision writes an audit entry with `tenantId` | #2 / ADR-0003 |
| **Information disclosure** | PII leaking to the model or logs | Redact→model→rehydrate; IPs HMAC-hashed; keys never logged | LLM pipeline |
| **Denial of service** | Flooding a screening route | Rate limiting; circuit breaker | `rate-limit.ts` |
| **Elevation of privilege** | Single actor filing a SAR | Four-eyes + SoD; `requireRole()` RBAC | #10 / ADR-0005 |
| **Tipping-off (domain-specific)** | Narrative reveals a filing to the subject | Egress gate fails closed to `held_review` | #4 / ADR-0002 |

## 4. AI-specific threats (MITRE ATLAS / NIST AI RMF)

| Threat | Vector | Mitigation |
|---|---|---|
| Prompt injection | Adverse-media text steering the model | Charter forbids fabrication/legal conclusions/tipping-off; adversarial-probe suite (30 probes, 10 categories); hallucination gate |
| Model evasion / jailbreak | Crafted input to bypass the charter | Adversarial probes in CI; output governance |
| Hallucinated findings | Model asserts unsupported risk | Hallucination gate (fire-and-forget, non-blocking); reasoning-chain persistence |
| Prompt/charter tampering | Silent change to system prompt | Prompt-hash manifest CI-validated (FDL 10/2025 Art.18) |
| Model/data drift | Distribution shift degrades calibration | Drift monitor (threshold 0.15) → governance escalation |
| Discriminatory output | Biased screening outcomes | Bias monitor; FATF R.10 bias ratio floor ≤ 1.5 enforced in code |
| Supply-chain compromise of a model | Unvetted model added | Model registry requires `riskTier` + `approval` + `cardRef` (#9) |

## 5. Adversary TTP mapping (MITRE ATT&CK, illustrative)

- **Initial Access / Valid Accounts (T1078)** → fail-closed auth + RBAC + rate limiting.
- **Credential Access (T1552 — secrets in files/logs)** → secret scanning (gitleaks, GitGuardian), keys never logged.
- **Collection / Exfiltration (TA0010)** → egress gate + audit on every external sink; SBOM + dependency review on the supply chain.
- **Defense Evasion (T1562 — impair defenses)** → append-only audit; invariants enforced by CodeQL queries that fail the build.

## 6. Residual risks & assumptions

- **LLM provider trust** — the provider is assumed not to persist redacted
  prompts beyond its stated policy; PII is redacted pre-egress regardless.
- **Operator accountabilities** — HS1–HS6 goAML Rentity IDs, retention posture,
  and enrolment-scaling load remain operator obligations (see `COMPLIANCE_GAPS.md`).
- **Availability trade-off** — hard dependency outages degrade to `held_review` /
  `401` rather than fail open; accepted per ADR-0002.

## 7. Verification

Threat mitigations are continuously exercised: fail-closed auth (auth-coverage
gate + CodeQL `missing-enforce-call.ql`), egress (`egress-allowed-on-error.ql`),
XFF handling (`first-forwarded-for.ql`), log hygiene (`raw-ip-logged.ql`), JWT
locality (`jwt-decode-outside-jwt-ts.ql`), and the adversarial-probe suite — all
in CI. See [`.github/codeql/`](../../.github/codeql/) and [`CLAUDE.md`](../../CLAUDE.md).
