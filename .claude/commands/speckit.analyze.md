# /speckit.analyze

Analyze the current state of the Hawkeye Sterling codebase against compliance, security, and architecture targets.

## Usage

```
/speckit.analyze
/speckit.analyze <dimension>
```

Dimensions: `compliance`, `security`, `ai-governance`, `observability`, `test-coverage`, `gaps`

## Default (no dimension): Full Analysis

Score each dimension 0–100 and produce a gap list with severity:
- **CRITICAL** — regulatory violation or security exploit
- **HIGH** — audit trail failure or auth bypass
- **MEDIUM** — missing observability or test coverage
- **LOW** — documentation gap or code quality

## Per-Dimension Analysis

**`compliance`**: Check COMPLIANCE_GAPS.md open items, verify audit chain for all decision types, check egress gate wiring

**`security`**: Auth enforcement coverage, JWT dual-rotation, PII redaction paths, CSP headers, rate-limit strict mode

**`ai-governance`**: Model registry completeness, attestation status, prompt hash freshness, hallucination gate wiring, bias/drift thresholds configurable

**`observability`**: OTel span coverage at 7 boundaries, all 14 Prometheus families incremented, structured logging completeness

**`test-coverage`**: Vitest unit coverage for compliance-critical paths, integration test admin guard coverage, adversarial probe CI coverage, E2E spec count

**`gaps`**: Read `COMPLIANCE_GAPS.md` and summarize open items with CG number, severity, and next action

## Output

Table with dimension, score, top-3 gaps, and recommended next actions.
