# Code Review: awslabs/sagemaker-graph-fraud-detection

**Repository:** https://github.com/awslabs/sagemaker-graph-fraud-detection  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 107

---

## Summary

sagemaker-graph-fraud-detection is an AWS Labs reference implementation for heterogeneous graph fraud detection using Amazon SageMaker and the Deep Graph Library (DGL). It models a financial transaction network as a heterogeneous graph with multiple entity types (accounts, transactions, devices, merchants) and multiple relationship types (SENT, RECEIVED, USED_DEVICE, AT_MERCHANT), then trains a relational graph convolutional network (R-GCN) that classifies transactions as fraudulent by aggregating features across all entity types and relationship types simultaneously. For Hawkeye Sterling's `src/brain/`, this is the highest-quality public reference for heterogeneous graph reasoning across mixed entity types — the key architectural challenge in AML screening where sanctions hits, PEPs, companies, and accounts all need to be modelled as a single connected graph.

---

## Architecture

```
Raw data (accounts, transactions, devices, merchants) → S3
  ↓
SageMaker Processing Job (feature engineering)
  ├── Constructs DGL HeteroGraph with node types: {account, transaction, device, merchant}
  ├── Relationship types: {SENT, RECEIVED, USED_DEVICE, AT_MERCHANT, SAME_EMAIL}
  ├── Node features: numerical (amount, velocity) + categorical (channel, currency) → encoded
  └── Edge features: timestamp delta, amount, transaction type
  ↓
SageMaker Training Job
  ├── R-GCN (Relational GCN): separate weight matrices per relation type
  ├── Message-passing aggregation across all relation types simultaneously
  ├── Node classification head: sigmoid output per transaction node
  └── Output: trained model artifact (.tar.gz)
  ↓
SageMaker Endpoint (real-time inference)
  ├── Input: subgraph JSON (entity + neighbourhood)
  ├── R-GCN forward pass
  └── Output: fraud probability per transaction node
```

---

## Key Technical Patterns

**1. Heterogeneous Graph with Typed Relations**

The DGL `HeteroGraph` models each relation type with separate learnable weight matrices in the R-GCN. This means the model learns different aggregation functions for "account sent to account" vs. "account used device" vs. "account at merchant" — which is critical for AML because the risk signal from a shared device is qualitatively different from the signal from a high-value payment. Hawkeye Sterling must adopt this heterogeneous approach rather than a homogeneous GNN that collapses all edge types.

**2. Inductive vs. Transductive Inference**

The repo implements both transductive (full-graph inference at training time) and inductive (subgraph inference for new nodes at test time) modes. For production Hawkeye Sterling screening of new customers, inductive inference is required — the model must score a new entity it has never seen before by aggregating features from its transaction neighbourhood.

**3. SageMaker Processing for Feature Engineering**

The feature engineering script builds the full DGL HeteroGraph from raw CSVs, applies encoding (label encoding for categoricals, standardisation for numericals), and serialises the graph to DGL binary format. This is a clean, reproducible pattern: feature engineering is a separable, versioned processing step — not mixed into training code.

**4. Fraud Ring Detection via Shared Attributes**

The `SAME_EMAIL` and `SAME_DEVICE` edge types model shared attributes between accounts. When accounts share an email address or device fingerprint, a `SAME_EMAIL` / `SAME_DEVICE` edge connects them in the graph. This is the structural basis for fraud ring detection: a cluster of accounts sharing devices/emails that all send to the same beneficiary is a structural AML signal. Hawkeye Sterling can extend this to `SAME_BENEFICIAL_OWNER`, `SAME_REGISTERED_ADDRESS`, `SAME_PHONE_NUMBER` edges.

---

## What Hawkeye Sterling Can Extract

- **Heterogeneous graph schema**: the `{account, transaction, device, merchant}` node type + `{SENT, RECEIVED, USED_DEVICE, SAME_EMAIL}` edge type schema is a direct template for Hawkeye Sterling's entity graph in `src/brain/` — extend to include `{Person, Company, Vessel, Wallet}` node types and `{CONTROLS, OWNS, BENEFICIARY_OF}` edge types
- **R-GCN implementation**: the DGL R-GCN model is the correct architecture for Hawkeye Sterling's heterogeneous graph scoring; the SageMaker training script is ready to adapt
- **Shared-attribute edge pattern**: adopt `SAME_DEVICE`, `SAME_ADDRESS`, `SAME_PHONE`, `SAME_EMAIL` edges as structural fraud-ring detection signals in Hawkeye Sterling's graph
- **Inductive inference mode**: required for scoring new customers — the subgraph extraction + R-GCN inference pattern is directly applicable
- **SageMaker endpoint pattern**: use as the template for Hawkeye Sterling's GNN inference microservice (swap SageMaker for self-hosted if cost is a concern)

---

## Integration Path

**Python microservice (SageMaker or self-hosted).** The DGL/PyTorch model is Python-native. For AWS deployments, the SageMaker endpoint is the correct path — it provides auto-scaling, versioning, and A/B testing out of the box. For non-AWS or cost-sensitive deployments, export the trained model and serve it via FastAPI + PyTorch (following the pattern from `dhiaej/AML-Fraud-Detection-System`). Hawkeye Sterling's TypeScript core calls the inference endpoint via REST.

---

## Caveats

- **Stars: 107 but dated**: the repo was last meaningfully updated in 2021. DGL has evolved significantly (1.0→2.x); the training code may need updates to current DGL APIs. Test before adopting.
- **IEEE fraud dataset, not AML data**: the repo is trained on credit card fraud data (IEEE-CIS Kaggle dataset), not AML transaction data. The architecture is correct but retraining on AML-labelled data (AMLSim output) is required.
- **SageMaker cost**: full SageMaker training jobs on large graphs can be expensive. For development, run DGL training locally on a GPU workstation; use SageMaker only for production training runs.
- **No explainability**: the repo does not implement GNNExplainer or any node-level attribution. For AML regulatory compliance, explainability is required — add GNNExplainer or CaptumExplainer as a post-training step.
- **Graph serialisation is monolithic**: the full graph is serialised as a single DGL binary file. For incremental updates (new transactions arriving continuously), this requires re-serialising the entire graph. Replace with an online graph store (Memgraph) at production scale.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Heterogeneous graph modelling | Excellent | R-GCN with per-relation weight matrices |
| Code quality | Very Good | AWS Labs quality; clean, documented |
| AML-specific relevance | Fair | Trained on fraud data, not AML — architecture correct, data wrong |
| Explainability | Poor | No GNNExplainer or attribution — must add |
| Production readiness | Good | SageMaker integration is production-grade |
| HS fit | ★★★ | Primary reference for heterogeneous graph reasoning in `src/brain/` |

---

## Recommendation

**Adopt the R-GCN heterogeneous graph architecture as Hawkeye Sterling's primary GNN backbone.** Extend the entity type schema to cover Hawkeye Sterling's full entity universe (Person, Company, Vessel, Wallet, Account). Retrain on AMLSim-generated data with AML-specific labels. Add GNNExplainer for regulatory explainability. Evaluate SageMaker vs. self-hosted FastAPI based on infrastructure preference and budget — the model architecture is portable between both.
