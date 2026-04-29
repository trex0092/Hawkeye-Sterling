# Code Review: pygod-team/pygod

**Repository:** https://github.com/pygod-team/pygod  
**Version:** 1.1.0 (released 2024-02-04)  
**Stars:** 1,490+ | **Forks:** 139 | **Open Issues:** 14  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

PyGOD is a Python library for graph-level outlier and anomaly detection, built on PyTorch and PyTorch Geometric (PyG). It implements 19 algorithms spanning 2007–2024, from classical structural clustering (SCAN) through reconstruction autoencoders (DOMINANT, AnomalyDAE) to contrastive self-supervised learning (CoLA). The API is sklearn-compatible: `fit(data)` on a PyG `Data` object, `predict(data)` returns binary labels.

For Hawkeye Sterling, PyGOD is the **modern PyTorch replacement for DGFraud**: where DGFraud is stuck on TensorFlow 1.x, PyGOD runs on PyTorch 2.0+ with GPU support, a unified API, and an active benchmark suite. It provides the node anomaly detection layer for detecting laundering rings and anomalous accounts in transaction graphs.

**License:** BSD-2-Clause — fully permissive for commercial use.

---

## Algorithm Coverage (19 Total)

| Algorithm | Year | Architecture | Type | Best AML Use |
|-----------|------|-------------|------|-------------|
| SCAN | 2007 | Structural clustering | Transductive | Dense sub-community detection |
| GAE | 2016 | Graph Autoencoder | Inductive | Reconstruction anomaly baseline |
| GCNAE | 2016 | GCN autoencoder | Inductive | Feature + structure reconstruction |
| DOMINANT | 2019 | GCN + dual decoder | Inductive | **Primary baseline — smurfing rings** |
| AnomalyDAE | 2020 | Deep AE variant | Inductive | High-dim transaction features |
| GAAN | 2020 | GAN encoder-decoder | Inductive | Distribution-level anomaly |
| ONE | 2020 | Orthogonal NMF | Inductive | Overlapping community anomaly |
| DONE | 2020 | Dual-objective NE | Inductive | Multi-view consistency |
| ADONE | 2020 | Attributed + structure | Inductive | Combined attribute-graph anomaly |
| CoLA | 2021 | Contrastive learning | Inductive | **Self-supervised, no labels needed** |
| CONAD | 2022 | Contrastive + augment | Inductive | Augmentation-based self-supervised |
| RADAR | 2017 | Residual analysis | Inductive | Consistent anomaly with regularisation |
| ANOMALOUS | 2018 | CUR decomposition | Inductive | Sparse graph anomaly |
| GUIDE | 2022 | Higher-order motifs | Inductive | Subgraph pattern anomaly |
| OCGNN | 2021 | One-class GNN | Inductive | One-class boundary learning |
| GADNR | 2023 | Graph attention | Inductive | Attention-weighted anomaly |
| CARD | 2024 | (latest, 2024) | Inductive | Current SOTA baseline |
| DMGD | 2023 | Directed multi-graph | Inductive | **Directed transaction graphs** |
| GAAN | 2019 | Generative adversarial | Inductive | Generative anomaly model |

**Key for AML:** DOMINANT (reliable baseline), CoLA (no labels required), DMGD (directed graphs match transaction flow directionality), CARD (2024 SOTA).

---

## API Design

```python
from pygod.detector import DOMINANT, CoLA

# PyG Data object (standard graph input)
# data.x: node features (transaction amounts, velocity, account age, etc.)
# data.edge_index: transaction edges [2, num_edges]
# data.y: optional ground truth labels for monitoring (not used in training)

detector = DOMINANT(
    hid_dim=64,
    num_layers=4,
    dropout=0.0,
    weight=0.5,         # balance between structure and attribute reconstruction
    contamination=0.05, # expected fraction of anomalous nodes
    epoch=100,
    lr=0.004,
)

detector.fit(data)

# Results
scores  = detector.decision_score_   # Float scores per node (higher = more anomalous)
labels  = detector.label_            # Binary (0=normal, 1=anomaly)
threshold = detector.threshold_      # Percentile cutoff based on contamination

# Predict on new data (inductive)
new_labels = detector.predict(new_data)
proba = detector.predict_proba(new_data)
```

