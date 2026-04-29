# Code Review: yas304/SENTINTEL-AI-DRIFT-AUDITOR

**Repository:** https://github.com/yas304/SENTINTEL-AI-DRIFT-AUDITOR  
**Stars:** 0 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

SENTINTEL-AI-DRIFT-AUDITOR is an AI governance tool that audits deployed ML models for statistical bias, model drift, and explainability gaps, generating audit-ready compliance reports with visualisations. It targets the regulatory gap between deploying an ML model and demonstrating to regulators (and internal model risk management) that the model remains fair, accurate, and explainable over time. It covers three audit dimensions: drift detection (data distribution shift), bias analysis (protected group disparity), and SHAP-based explainability.

For Hawkeye Sterling, this is the **model introspection and bias-audit faculty** for `src/brain` — enabling the ML components of the screening engine (risk scoring, anomaly detection, Benford analysis) to be audited for drift and discriminatory bias in accordance with emerging AI governance requirements (EU AI Act, FATF AI guidance).

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: deployed ML model + production prediction dataset
       + reference (training) dataset
       + protected attribute definitions (nationality, age, gender)
    ↓
SENTINTEL Audit Engine (Python)
    ├── Drift Detection
    │       ├── PSI (Population Stability Index) per feature
    │       │       PSI < 0.10: stable
    │       │       PSI 0.10–0.25: moderate drift
    │       │       PSI > 0.25: significant drift → retrain flag
    │       ├── KL divergence (distribution shift)
    │       └── Prediction drift (score distribution shift over time)
    ├── Bias Analysis
    │       ├── Demographic parity difference (per protected group)
    │       ├── Equal opportunity difference (TPR disparity)
    │       ├── Disparate impact ratio
    │       │       DI ratio < 0.80 → adverse impact threshold (80% rule)
    │       └── Protected attribute: nationality, PEP-status, entity type
    ├── Explainability
    │       ├── SHAP values (per feature, per prediction)
    │       ├── Global feature importance ranking
    │       └── Per-prediction explanation: "high risk because..."
    └── Report Generation
            PDF + HTML audit report
            Visualisations: feature drift charts, bias heatmaps, SHAP waterfalls
            Audit trail: model version, evaluation date, dataset statistics
    ↓
Output: audit_report_{model}_{date}.pdf + compliance_summary.json
```

**Python audit call:**
```python
from sentintel import ModelAuditor

auditor = ModelAuditor(
    model=risk_scoring_model,
    reference_data=training_dataset,
    production_data=last_30_days_predictions,
    protected_attrs=['nationality', 'entity_type', 'pep_status']
)

