# Code Review: safe-graph/DGFraud

**Repository:** https://github.com/safe-graph/DGFraud  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

DGFraud is a Graph Neural Network (GNN) toolbox for fraud detection, implementing 9 peer-reviewed algorithms from top ML venues (ICDM, CIKM, WWW, AAAI, NIPS, SIGIR). It supports both homogeneous and heterogeneous graphs, covering financial fraud, opinion spam, cyber criminal network detection, and cash-out user identification. License is Apache 2.0.

For Hawkeye Sterling, DGFraud is the **reference implementation library** for GNN-based AML graph analysis — covering smurfing ring detection, shell company network analysis, and layering through intermediaries. The algorithms are not production-ready as-is (TF 1.x stack), but the architectures are directly portable to PyTorch + DGL/PyG.

---

## Architecture

```
DGFraud/
├── algorithms/          ← 9 model implementations + example runners
├── base_models/         ← GCN base implementation
├── dataset/             ← DBLP and Yelp preprocessed graphs
├── utils/               ← Data loading utilities
└── main.py              ← Entry point
```

---

## The 9 Fraud Detection Algorithms

| Algorithm | Venue | Graph Type | Architecture | AML Use Case |
|-----------|-------|-----------|--------------|--------------|
| **SemiGNN** | ICDM 2019 | Heterogeneous | GAT + LINE + DeepWalk | General financial fraud on multi-relation graphs |
| **Player2Vec** | CIKM 2019 | Heterogeneous | GAT + GCN | Criminal network role classification |
| **GAS** | CIKM 2019 | Heterogeneous | GCN + GAT | Opinion/review spam (adverse media signals) |
| **FdGars** | WWW 2019 | Homogeneous | GCN | App review fraud (small dense graphs) |
| **GeniePath** | AAAI 2019 | Homogeneous | GAT (adaptive receptive path) | Complex transaction pattern detection |
| **GEM** | CIKM 2018 | Heterogeneous | GCN | Malicious account detection |
| **GraphSAGE** | NIPS 2017 | Homogeneous | GraphSAGE (inductive) | Inductive: detect fraud on unseen accounts |
| **GraphConsis** | SIGIR 2020 | Heterogeneous | GraphSAGE | Inconsistency across relation types |
| **HACUD** | AAAI 2019 | Heterogeneous | GAT | Cash-out user detection |

**Mapping to FATF / Hawkeye Sterling forensic modes:**

| DGFraud Algorithm | HS Forensic Mode |
|-------------------|-----------------|
| `SemiGNN` | Smurfing ring detection — multi-relation account graph |
| `Player2Vec` | PEP/criminal network role classification |
| `GEM` | Malicious account flag — layering intermediaries |
| `GraphConsis` | Cross-source inconsistency detection (entity dedup mismatch) |
| `HACUD` | Cash-out detection — placement → structuring transition |
| `GraphSAGE` | Inductive screening — classify new accounts on arrival |
| `GeniePath` | Adaptive hop-depth for variable-length ownership chains |

---

## Strengths

### 1. Heterogeneous Graph Support

Most real AML graphs are heterogeneous: accounts, transactions, beneficiaries, and banks are different node types with different relation types between them. SemiGNN, Player2Vec, GEM, GAS, HACUD, and GraphConsis all operate on heterogeneous graphs. This is the correct architecture for AML transaction graph modelling — a homogeneous-only library would require collapsing the graph and losing structural information.

### 2. Peer-Reviewed Algorithms From Top Venues

All 9 algorithms cite published papers with documented results on real fraud datasets. This is not experimental research code — these architectures have been ablated and benchmarked. SemiGNN reports state-of-the-art results on the Yelp spam dataset; HACUD was trained on Ant Financial production data.

### 3. Apache 2.0 License

No licensing barrier to commercial integration. The algorithms can be modified, extended, and deployed in a proprietary AML system without copyleft constraints.

### 4. Unified Runner Pattern

`main.py` provides a consistent interface: load graph → instantiate model → train → evaluate. All 9 models follow the same lifecycle, making it straightforward to benchmark algorithms against each other on AMLSim-generated test graphs.

---

## Issues and Concerns

### 1. TensorFlow 1.x Stack Is End-of-Life

**Severity: Critical for production use**

The repository requires `TensorFlow ≥1.14.0, <2.0`. TF 1.x reached end of life in September 2020. It is incompatible with CUDA 11+ drivers and modern GPUs (A100, H100). Running this code today requires:

- Legacy CUDA 9 or 10 environment
- Python 3.6–3.7 (both EOL)
- NumPy 1.16, SciPy 1.2 (stale)

A migration fork `safe-graph/DGFraud-TF2` exists for TF 2.0, but TF 2.x itself has been largely displaced by PyTorch in research.

