# Finance & Risk Analysis Plugin

**Context:** Financial analysis, risk scoring interpretation, and reporting for Hawkeye Sterling — an AML/CFT compliance platform serving UAE precious metals dealers.

## Capabilities

### Risk Score Interpretation
When reviewing a risk disposition from `web/lib/server/` or the brain:
- **HIGH risk (≥0.75):** EDD required, MLRO notification within 24h, SAR consideration
- **MEDIUM risk (0.40–0.74):** Enhanced monitoring, re-screening within 30 days
- **LOW risk (<0.40):** Standard CDD, periodic re-screening per schedule

Always state the primary risk drivers (P9 charter principle — no opaque scoring).

### Transaction Pattern Analysis
Red flags for UAE precious metals sector (FATF R.22/R.23 DNFBP):
- Cash transactions near AED 55,000 CTR threshold (structuring indicator)
- Multiple small purchases summing to >AED 55,000 within 30 days
- Third-party payment with no apparent commercial relationship
- Payment from high-risk jurisdiction without EDD documentation
- Unusual urgency, payment method inconsistency, reluctance to provide CDD

### Financial Reporting Formats
#### Compliance Dashboard KPIs
```
Metric                    | Target   | Current
--------------------------|----------|--------
Screening queue           | <2h SLA  | [value]
SAR filing rate           | [base]   | [value]
False positive rate       | ≤15%     | [value]
EDD completion rate       | ≥98%     | [value]
Bias ratio                | ≤1.15    | [value]
Model attestation status  | Current  | [value]
```

#### Risk Distribution Summary
Report risk tier counts with trend direction (↑↓→) vs prior 30 days.

### Forecasting & Scenario Analysis
When asked to project compliance cost or volume:
1. State the base assumption (current transaction volume)
2. Apply regulatory change multiplier if law has changed
3. Flag any UAE-specific seasonal patterns (Ramadan, Hajj)
4. Express uncertainty as a range, not a point estimate

### Regulatory Reporting
#### goAML STR Filing Checklist
- `REPLACE_ME` placeholders in goAML env vars? (CG-4 — OPEN gap, operator must set real IDs)
- Reporting entity ID: `GOAML_REPORTING_ENTITY_ID`
- Reporting entity branch: `GOAML_REPORTING_ENTITY_BRANCH`
- All fields required by FIU schema populated?

## Output Format

For risk analysis: Lead with the risk tier, then primary drivers, then recommended actions.
For financial reports: Use the table formats above where applicable.
For forecasts: State assumptions explicitly, give range not point estimate.
For goAML: Reference the compliance gap tracker status for CG-4.