report = auditor.run_full_audit()
# report.drift_flags: [{ feature: "tx_amount", psi: 0.31, severity: "HIGH" }]
# report.bias_flags:  [{ group: "nationality=IR", di_ratio: 0.71, ... }]
# report.shap_top5:   [("tx_velocity", 0.42), ("counterparty_jurisdiction", 0.28), ...]
```

---

## Strengths

### 1. PSI-Based Drift Detection Is Operationally Standard

Population Stability Index is the industry-standard metric for model monitoring in financial services (Basel III model risk management, SR 11-7 guidance). A PSI > 0.25 trigger is directly aligned with what model risk management (MRM) teams expect in a bank. Implementing PSI-based drift monitoring makes Hawkeye Sterling's AI components auditable under standard MRM frameworks.

### 2. Bias Analysis Against Nationality — AML-Specific Risk

AML risk models trained on historical data can inadvertently learn to flag transactions by nationality rather than by genuine risk indicators — reproducing human examiner biases. This is a regulatory risk under the EU AI Act (Article 10: data quality) and a reputational risk. Nationality should be a feature for jurisdiction risk assessment, not a proxy for individual risk that overrides transactional signals. The bias audit detects whether the model is effectively penalising nationality beyond what jurisdiction risk alone justifies.

### 3. SHAP Explainability for SAR Narrative Support

When filing a SAR, the compliance officer must articulate why the activity was suspicious. If the suspicion originates from an ML risk score, SHAP values provide a human-readable decomposition: "the high risk score was driven primarily by transaction velocity (42%) and counterparty jurisdiction (28%) rather than transaction amount (8%)." This is directly usable as supporting narrative in a SAR.

### 4. Audit-Ready Report Generation

Regulators (FCA, FinCEN, BaFin) increasingly request evidence that financial institutions monitor their AI models for bias and drift. A PDF audit report with visualisations and timestamped model version information is the expected artefact for regulatory examination. Generating this automatically removes a significant compliance documentation burden.

---

## Issues and Concerns

### 1. Zero Stars — No Community Validation

**Severity: High**

The repository has zero stars and no evidence of external adoption. The audit methodology may be technically sound, but it has not been reviewed or validated by the model risk or AI governance communities.

**Recommendation:** Before deploying for regulatory purposes, validate the PSI and bias calculations against reference implementations (IBM AI Fairness 360, Microsoft Fairlearn, Alibi-Detect) on a known dataset. Discrepancies would indicate implementation errors in the audit engine.

### 2. Protected Attribute Definition Is Sensitive

**Severity: High**

Bias auditing requires defining protected attributes (nationality, age, gender). However, Hawkeye Sterling's risk model should not hold nationality as a directly encoded model feature — it should use jurisdiction risk tier (FATF grey/blacklist status) as a proxy, which avoids direct discrimination while preserving legitimate AML risk differentiation.

**Recommendation:** Define protected attributes for the audit as: `nationality` (to detect any residual discrimination), `age_band`, `entity_type` (individual vs corporate). The audit is testing whether the model discriminates unfairly — not that nationality cannot be correlated with jurisdiction risk in a legally permissible way.

### 3. No Integration with MLOps Monitoring Pipelines

**Severity: Medium**

The tool appears to be a batch audit runner rather than a continuous monitoring integration. For production AML models, drift detection should run automatically on a rolling basis (weekly or per-model-update), not manually.

**Recommendation:** Integrate SENTINTEL as a scheduled job in the HS CI/CD pipeline. Run drift and bias audits automatically: (1) after every model retrain, (2) weekly on production predictions. Alert the MRM team if PSI > 0.25 or DI ratio < 0.80 for any protected group.

---

## Integration Architecture for Hawkeye Sterling

```
Model components subject to audit:
    ├── Risk scoring model (composite score → risk tier)
    ├── Anomaly detection model (transaction pattern)
    ├── Benford analysis engine (statistical model)
    └── Adverse media classifier (NLP model)

src/brain/model_auditor.py
    ├── Scheduled: weekly audit run (or post-retrain trigger)
    ├── For each model:
    │       ModelAuditor(model, reference_data, production_data,
    │                   protected_attrs=['nationality','entity_type'])
    │           .run_full_audit()
    ├── PSI > 0.25 → Slack alert to MRM team + retrain ticket
    ├── DI ratio < 0.80 → Escalate to Chief Compliance Officer
    └── SHAP report → store in model registry per audit date

Regulatory examination response:
    audit_report_{model}_{date}.pdf → submit to regulator as MRM evidence
    compliance_summary.json → feed into HS compliance dashboard
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| PSI drift detection | Good | Industry-standard metric, correct thresholds |
| Bias analysis | Good | DI ratio + demographic parity — regulatory standard |
| SHAP explainability | Good | SAR narrative support, MRM documentation |
| Audit report generation | Good | PDF/HTML with visualisations |
| Community validation | Poor | Zero stars — validate against AI Fairness 360 |
| Continuous monitoring | Caution | Batch only — integrate into CI/CD schedule |
| Protected attribute sensitivity | Caution | Careful definition required for AML context |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Model governance faculty — validate first |

---

## Recommendation

**Integrate as the model risk management audit component** for all ML components in `src/brain`. Schedule weekly audit runs and post-retrain audit triggers. Before regulatory reliance, validate PSI and bias calculations against IBM AI Fairness 360 on a reference dataset. Develop a protected attribute definition policy that distinguishes nationality-as-discrimination from jurisdiction-risk as a legitimate AML signal. Export SHAP values per prediction to support SAR narrative generation and MRM examination documentation.
