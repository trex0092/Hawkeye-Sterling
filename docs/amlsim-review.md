# Code Review: IBM/AMLSim

**Repository:** https://github.com/IBM/AMLSim  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

AMLSim is a multi-agent transaction simulator that generates synthetic banking data containing known money laundering patterns. It models 8 typologies (fan-out, fan-in, cycle, bipartite, stack, random, scatter-gather, gather-scatter), embeds them into realistic background transaction graphs, and produces labelled CSV outputs usable as training data for ML models or as ground-truth test fixtures for AML detection rules.

For Hawkeye Sterling, AMLSim's primary value is as a **test harness**: it generates synthetic screenings that exercise the forensic reasoning modes (smurfing, structuring, layering, round-trip detection) without requiring access to real customer data. It is not a runtime component — it runs offline to produce fixtures.

---

## Architecture

```
paramFiles/         ← Scenario definitions (accounts, patterns, amounts)
   ↓
transaction_graph_generator.py   ← Python: builds NetworkX graph of entities + patterns
   ↓
AMLSim.jar (MASON)               ← Java: multi-agent simulation over time steps
   ↓
scripts/convert_logs.py          ← Python: structured CSV output
   ↓
outputs/
  accounts.csv                   ← Synthetic account entities
  transactions.csv               ← Timestamped transactions with SAR flag
  alert_transactions.csv         ← Confirmed alert (ML training labels)
```

---

## The 8 Laundering Patterns

```python
self.alert_types = {
    "fan_out":        1,   # One source → many beneficiaries (smurfing distribution)
    "fan_in":         2,   # Many sources → one sink (structuring aggregation)
    "cycle":          3,   # Circular loop with margin reduction per hop
    "bipartite":      4,   # All-to-all between two account groups (layering)
    "stack":          5,   # Three-layer originator→intermediary→beneficiary
    "random":         6,   # Random chain (cross-bank or single-bank)
    "scatter_gather": 7,   # Scatter first half, gather second half
    "gather_scatter": 8,   # Gather first half, scatter second half (inverse)
}
```

**Mapping to FATF typologies:**

| AMLSim Pattern | FATF / HS Equivalent |
|----------------|----------------------|
| `fan_out` | Smurfing / structuring (distribution leg) |
| `fan_in` | Structuring (aggregation leg) |
| `cycle` | Carousel / round-tripping |
| `bipartite` | Layering through intermediaries |
| `stack` | Three-layer shell company structure |
| `scatter_gather` | Placement + layering + integration sequence |
| `gather_scatter` | Aggregation → dispersal (integration) |
| `random` | Informal value transfer / hawala chain |

---

## Strengths

### 1. Realistic Background Graph

AMLSim uses a scale-free (Barabási-Albert) background transaction graph, which matches empirical degree distributions in real banking networks. Alert patterns are embedded into this realistic noise, creating a labelled dataset where distinguishing signal from background is non-trivial — exactly as in production.

### 2. Configurable Scenario Parameters

Every pattern is fully parameterised via CSV config files:
- Number of accounts, banks, transaction types
- Alert pattern frequency, amount range, period
- Margin ratio for cycle patterns (simulating intermediary fee extraction)
- SAR flag (true alert vs. false alert) per pattern instance

This allows generating scenarios of specific difficulty — e.g., a test set of only cycle patterns with high-value transactions — to stress-test specific reasoning modes.

### 3. Temporal Realism

The Java MASON simulation runs over discrete time steps (default 720, representing ~2 years). Transactions are scheduled with realistic temporal distributions, not randomly assigned. This means time-series-aware detection (burst detection, velocity analysis) can be tested on AMLSim outputs.

### 4. Cross-Bank Scenarios

Patterns can span multiple synthetic banks, modelling the cross-border / correspondent banking dimension of real laundering. The `random` pattern specifically supports this. This is important for testing Hawkeye Sterling's sanctions-evasion detection against multi-hop cross-border scenarios.

### 5. SAR Ground Truth Labels

Every transaction in `alert_transactions.csv` is labelled with the alert pattern type and SAR flag. This makes AMLSim output directly usable as:
- Training data for GNN fraud detection models (`safe-graph/DGFraud`, `pygod-team/pygod`)
- Ground truth for precision/recall measurement of Hawkeye Sterling's reasoning modes
- Regression test fixtures — if a new reasoning mode breaks on a known pattern, CI catches it

---

## Issues and Concerns

### 1. Java 8 Dependency Is Dated

**Severity: Medium**

The simulation core (`AMLSim.jar`) requires Java 8. Java 8 reached end of free Oracle support in 2019, though OpenJDK 8 remains available. Running AMLSim in CI or on modern infrastructure requires installing a legacy JDK.

