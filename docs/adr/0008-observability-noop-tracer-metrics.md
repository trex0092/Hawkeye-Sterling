# ADR-0008: No-op-safe tracing and family-grouped metrics

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** Engineering Lead, MLRO
- **Governance-impacting:** Yes
- **Regulatory anchor:** SOC 2 CC7.x (monitoring); ISO/IEC 42001 (operation & performance monitoring)

## Context

Observability is required to evidence that controls run and to detect drift and
incidents — but it must never become a failure mode itself. Two risks matter on
a fail-closed compliance platform: (1) a tracing backend that is misconfigured or
absent must not throw on the request path and take down a regulated route; and
(2) a Prometheus endpoint that emits malformed exposition (duplicate `# HELP` /
`# TYPE` lines per label set) breaks scrapers and blinds monitoring.

## Decision

- **No-op-safe tracer** — `web/lib/server/tracer.ts` wraps the real OTel tracer
  with a no-op fallback, so spans never throw at runtime even if the exporter is
  unconfigured or failing. Boundary spans are best-effort telemetry, never a
  dependency of the response.
- **Family-grouped metrics** — in `web/app/api/metrics/route.ts`, `# HELP` and
  `# TYPE` are emitted **once per metric family**, not once per label set, so the
  Prometheus exposition is valid regardless of cardinality.
- Metrics carry no regulated data (C4/C3); IP-derived labels are HMAC-hashed.

## Consequences

- Telemetry degrades to no-op under backend failure instead of propagating an
  error onto a regulated route — consistent with the fail-closed posture
  (ADR-0002).
- The metrics endpoint stays scrapeable at any label cardinality; monitoring and
  drift/bias alerting remain reliable.
- These are invariants (see [`CLAUDE.md`](../../CLAUDE.md) #6, #7); reintroducing
  a throwing tracer or per-label-set `# HELP`/`# TYPE` is a regression.
- Slight loss of fidelity when the tracer is in no-op mode is accepted — a
  visible exporter-health signal, not a runtime failure.

## Alternatives considered

- **Hard-fail on tracer errors** — surfaces misconfig loudly but risks taking
  down regulated routes; rejected for a fail-closed platform.
- **Per-series `# HELP`/`# TYPE`** — simpler emitter code but produces invalid
  Prometheus exposition; rejected.
