# Maintainers

This file lists the accountable roles for Hawkeye Sterling and how review
ownership maps onto the codebase. It complements [`GOVERNANCE.md`](./GOVERNANCE.md)
(decision rights) and [`.github/CODEOWNERS`](./.github/CODEOWNERS) (the
machine-enforced review routing).

> Hawkeye Sterling is proprietary software maintained by a small operator team.
> Where a single accountable person discharges several roles, the **separation
> of duties** required for regulated actions (four-eyes on SAR/goAML, override,
> whitelist) is still enforced in code — it does not rely on there being
> multiple maintainers.

## Roles

| Role | Responsibility | Escalation |
|---|---|---|
| **MLRO (Chair)** | Final authority on compliance, risk-appetite, and AI-governance decisions; casting vote in committee. | Board Risk Committee |
| **Compliance Officer** | Regulatory interpretation; quarterly Board Risk Committee reporting. | MLRO |
| **Engineering Lead** | Technical design, CI integrity, release sign-off, code-owner reviews on control paths. | MLRO |
| **Data Science Lead** | Model performance, drift, calibration, and bias review. | MLRO |

The authoritative committee cadence, quorum, and voting rules live in
[`docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md`](./docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md).

## Review ownership

Required-reviewer routing is defined in [`.github/CODEOWNERS`](./.github/CODEOWNERS).
In summary, code-owner review is mandatory on:

- **Security & auth** — `enforce.ts`, `jwt.ts`, `rate-limit.ts`, `four-eyes-gate.ts`
- **Audit & egress** — `audit-chain.ts`, `egress-check.ts`, `hallucination-gate.ts`, `llm*.ts`
- **AI governance** — `ai-governance.ts`, `drift-monitor.ts`, `bias-monitor.ts`, `adversarial-probes.ts`, prompt-hash tooling
- **Compliance charter & registers** — `src/policy/`, risk-appetite / KRI / obligations registries, `docs/governance/`
- **CI / supply chain** — `.github/`, `Dockerfile`, `k8s/`

## Contact

- General & support routing: [`SUPPORT.md`](./SUPPORT.md)
- Security vulnerabilities: [`SECURITY.md`](./SECURITY.md) (private process — do not open a public issue)
- Conduct concerns: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Maintainer email: **hawkeye.sterling.v2@gmail.com** (do not send regulated data by email)

## Becoming a maintainer

This is proprietary software; maintainer access is granted by the operator under
written agreement, not by open nomination. Prospective contributors should read
[`CONTRIBUTING.md`](./CONTRIBUTING.md) first.
