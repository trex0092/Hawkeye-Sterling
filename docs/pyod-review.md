# Code Review: yzhao062/pyod

**Repository:** https://github.com/yzhao062/pyod  
**Version:** 2.x (active)  
**Stars:** 9,800+  
**Downloads:** 38M+  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

PyOD is the most comprehensive Python anomaly/outlier detection library, implementing 60+ algorithms across five data modalities (tabular, time series, graphs, text, images). It provides a unified sklearn-compatible API (`fit` / `predict` / `decision_function`) across all detectors, enabling rapid benchmarking and ensemble construction. License is BSD 2-Clause — fully permissive for commercial use.

For Hawkeye Sterling, PyOD is the **transaction anomaly detection engine**: it provides the statistical underpinning for detecting structuring, smurfing, velocity anomalies, and unusual spending patterns without requiring labelled training data (all core algorithms are unsupervised).

---

## Algorithm Coverage

**Total: 60+ detectors across 5 modalities**

### Tabular (30+ algorithms)

**Classical / Statistical:**

| Algorithm | Complexity | Best For |
|-----------|-----------|---------|
| IForest | O(n log n) | Fast baseline, high-dim data |
| LOF | O(n²) | Local density anomalies |
| HBOS | O(n) | Real-time transaction scoring |
| OCSVM | O(n²–n³) | Boundary detection around normal behaviour |
| KNN | O(n²) | Isolated point detection |
| COPOD | O(n) | Marginal distribution tail behaviour |
| ECOD | O(n) | Empirical CDF-based scoring |
| MCD | O(n p²) | Mahalanobis distance in feature space |
| PCA | O(n p²) | Dimensionality reduction baseline |
| CBLOF | O(n k) | Cluster-distance outlier scoring |
| MAD | O(n) | Univariate median deviation |
| GMM | O(n k d²) | Mixture model density estimation |

**Deep Learning:**

| Algorithm | Architecture | Best For |
|-----------|-------------|---------|
| AutoEncoder | Dense encoder-decoder | Reconstruction error anomaly |
| VAE | Variational AE | Probabilistic anomaly score |
| DeepSVDD | Hypersphere mapping | One-class deep learning |
| DevNet | Deviation network | Semi-supervised (few known frauds) |
| AnoGAN | GAN-based reconstruction | Complex distribution learning |
| SO_GAAL / MO_GAAL | GAN active learning | Online anomaly detection |

**Ensemble:**

| Algorithm | Strategy |
|-----------|---------|
| SUOD | Parallel weak detector acceleration |
| Feature Bagging | Random subspace ensemble |
| LSCP | Locally selective combination |
| XGBOD | XGBoost-based with OD features |

### Graph (8 algorithms via PyG)

`DOMINANT`, `CoLA`, `CONAD`, `GUIDE`, `RADAR`, `SCAN`, `AnomalyDAE`, `Anomalous`

### Time Series (7+ algorithms)

Matrix Profile, K-Shape, Anomaly Transformer, SAND, Spectral Residual, LSTM-based

---

## API Design

```python
from pyod.models.iforest import IForest
from pyod.models.lof import LOF
from pyod.models.suod import SUOD

# Unified sklearn-compatible interface
detector = IForest(contamination=0.05, n_estimators=200)
detector.fit(X_train)

# Scores
scores = detector.decision_scores_          # Training scores
test_scores = detector.decision_function(X_test)  # Test scores
labels = detector.predict(X_test)           # 0=normal, 1=anomaly
proba = detector.predict_proba(X_test)     # Probabilistic output
```

**Ensemble construction:**

```python
# SUOD: parallel multi-detector ensemble
detectors = [IForest(), LOF(), HBOS(), COPOD()]
clf = SUOD(base_estimators=detectors, n_jobs=4, approx_flag=False)
clf.fit(X_train)
```

---

## Strengths

### 1. Unified API Across 60+ Algorithms

Every detector implements `BaseDetector` with identical method signatures. Swapping IForest for LOF or VAE requires changing one class name — no other code changes. This makes A/B testing anomaly detection approaches on AML transaction data trivial.

### 2. Production Proven at Scale

PyOD is used in production at Walmart (1M+ daily updates), Databricks, and IQVIA. The 38M download count and 9,800+ GitHub stars indicate substantial real-world validation — not purely academic.

### 3. Unsupervised Core — No Labels Required

All classical algorithms are fully unsupervised. AML transaction data is 99%+ unlabelled — labelled SAR cases are rare and confidential. Unsupervised detectors (IForest, HBOS, COPOD) can be trained on normal background traffic and flag deviations without any ground truth.

### 4. SUOD for Scale

The SUOD (Scalable Unsupervised Outlier Detection) framework parallelizes training and inference across multiple weak detectors using random projection and joblib. This addresses the O(n²) scaling problem of LOF and similar algorithms on large transaction datasets.

### 5. DevNet for Semi-Supervised AML

`DevNet` (Deviation Network) supports semi-supervised training: a small set of known confirmed fraud cases (e.g., filed SARs) can be used to calibrate the anomaly boundary, dramatically improving precision on the known fraud types while preserving unsupervised recall on novel patterns. This directly fits the AML use case where compliance teams have historical SAR data.

### 6. Contamination-Based Thresholding

The `contamination` parameter sets the expected fraction of anomalies. For structuring detection, this can be calibrated to the known base rate of SARs in the bank's population — giving a principled threshold rather than an arbitrary score cutoff.

