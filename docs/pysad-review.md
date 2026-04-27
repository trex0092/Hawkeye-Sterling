# Code Review: selimfirat/pysad

**Repository:** https://github.com/selimfirat/pysad  
**Stars:** 286 | **Version:** 0.4.0 | **License:** BSD-3-Clause  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

PySAD is a Python streaming anomaly detection framework implementing 16+ algorithms that process data one instance at a time — updating the model incrementally as each observation arrives, without requiring a full batch. It wraps PyOD batch detectors for use in the streaming setting via sliding windows, and includes stream simulators, evaluators, preprocessors, and probability calibrators.

For Hawkeye Sterling, PySAD is the **real-time transaction gate**: the layer that scores each transaction within milliseconds of arrival, before it clears, using a model that continuously updates itself on the live transaction stream without retraining cycles.

**License:** BSD-3-Clause — fully permissive for commercial use.

---

## What the Tool Does

```
Transaction stream (one at a time, as they arrive)
    ↓
PySAD model (streaming, online update)
    ├── fit_partial(X)        ← update model with new observation
    ├── score_partial(X)      ← score anomalousness of observation
    └── fit_score_partial(X)  ← both in one call
    ↓
Continuous anomaly score (higher = more anomalous)
    ↓
Threshold → alert / pass
```

**Key distinction from PyOD:**

| | PyOD | PySAD |
|---|------|-------|
| Processing | Batch (fit on full dataset) | Streaming (one instance at a time) |
| Model update | Periodic full retraining | Continuous incremental update |
| Memory | Scales with dataset size | Bounded window |
| Latency | Seconds–minutes | Milliseconds |
| Use case | Nightly batch sweep | Real-time transaction gate |

---

## Implemented Algorithms (16+)

| Algorithm | Approach | Speed | Best For |
|-----------|---------|-------|---------|
| **HalfSpaceTrees** | Random tree ensemble | Fast | High-volume real-time scoring |
| **IForestASD** | Isolation Forest (sliding window) | Fast | Streaming IForest adaptation |
| **LODA** | Lightweight histogram ensemble | Fast | High-dim, low-memory |
| **RSHash** | Random sample hash trees | Fast | Scalable velocity detection |
| **KNNCAD** | K-NN contextual anomaly | Medium | Local neighbourhood anomaly |
| **KitNet** | Neural network ensemble | Medium | Complex multi-feature anomaly |
| **RelativeEntropy** | Distribution divergence | Fast | Distribution shift detection |
| **MedianAbsoluteDeviation** | Univariate robust stat | Very fast | Single-feature baseline |
| **StandardAbsoluteDeviation** | Univariate stat | Very fast | Single-feature baseline |
| **RobustRandomCutForest** | Amazon RRCF (optional) | Fast | General-purpose |
| **xStream** | Sketched half-space trees (optional) | Fast | Very high volume |
| **LocalOutlierProbability** | Streaming LOF variant | Medium | Local density anomaly |
| **ExactStorm** | Distance-based streaming | Medium | Distance-based detection |

---

## API Design

```python
from pysad.models import HalfSpaceTrees, IForestASD, LODA
from pysad.evaluation import AUROCMetric
import numpy as np

# Initialise streaming detector
model = HalfSpaceTrees(
    n_features=8,      # number of transaction features
    depth=15,          # tree depth
    window_size=500,   # sliding window
    n_estimators=25,
)

# Process transactions one at a time
for transaction in transaction_stream:
    X = np.array([[
        transaction.amount_zscore,
        transaction.velocity_7d,
        transaction.counterparty_count,
        transaction.country_risk,
        transaction.hour_of_day,
        transaction.day_of_week,
        transaction.amount_log,
        transaction.is_round_amount,
    ]])
    score = model.fit_score_partial(X)  # update model + score in one call
    if score > ALERT_THRESHOLD:
        flag_for_review(transaction)
```

**PyOD integration (batch models in streaming):**
```python
from pysad.transform.streaming_models import StreamingModel
from pyod.models.iforest import IForest

# Wrap PyOD batch detector for streaming use
streaming_iforest = StreamingModel(IForest(), window_size=1000)
score = streaming_iforest.fit_score_partial(X)
```

---

## Strengths

### 1. True Streaming — Millisecond Latency

HalfSpaceTrees, LODA, and RSHash score a new transaction in microseconds–milliseconds. This enables real-time pre-clearance anomaly scoring — the transaction is flagged before it settles, while there is still time to hold for review. Batch models (PyOD) cannot do this.