**Evaluation metrics:**

```python
from pygod.metric import eval_roc_auc, eval_recall_at_k, eval_precision_at_k

auc = eval_roc_auc(y_true, scores)
recall = eval_recall_at_k(y_true, scores, k=100)
```

---

## Strengths

### 1. Modern Stack — PyTorch 2.0 + PyG 2.3

PyGOD runs on current infrastructure: PyTorch 2.0+, PyG 2.3+, Python 3.8–3.11. This is the direct answer to DGFraud's TF 1.x problem. GPU training works on A100/H100. No legacy CUDA constraints.

### 2. 19 Algorithms With a Single Unified API

Switching from DOMINANT to CoLA or CARD requires changing one class name — the fit/predict contract is identical. This makes benchmarking multiple approaches on AMLSim fixture data trivial.

### 3. DOMINANT: Dual Decoder Catches Both Structure and Attribute Anomalies

DOMINANT trains a GCN encoder and two decoders: one reconstructs the adjacency matrix (structural anomaly = unusual connectivity), the other reconstructs node features (attribute anomaly = unusual transaction amounts or velocity). The weighted combination (`weight` parameter) catches both ring topologies and unusual transaction profiles — exactly the two axes of financial fraud.

### 4. CoLA: Self-Supervised — No Labels Required

CoLA uses contrastive learning: positive pairs are a node and its local subgraph, negative pairs use random subgraphs. Anomaly score is the difference between negative and positive logit. This requires zero labelled fraud cases to train — critical for AML data where SAR labels are rare, confidential, or unavailable.

### 5. DMGD: Directed Graph Support

Transaction graphs are inherently directed (A pays B ≠ B pays A). Most GNN algorithms treat graphs as undirected. DMGD explicitly models direction, which is important for detecting fan-out structuring patterns where direction reveals the originator.

### 6. BOND Benchmark Suite

The included `benchmark/` directory reproduces the BOND (NeurIPS 2022) benchmark — 14 algorithms × 8 datasets with reproducible evaluation. This gives Hawkeye Sterling a ready-made benchmarking framework for comparing algorithms on AMLSim-generated test graphs.

---

## Issues and Concerns

### 1. Critical: "No Anomalies Detected" Bug (Issue #122)

**Severity: High**

Open issue #122 reports that after training, all anomaly scores remain uniformly low and no anomalies are detected. This is a potential training convergence failure. The root cause is not documented in the issue and has not been closed.

**Recommendation:** Before deploying DOMINANT or other deep methods in production, reproduce this issue on AMLSim fixture data. If confirmed, pin to a commit prior to the regression or apply the workaround from the issue thread. Monitor this issue — it affects core functionality.

### 2. Reproducibility Gap (Issue #121)

**Severity: Medium**

Issue #121 reports that users cannot reproduce published benchmark results from the README. Reported performance deviates from paper claims. This is common in GNN research code but means the algorithm ratings should be treated as indicative, not guaranteed.

**Recommendation:** Run the BOND benchmark suite on AMLSim data independently to establish HS-specific baselines. Do not rely on published numbers from heterogeneous fraud datasets as proxies for AML performance.

### 3. No Temporal / Dynamic Graph Support

**Severity: Medium**

PyGOD operates on static graphs — a single snapshot of the transaction graph. AML patterns unfold over time: structuring happens over weeks, layering over months. A static graph loses all temporal information.

Issue #114 (open) requests dynamic graph support — it has not been addressed in v1.1.0.

**Recommendation:** As a workaround, construct time-windowed graph snapshots (weekly or monthly) and run PyGOD on each snapshot. Delta between snapshots gives a proxy for temporal anomaly. For a proper temporal solution, evaluate EvolveGCN or TGAT separately.

### 4. No Heterogeneous Graph Support

**Severity: Medium**

