# Support

Thanks for using Hawkeye Sterling. This page explains where to get help and how
to route different kinds of requests so they reach the right place.

> Hawkeye Sterling processes regulated AML/CFT data. **Never** include real
> customer PII, sanctions hits, SAR/STR content, secrets, or API keys in any
> issue, discussion, or email. Redact first.

## Choose the right channel

| I want to… | Use |
|---|---|
| Report a **bug** or defect | Open a [Bug report issue](../../issues/new?template=bug_report.md) |
| Track a **regulatory / control gap** | Open a [Compliance gap issue](../../issues/new?template=compliance_gap.md) |
| Propose a **feature or enhancement** | Open a [Feature request issue](../../issues/new?template=feature_request.md) |
| Report a **security vulnerability** | **Do not open a public issue** — follow [`SECURITY.md`](./SECURITY.md) |
| Report suspected **regulated-data disclosure** | Treat as an incident — [`SECURITY.md`](./SECURITY.md) + [`docs/INCIDENT-RECOVERY.md`](./docs/INCIDENT-RECOVERY.md) |
| Raise a **conduct** concern | Email the maintainer per [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |
| Ask **how something works** | Read the docs below, then open a question issue if still stuck |

## Before you open an issue

1. **Search existing issues** — your question may already be answered.
2. **Check the documentation** (below).
3. Use the **matching issue template** and fill it in completely — it captures
   the context needed to act.

## Documentation

- **Overview & architecture** — [`README.md`](./README.md)
- **Architecture invariants & forbidden patterns** — [`CLAUDE.md`](./CLAUDE.md)
- **Contributing & local gate** — [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- **Project governance & decision rights** — [`GOVERNANCE.md`](./GOVERNANCE.md)
- **Security policy** — [`SECURITY.md`](./SECURITY.md)
- **Compliance gaps (live)** — [`COMPLIANCE_GAPS.md`](./COMPLIANCE_GAPS.md)
- **Environment variables** — [`docs/ENV_VARS_REQUIRED.md`](./docs/ENV_VARS_REQUIRED.md)
- **Incident runbook** — [`docs/INCIDENT-RECOVERY.md`](./docs/INCIDENT-RECOVERY.md)
- **Governance policy & registers** — [`docs/governance/`](./docs/governance/)

## Getting started locally

```bash
npm install
npm run typecheck          # strict TS, zero errors
npm test                   # vitest unit suite
cd web && npm run lint     # ESLint, max-warnings=0
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full pre-push gate.

## Response expectations

This is proprietary software maintained by a small operator team. Issues are
triaged on a best-effort basis; **security reports are prioritised** and
acknowledged promptly per [`SECURITY.md`](./SECURITY.md). There is no commercial
support SLA implied by this document — contractual SLAs, where they exist, are
defined in [`docs/SLA.md`](./docs/SLA.md).

## General contact

For anything that does not fit a channel above, email
**hawkeye.sterling.v2@gmail.com**. Do not send regulated data by email.