### 2. Bounded Memory — No Growing Dataset

Streaming models maintain only a sliding window or fixed data structure, not the full transaction history. Memory usage is constant regardless of how many transactions have been processed. This is essential for a 24/7 system processing millions of transactions per day.

### 3. Continuous Self-Update — No Retraining Cycle

As customer behaviour evolves (seasonal patterns, new spending categories, business growth), a batch model trained on last quarter's data becomes stale. PySAD models update themselves with every new transaction — the model is always calibrated to current behaviour. This eliminates the model staleness risk that batch-only approaches suffer.

### 4. PyOD Integration

PySAD wraps PyOD's 60+ batch detectors for streaming use via sliding window adaptation. This means Hawkeye Sterling can use the same PyOD detectors (IForest, COPOD, LOF) in both the real-time streaming gate and the nightly batch sweep — consistent algorithm logic across both tiers.

### 5. BSD-3-Clause Licence

Fully permissive. No disclosure obligations.

---

## Issues and Concerns

### 1. Concept Drift Not Fully Implemented

**Severity: Medium**

The IForestASD implementation explicitly has `# TODO: implement concept drift method` in the code. Concept drift — when the statistical properties of the data stream change over time (e.g., a customer's spending behaviour changes legitimately) — is a fundamental challenge in streaming anomaly detection. Without explicit drift detection, the model's sliding window implicitly handles slow drift but can miss abrupt distribution changes.

**Recommendation:** Implement a lightweight drift detector (e.g., ADWIN — Adaptive Windowing) as a wrapper around PySAD models to trigger threshold recalibration when drift is detected. The `pysad.statistics` module provides the statistical tracking primitives needed.

### 2. No Built-In Alert Threshold Calibration

**Severity: Medium**

PySAD returns raw anomaly scores but does not provide a principled method for choosing the alert threshold. The optimal threshold depends on the desired false positive rate for the specific customer or account segment.

**Recommendation:** Use PySAD's `probability calibrators` module to convert raw scores to calibrated probabilities, then set the threshold as a percentile (e.g., "flag the top 0.5% of daily transactions by score").

### 3. Version 0.4.0 — Pre-1.0 Stability Warning

**Severity: Low**

Version 0.4.0 indicates pre-stable API. Method signatures and algorithm parameters may change between minor versions.

**Recommendation:** Pin to `pysad==0.4.0` in production requirements until the project reaches 1.0.

---

## Recommended PySAD Stack for Hawkeye Sterling

```
Transaction arrives at clearing
    ↓
src/brain/realtime_transaction_gate.py
    ├── HalfSpaceTrees: universal fast baseline (< 1ms)
    ├── IForestASD: sliding window isolation (< 5ms)
    └── LODA: lightweight histogram (< 1ms)
    ↓
Ensemble score = max(HST, IFOREST, LODA)
    ├── Score > 0.95 → hold for immediate review
    ├── Score 0.80–0.95 → flag for same-day analyst review
    └── Score < 0.80 → pass + log for nightly batch re-score

    ↓ nightly batch (PyOD)
    SUOD ensemble on 24h window → deeper sweep
```

| PySAD Component | HS Module | Role |
|----------------|-----------|------|
| HalfSpaceTrees | `src/brain/` real-time gate | Primary speed detector |
| IForestASD | `src/brain/` real-time gate | Isolation Forest in streaming |
| LODA | `src/brain/` real-time gate | Lightweight backup |
| Streaming PyOD wrappers | `src/monitoring/` | Bridge batch detectors to real-time |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Real-time capability | Excellent | Millisecond scoring, one transaction at a time |
| Memory efficiency | Excellent | Bounded window — constant memory |
| Self-updating | Very Good | Continuous model update without retraining |
| Algorithm coverage | Good | 16+ streaming detectors |
| Concept drift | Fair | TODO in code — not fully implemented |
| API design | Very Good | fit_partial / score_partial — clean streaming API |
| PyOD integration | Very Good | Use same models in batch and streaming |
| HS fit | ★★★ | Real-time transaction gate — deploy as pre-clearance screener |

---

## Recommendation

**Deploy as the real-time pre-clearance transaction scoring layer.** PySAD fills the gap between PyOD's batch detectors and real-time transaction monitoring: it provides millisecond scoring with continuous self-update, without batch retraining cycles. Stack HalfSpaceTrees + IForestASD + LODA as an ensemble gate. Route high-scoring transactions to immediate analyst review; feed all transactions to PyOD's SUOD ensemble for the nightly batch deeper sweep.