PyGOD operates on homogeneous graphs — all nodes are the same type. Real banking transaction graphs are heterogeneous: account nodes, bank nodes, and transaction edges have different types and feature spaces. Using PyGOD requires collapsing the heterogeneous graph to a homogeneous projection, losing type information.

**Recommendation:** For smurfing ring detection where account homogeneity is reasonable (all nodes are accounts, edges are transactions), this projection is acceptable. For beneficial ownership graphs with mixed Person/Company/Jurisdiction nodes, use DGFraud-style heterogeneous GNNs (ported to PyTorch).

### 5. Alpha Development Status

**Severity: Low–Medium**

The package is marked Alpha on PyPI. 14 open issues include mini-batch loading failures (#118), memory errors (#115), and inconsistent prediction results (#110). Alpha status means the API may change between minor versions.

**Recommendation:** Pin to version 1.1.0 in `requirements.txt`. Review the changelog before upgrading.

---

## Recommended PyGOD Stack for Hawkeye Sterling

```python
# src/services/gnn_anomaly_detector.py

from pygod.detector import DOMINANT, CoLA, DMGD
import torch
from torch_geometric.data import Data

def build_transaction_graph(accounts_df, transactions_df) -> Data:
    # Node features: [amount_velocity_7d, amount_velocity_30d,
    #                 counterparty_count, account_age_days, country_risk_score]
    x = torch.tensor(accounts_df[FEATURE_COLS].values, dtype=torch.float)
    edge_index = torch.tensor(
        [transactions_df['src_idx'].values,
         transactions_df['dst_idx'].values], dtype=torch.long
    )
    return Data(x=x, edge_index=edge_index)

# Tier 1: Fast unsupervised baseline
baseline = DOMINANT(contamination=0.02, epoch=50)
baseline.fit(graph)

# Tier 2: Contrastive (no labels needed)
contrastive = CoLA(contamination=0.02, epoch=100)
contrastive.fit(graph)

# Tier 3: Direction-aware (for fan-out structuring)
directed = DMGD(contamination=0.02)
directed.fit(graph)

# Ensemble: flag nodes anomalous in 2+ detectors
anomaly_mask = (
    (baseline.label_ + contrastive.label_ + directed.label_) >= 2
)
```

---

## Integration Map for Hawkeye Sterling

| PyGOD Component | HS Module | Integration |
|----------------|-----------|-------------|
| DOMINANT | `src/brain/graph_fraud_mode.py` | Smurfing ring detection baseline |
| CoLA | `src/brain/graph_fraud_mode.py` | Self-supervised structuring detection |
| DMGD | `src/brain/graph_fraud_mode.py` | Fan-out/fan-in direction-aware detection |
| BOND benchmark | `tests/brain/` | Benchmark against AMLSim fixtures |
| `eval_recall_at_k` | `tests/brain/` | Recall measurement for forensic modes |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Stack modernity | Excellent | PyTorch 2.0 + PyG — production-viable |
| Algorithm coverage | Very Good | 19 algorithms, 2007–2024 span |
| API design | Very Good | sklearn-compatible, unified |
| Temporal support | Poor | Static graphs only; issue #114 open |
| Heterogeneous graphs | Poor | Homogeneous only; projection required |
| Known bugs | Caution | Issue #122 (no anomalies) is critical |
| License | Excellent | BSD-2-Clause |
| HS fit | ★★★ | Primary graph anomaly detection layer — use with DGFraud port |

---

## Recommendation

**Adopt as the graph anomaly detection layer.** PyGOD is the correct modern replacement for DGFraud's algorithms: same ideas, PyTorch stack, unified API. Deploy DOMINANT + CoLA as the primary smurfing and structuring detectors. Use DMGD for direction-aware fan-out patterns. Benchmark all three against AMLSim fixtures using the BOND evaluation framework.

**Before production:**
1. Reproduce and resolve issue #122 ("no anomalies detected") on AMLSim data
2. Implement weekly graph snapshots as the temporal workaround
3. Build the homogeneous account→transaction graph projection from FtM entities
4. Add `eval_recall_at_k` assertions to CI against AMLSim ground truth labels