**Recommendation:** For Hawkeye Sterling's test pipeline, containerise AMLSim in a Docker image with OpenJDK 8 pre-installed. Run generation offline and commit fixture outputs to `tests/fixtures/amlsim/` rather than regenerating in CI.

### 2. Python 3.7 Requirement Is Stale

**Severity: Low–Medium**

The README specifies Python 3.7. The codebase likely works on 3.10+ but this is not tested or documented. Dependencies (NetworkX, scipy) have evolved since 3.7.

**Recommendation:** Test with Python 3.12 and update the README if it passes. In practice, the simulation is a one-time offline tool so strict version requirements matter less than for runtime components.

### 3. No Docker Image Published

**Severity: Low**

There is no official Docker image for AMLSim. Running the full pipeline (Python graph generation → Java simulation → Python conversion) requires manual environment setup. This creates friction for onboarding new developers to the test workflow.

**Recommendation:** Write a `Dockerfile` for AMLSim that packages OpenJDK 8, Python 3.12, and all dependencies. Add a `make generate-fixtures` target to the Hawkeye Sterling Makefile that runs AMLSim in Docker and writes outputs to `tests/fixtures/`.

### 4. No REST API or Library Interface

**Severity: Low**

AMLSim is a CLI tool — it writes files, not programmatic outputs. There is no Python API for generating a single pattern on demand. Integration with a test runner requires subprocess calls or pre-generated fixture files.

**Recommendation:** For CI purposes, pre-generate a suite of fixture files (one per pattern type, multiple difficulty levels) and commit them. Only regenerate when pattern parameters change.

### 5. Outputs Are Raw CSV — Not FtM Format

**Severity: Low**

AMLSim outputs `accounts.csv`, `transactions.csv`, and `alert_transactions.csv` in its own schema. These need to be converted to Hawkeye Sterling's internal entity format (ideally FtM) before use as test fixtures.

**Recommendation:** Write `scripts/amlsim_to_ftm.py` that converts AMLSim CSV outputs to FtM `Person`/`Company`/`Payment`/`BankAccount` entities. This converter is a one-time utility that runs during fixture generation.

---

## Recommended Test Fixture Suite for Hawkeye Sterling

Generate one scenario per pattern at three difficulty levels (easy/medium/hard):

| Fixture | Pattern | Accounts | Time Steps | Banks | Purpose |
|---------|---------|----------|------------|-------|---------|
| `fan_out_easy.json` | fan_out | 10 | 90 | 1 | Smurfing detection |
| `fan_in_easy.json` | fan_in | 10 | 90 | 1 | Structuring aggregation |
| `cycle_easy.json` | cycle | 5 | 90 | 1 | Round-trip detection |
| `bipartite_medium.json` | bipartite | 20 | 180 | 2 | Layering detection |
| `stack_medium.json` | stack | 15 | 180 | 2 | Shell company chain |
| `scatter_gather_hard.json` | scatter_gather | 50 | 360 | 3 | Placement+integration |
| `gather_scatter_hard.json` | gather_scatter | 50 | 360 | 3 | Aggregation+dispersal |
| `random_hard.json` | random | 100 | 720 | 5 | IVTS/hawala chain |

---

## Integration Map for Hawkeye Sterling

| AMLSim Output | HS Use |
|---------------|--------|
| `transactions.csv` + `alert_transactions.csv` | Test data for `src/brain/` forensic modes |
| Pattern labels (fan_out, cycle, etc.) | Ground truth for precision/recall measurement |
| Account graph | Input for GNN-based smurfing/ring detection |
| Temporal transaction logs | Input for velocity and burst-detection modes |
| Multi-bank scenarios | Cross-border / correspondent banking test cases |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Pattern coverage | Excellent | All 8 FATF-equivalent typologies with sub-variants |
| Realism | Very Good | Scale-free background, temporal simulation, multi-bank |
| Ground truth labels | Excellent | SAR flag per transaction — direct training/testing use |
| Deployment ease | Fair | Java 8 + Python 3.7, no Docker image, CLI only |
| HS fit | ★★★ | Essential test harness — fills the test gap across all forensic modes |

---

## Recommendation

**Integrate as offline test fixture generator.** AMLSim should not run in production — it is a pre-production tool. The correct integration is:

1. Containerise AMLSim in a dedicated Docker image
2. Generate the 8-pattern × 3-difficulty fixture suite (24 scenarios)
3. Convert outputs to FtM format via `amlsim_to_ftm.py`
4. Commit fixtures to `tests/fixtures/amlsim/`
5. Add `tests/brain/forensic_modes.test.ts` that runs each HS forensic mode against the corresponding fixture and asserts ≥ 80% recall

This gives Hawkeye Sterling its first systematic, reproducible regression suite for the forensic reasoning modes — which currently have no test coverage.