**Recommendation:** Do not run DGFraud directly. Port the target algorithms (SemiGNN, GraphConsis, HACUD) to PyTorch + DGL or PyG. The mathematical operations are straightforward — the graph convolution and attention layers are standard primitives in both frameworks. This port is ~2 weeks of engineering work per algorithm.

### 2. NetworkX ≤ 1.11 Constraint Is Extremely Stale

**Severity: High**

`requirements.txt` pins `networkx<=1.11`. NetworkX 1.11 was released in 2016. The current version is 3.x. The API changed substantially between 1.x and 2.x — node attributes, graph construction, and algorithm signatures all differ. This pin makes DGFraud incompatible with any modern Python environment that has a recent NetworkX.

**Recommendation:** If running at all, use an isolated virtualenv. In the ported PyTorch version, replace NetworkX graph construction with DGL or PyG native graph objects.

### 3. No Graph Sampling — Does Not Scale

**Severity: Medium**

DGFraud trains on full-graph batches. For AML transaction graphs with millions of nodes and edges (a single bank's monthly transactions), full-graph GNN training is infeasible — GPU memory is exhausted by the adjacency matrix alone. Modern GNN training requires mini-batch sampling (GraphSAINT, neighbor sampling, cluster-GCN).

**Recommendation:** When porting to PyTorch, implement mini-batch training with DGL's `NodeDataLoader` or PyG's `NeighborLoader`. GraphSAGE in particular was designed for inductive mini-batch training and is the easiest to scale.

### 4. No Explainability Layer

**Severity: Medium for compliance**

None of the 9 algorithms produce node-level explanations (which edges contributed to classifying this account as fraud?). Compliance teams cannot use a black-box fraud score — regulators require a defensible audit trail. GNN explainability methods (GNNExplainer, SubgraphX, Integrated Gradients on graphs) exist but are not implemented here.

**Recommendation:** After porting, integrate `torch_geometric.explain` (PyG's built-in explainability module) to produce subgraph explanations for each flagged account. This is required for the compliance officer review workflow in Hawkeye Sterling.

### 5. Datasets Are Academic, Not Financial Transaction Graphs

**Severity: Low–Medium**

The included datasets are DBLP (academic citation network) and Yelp (review spam). Neither resembles a banking transaction graph. There is no example of loading a transaction-account-bank heterogeneous graph.

**Recommendation:** Use IBM AMLSim outputs (reviewed separately) as the development dataset. Convert AMLSim's `transactions.csv` and `accounts.csv` to a DGL/PyG HeteroData object and train SemiGNN or GraphConsis on the AMLSim ground-truth labels.

---

## Integration Architecture for Hawkeye Sterling

```
AMLSim fixtures (tests/fixtures/amlsim/)
    ↓ amlsim_to_graph.py
DGL HeteroData (account nodes, transaction edges, bank nodes)
    ↓
HS GNN Service (src/services/gnn_detector.py)
    ├── SemiGNN  — smurfing ring detection
    ├── GraphConsis — cross-source entity inconsistency
    └── GraphSAGE — inductive scoring of new accounts
    ↓
Fraud scores per node → src/brain/ forensic reasoning
    ↓
Compliance review with GNNExplainer subgraph explanation
```

### Which HS Modules

| DGFraud Component | HS Module | Integration |
|------------------|-----------|-------------|
| SemiGNN, HACUD, GEM | `src/brain/` graph modes | GNN-based AML ring detection |
| GraphSAGE | `src/services/` | Inductive scoring of new counterparties at onboarding |
| GraphConsis | `src/ingestion/` | Detect cross-source entity inconsistencies during dedup |
| Training pipeline | Offline model training | Retrain monthly on new transaction data |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Algorithm coverage | Very Good | 9 algorithms, heterogeneous graph support |
| Research quality | Excellent | All from top-tier venues with ablations |
| Production readiness | Poor | TF 1.x, no sampling, no explainability |
| AML domain fit | Very Good | Financial, criminal network, cash-out algorithms |
| License | Excellent | Apache 2.0 |
| HS fit | ★★★ | Core reference for GNN fraud detection — port to PyTorch |

---

## Recommendation

**Use as algorithm reference; port to PyTorch + DGL.** Do not run DGFraud directly — the TF 1.x stack is a dead end. The value is in the peer-reviewed architectures:

1. Port SemiGNN and GraphConsis to `src/services/gnn_detector.py` (PyTorch + DGL)
2. Use AMLSim fixtures as the training/test dataset
3. Add GNNExplainer for compliance-grade subgraph explanations
4. Deploy GraphSAGE as an inductive scorer for new account onboarding