---

## Issues and Concerns

### 1. Fixed Contamination Threshold Does Not Adapt

**Severity: Medium**

The contamination-based threshold is fixed at fit time. In production AML, the anomaly rate varies seasonally (holiday spending patterns, month-end bulk payments) and by customer segment (retail vs. corporate). A threshold calibrated on all transactions will produce more false positives during legitimate high-volume periods.

**Recommendation:** Implement a sliding-window recalibration in `src/services/anomaly_detector.py` that recomputes thresholds per customer segment on a rolling 90-day window. Use `detector.set_threshold(new_threshold)` to update without retraining.

### 2. Deep Learning Models Require GPU and Careful Tuning

**Severity: Medium**

VAE, DeepSVDD, and AnoGAN require GPU for reasonable training speed. More importantly, deep anomaly detection is sensitive to architecture and hyperparameter choices — the defaults may not transfer to AML transaction data. Reconstruction-based methods (AutoEncoder, VAE) are particularly prone to learning to reconstruct anomalies if they appear frequently in training data.

**Recommendation:** Start with classical methods (IForest, HBOS, COPOD) for the initial deployment. Add DevNet as the semi-supervised layer once labelled SAR data is available. Reserve deep methods for exploratory research, not production scoring.

### 3. O(n²) Algorithms Do Not Scale to Full Transaction Graphs

**Severity: Medium**

LOF, KNN, COF, and ABOD are O(n²) or worse. On a bank with 500K daily transactions, these are infeasible without approximation (e.g., ball-tree with `algorithm='ball_tree'`). HBOS and IForest are O(n log n) and scale correctly.

**Recommendation:** Use HBOS or IForest as the real-time scoring layer. Run LOF and KNN offline on sampled subsets for deeper investigation of flagged accounts.

### 4. Graph Algorithms Require PyG — Additional Dependency

**Severity: Low**

The 8 graph GNN algorithms (`pyg_dominant.py`, etc.) require `torch_geometric`, which has complex CUDA-version-pinned installation. These overlap with DGFraud's algorithm coverage and are unlikely to be better than dedicated GNN fraud libraries.

**Recommendation:** Skip pyod's graph layer in favour of the DGFraud port (reviewed separately). Use pyod exclusively for tabular transaction feature anomaly detection.

### 5. No Concept Drift Detection

**Severity: Low–Medium**

PyOD has no built-in concept drift detection — models trained on last quarter's transactions may degrade as customer behaviour evolves. Money launderers also adapt to detection patterns over time.

**Recommendation:** Implement periodic retraining (monthly) and track anomaly score distribution shift (KS test on score histograms) as an early warning of model drift.

---

## Recommended PyOD Stack for Hawkeye Sterling

```python
# src/services/anomaly_detector.py

from pyod.models.iforest import IForest
from pyod.models.hbos import HBOS
from pyod.models.copod import COPOD
from pyod.models.devnet import DevNet
from pyod.models.suod import SUOD

# Tier 1: Real-time scoring (< 1ms per transaction)
fast_detector = HBOS(contamination=0.02)

# Tier 2: Batch daily sweep (< 100ms per transaction)
ensemble = SUOD(
    base_estimators=[IForest(), COPOD(), HBOS()],
    n_jobs=4,
    approx_flag=False
)

# Tier 3: Semi-supervised with known SARs
sar_detector = DevNet(contamination=0.02)
# Feed known SAR transaction IDs as known_outliers

# Feature set for AML transaction anomaly detection
# - amount, hour_of_day, day_of_week, counterparty_count_30d
# - velocity_7d, velocity_30d, amount_zscore_per_customer
# - country_risk_score, transaction_type_encoded
```

---

## Integration Map for Hawkeye Sterling

| PyOD Algorithm | HS Forensic Mode | Deployment Tier |
|----------------|-----------------|----------------|
| HBOS | Real-time transaction gate | Real-time (< 1ms) |
| IForest | Structuring detection baseline | Batch daily |
| COPOD | Marginal tail behaviour (unusual amounts) | Batch daily |
| SUOD ensemble | Multi-signal anomaly fusion | Batch daily |
| DevNet | SAR-calibrated semi-supervised detection | Batch weekly |
| LOF (sampled) | Investigation deep-dive on flagged accounts | On-demand |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Algorithm coverage | Excellent | 60+ detectors, 5 modalities |
| API design | Excellent | sklearn-compatible, unified |
| Production readiness | Very Good | Proven at Walmart/Databricks scale |
| AML fit | Very Good | Unsupervised core + DevNet for SAR calibration |
| Scalability | Good | SUOD helps; O(n²) methods need care |
| Explainability | Fair | Raw scores; no built-in feature attribution |
| License | Excellent | BSD 2-Clause |
| HS fit | ★★★ | Transaction anomaly detection engine — deploy immediately |

---

## Recommendation

**Adopt as the primary transaction anomaly detection library.** PyOD provides the statistical backbone for detecting structuring, velocity anomalies, and unusual spending patterns. Deployment order:

1. Deploy HBOS as the real-time transaction gate in `src/brain/transaction_monitor.py`
2. Add SUOD ensemble (IForest + COPOD + HBOS) as the nightly batch sweep
3. Integrate DevNet once historical SAR cases are available as training labels
4. Implement 90-day rolling threshold recalibration per customer segment
