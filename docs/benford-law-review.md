# Code Review: chirindaopensource/search_benford_law_compatibility

**Repository:** https://github.com/chirindaopensource/search_benford_law_compatibility  
**Stars:** 0 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A forensic accounting toolkit implementing the Ausloos et al. (2025) methodology for Benford's Law conformance testing. It applies two complementary statistical tests — chi-squared goodness-of-fit and Mean Absolute Deviation (MAD) — to determine whether first-digit (and second-digit) distributions in financial datasets match the expected logarithmic Benford distribution. Non-conformance is a well-established red flag for fabricated or manipulated figures in transaction records, invoices, and general ledger entries.

For Hawkeye Sterling, this is the **Benford forensic mode** in `src/brain`: a statistical pre-filter that flags transaction datasets whose amount distributions look engineered rather than naturally occurring.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Input: numeric dataset (transaction amounts, invoice values, ledger entries)
    ↓
Benford Conformance Tests
    ├── First-digit extraction (d1 from each number)
    ├── Second-digit extraction (d2 from each number)
    ├── Chi-squared test: Σ((observed - expected)² / expected)
    │       p-value threshold: 0.05 (configurable)
    └── MAD test: mean(|observed_freq - benford_freq|)
            thresholds: 0.000–0.006 = conforming
                        0.006–0.012 = acceptable
                        0.012–0.015 = marginally acceptable
                        > 0.015     = non-conforming
    ↓
Output: conformance classification + per-digit frequency deviation table
```

**Core statistical call (Python):**
```python
from search_benford_law_compatibility import BenfordAnalyser

analyser = BenfordAnalyser(data=transaction_amounts)
result = analyser.run()
# result.chi2_pvalue, result.mad_score, result.conforming (bool)
```

---

## Strengths

### 1. Dual-Test Methodology Reduces False Positives

Chi-squared alone is sensitive to sample size — large datasets almost always reject the null even for trivially small deviations. MAD is scale-invariant and better suited to the large transaction volumes typical in AML investigation. Requiring both tests to flag non-conformance is more reliable than either alone.

### 2. Ausloos et al. (2025) Academic Grounding

The implementation follows a peer-reviewed methodology, which matters for regulatory defensibility. When a Suspicious Activity Report (SAR) references Benford analysis, examiners and prosecutors increasingly expect a documented statistical methodology rather than ad hoc scripts.

### 3. Second-Digit Analysis Catches Rounding Manipulation

First-digit Benford tests are well known and can be gamed by sophisticated fraudsters who understand the distribution. Second-digit analysis is less commonly known and harder to spoof. This toolkit implements both, which is a meaningful forensic advantage.

### 4. Pure Python + Minimal Dependencies

The toolkit depends only on NumPy, SciPy, and Pandas — all already likely in a Python microservice environment. No GPU, no heavy ML framework. Runs fast even on datasets of millions of records.

---

## Issues and Concerns

### 1. Zero Stars / No Community Validation

**Severity: Medium**

The repository has no public adopters, no issues, and no pull request history. The implementation has not been battle-tested against known fraudulent datasets. Before deployment, validate against published benchmark datasets (e.g., Nigrini 2012 test cases, Carslaw 1988 earnings data).

**Recommendation:** Maintain a `tests/benford_validation.py` fixture suite with known-conforming and known-non-conforming datasets before wiring into production scoring.

### 2. Minimum Sample Size Not Enforced

**Severity: Medium**

Benford's Law is asymptotically valid — it requires large samples (n > 300 is a common rule of thumb; n > 1,000 for reliable MAD). Applying it to a customer with only 20 transactions will produce spurious results. The library does not appear to enforce a minimum sample guard.

**Recommendation:** Gate the Benford mode in `src/brain/benford_mode.ts` behind a minimum transaction count (500+). Return `INSUFFICIENT_DATA` rather than a conformance flag for small samples.

### 3. Reference Only for Amounts in Non-USD Currencies

**Severity: Low**

Benford analysis of amounts is sensitive to the unit of account. A dataset of amounts in JPY (where values are 100× larger) has different first-digit patterns than the same amounts in USD. The toolkit does not appear to normalise by currency before analysis.

**Recommendation:** Normalise all amounts to a common currency (USD equivalent using FX rates at transaction date) before passing to the analyser.

---

## AML-Relevant Signals

| Pattern | Interpretation |
|---------|---------------|
| Non-conforming first digit (MAD > 0.015) | Possible fabricated transaction amounts |
| Excess of 9s in first digit | Round-number avoidance (structuring indicator) |
| Deficit of 1s in first digit | Amounts systematically above a threshold (structuring) |
| Non-conforming second digit | Sophisticated amount manipulation |

---

## Integration Architecture for Hawkeye Sterling

```
Transaction dataset for customer/entity
    ↓ batch job (Python microservice)
src/brain/benford_mode.py
    ├── Filter: n >= 500 transactions, normalize to USD
    ├── BenfordAnalyser(amounts).run()
    ├── chi2_pvalue < 0.05 AND mad_score > 0.015 → HIGH_RISK flag
    ├── Either test flagging → MODERATE_RISK flag
    └── Both tests passing → CONFORMING (no flag)
    ↓ result published to TypeScript brain via internal REST
src/brain/risk_aggregator.ts
    └── Benford flag contributes to composite AML score
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Statistical rigour | Good | Dual-test MAD + chi-squared, Ausloos 2025 methodology |
| AML relevance | Very Good | Classic forensic accounting signal |
| Community maturity | Poor | Zero stars, no public validation |
| Dependencies | Excellent | NumPy/SciPy/Pandas only |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Benford forensic mode — validate before production use |

---

## Recommendation

**Integrate as a Python microservice** behind a minimum-sample guard (n ≥ 500). Validate against Nigrini benchmark datasets before production deployment. Wire results into the composite risk score in `src/brain` as a supporting (not standalone) signal — Benford non-conformance is an investigative lead, not a definitive fraud determination.
