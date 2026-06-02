# Analytics & Observability Plugin

**Context:** Metrics, dashboards, KPI analysis, and observability for Hawkeye Sterling. The platform exposes 14 Prometheus metric families, OTel spans at 7 boundary points, and JSON structured logs.

## Capabilities

### Prometheus Metrics Analysis
The metrics endpoint is `web/app/api/metrics/route.ts`. Key metric families:

| Family | Type | Description |
|--------|------|-------------|
| `hawkeye_screening_requests_total` | Counter | Screening requests by outcome |
| `hawkeye_screening_latency_ms` | Histogram | End-to-end screening latency |
| `hawkeye_llm_requests_total` | Counter | LLM calls by model and status |
| `hawkeye_llm_latency_ms` | Histogram | LLM response latency |
| `hawkeye_audit_entries_total` | Counter | Audit chain entries written |
| `hawkeye_bias_ratio` | Gauge | Current bias ratio (target ≤1.15) |
| `hawkeye_sar_filings_total` | Counter | SAR filings by status |
| `hawkeye_egress_checks_total` | Counter | Egress gate decisions |
| `hawkeye_circuit_breaker_state` | Gauge | Circuit breaker open/closed |
| `hawkeye_adversarial_probes_total` | Counter | Probe pass/fail by category |
| `hawkeye_four_eyes_actions_total` | Counter | Four-eyes gate decisions |
| `hawkeye_rate_limit_hits_total` | Counter | Rate limit events by endpoint |
| `hawkeye_drift_score` | Gauge | Model drift score (target <0.1) |
| `hawkeye_model_attestation_overdue` | Gauge | Models with overdue attestation |

**Important invariant:** `# HELP`/`# TYPE` must be emitted once per family, not per label set.

### Dashboard Design for Compliance UIs
For a compliance dashboard panel, prioritize:
1. **Operational health** (screening queue depth, SLA adherence, error rate)
2. **Risk distribution** (daily high/medium/low counts with trend)
3. **Regulatory exposure** (SAR filing pipeline, overdue EDD items)
4. **AI governance** (bias ratio, drift score, attestation status)
5. **Security** (adversarial probe pass rate, circuit breaker state)

Use red/amber/green RAG status: red = action required, amber = monitor, green = nominal.

### KPI Analysis
When analyzing a set of metrics:
1. Establish baseline (30-day rolling average)
2. Flag anomalies (>2σ from baseline)
3. Correlate with external events (regulatory changes, high-volume periods)
4. Recommend action threshold vs observation threshold

### OTel Span Analysis
Seven boundary points are instrumented:
1. API route entry (request received)
2. Auth enforcement (`enforce.ts`)
3. Rate limit check
4. LLM call start/end
5. Audit chain write
6. Egress gate check
7. Response sent

For latency debugging: trace from boundary point 1→7. Common bottlenecks:
- LLM P95 latency (boundary 4) — check model routing in `src/integrations/model-router.ts`
- Audit chain write (boundary 5) — check blob storage latency
- Egress gate (boundary 6) — check if hallucination gate is accidentally blocking

### Bias Reporting
The bias monitor is at `web/lib/server/bias-monitor.ts`. When reviewing bias metrics:
- Target: biasRatio ≤ 1.15 (platform deliberate deviation — tighter than FATF floor of 1.5)
- MLRO acknowledgement required for this deviation (CG-BIAS-001)
- If biasRatio > 1.15: immediate MLRO notification required
- Breakdown by: nationality, jurisdiction, entity type

## Output Format

For metric analysis: Lead with anomaly count, then RAG status table, then top 3 recommended actions.
For dashboard design: Describe panel layout with priority order and RAG thresholds.
For bias reports: State current ratio, trend direction, and MLRO action required if threshold breached.
