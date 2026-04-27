# Code Review: awslabs/realtime-fraud-detection-with-gnn-on-dgl

**Repository:** https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl  
**Stars:** 227 | **License:** Apache 2.0  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

This is an end-to-end AWS reference architecture for real-time GNN-based fraud detection, combining Amazon Neptune (graph database, microsecond sub-graph queries), Amazon SageMaker (GNN training + inference endpoints), Deep Graph Library (DGL) for heterogeneous graph construction, AWS AppSync (real-time GraphQL API), and a React dashboard backed by DocumentDB. The full stack deploys via AWS CDK/CloudFormation. Trained and evaluated on the IEEE-CIS fraud detection dataset.

For Hawkeye Sterling, this is a **production graph infrastructure reference architecture**: it shows how to store entity relationship graphs in a managed graph database, train GNN models on SageMaker, and serve real-time fraud predictions through a GraphQL API — the cloud-native pattern for graph-based AML at scale.

**License:** Apache 2.0 — fully permissive.

---

## Architecture

```
Transaction data (tabular: accounts, cards, devices, emails, addresses)
    ↓ AWS Glue data processing
Amazon Neptune (graph database)
    ├── Entity nodes: accounts, merchants, IP addresses, devices, cards
    ├── Relation edges: shared IP, shared device, shared email, shared address
    └── Sub-graph query: retrieve neighbourhood of a transaction in microseconds
    ↓ sub-graph pulled at inference time
Amazon SageMaker
    ├── Training: DGL heterogeneous GNN on IEEE-CIS graph
    │   (message passing captures co-fraud patterns across shared entities)
    └── Inference Endpoint: receives sub-graph → returns fraud probability
    ↓
AWS AppSync (GraphQL)
    ├── Real-time fraud score API
    └── React dashboard (CloudFront + Amplify)
         DocumentDB (dashboard transaction history)
    ↓
AWS Step Functions
    (orchestrate training pipeline: data prep → training → deployment)
```

---

## Strengths

### 1. Microsecond Graph Queries Via Neptune

Neptune is a managed graph database purpose-built for sub-graph traversal queries at millisecond latency. Retrieving a 2-hop neighbourhood of a transaction (all accounts sharing the same IP, device, or billing address) from Neptune takes microseconds — compared to seconds or minutes for the same query on a relational database with JOIN operations. This is what enables real-time GNN inference: the graph context is available fast enough to score the transaction before it clears.

### 2. Heterogeneous Graph — Models Real Banking Topology

The solution constructs a heterogeneous graph from tabular transaction data: accounts, merchants, IP addresses, physical addresses, and devices all become distinct node types. Relationships (shared IP, shared device, shared billing address) become typed edges. This is the correct structure for AML — the shared-entity connections between apparently unrelated accounts are exactly the signals that reveal coordinated fraud rings.

### 3. SageMaker Serverless Inference Option

The deployment supports SageMaker Serverless Inference (`-c ServerlessInference=true`), which scales to zero when idle and auto-scales under load. For a compliance system with bursty screening workloads (periodic batch due diligence vs. real-time clearance gates), serverless inference eliminates idle infrastructure cost.

### 4. Full Infrastructure as Code (AWS CDK)

The entire stack deploys from a single `yarn deploy` command via AWS CDK. This means the architecture is reproducible, version-controlled, and auditable — important for compliance infrastructure that requires change management documentation.

### 5. Answers the "Why GNN?" Question Directly

The README FAQ provides a clear explanation of why GNNs outperform traditional ML for fraud detection: fraudsters collaborate as groups and leave graph traces (shared IPs, addresses, devices) that traditional feature-based models miss because unique values (IP addresses, physical addresses) are too high-cardinality to one-hot encode. This is directly applicable to explaining the GNN integration in Hawkeye Sterling's compliance charter.

---

## Issues and Concerns

### 1. Deep AWS Lock-In

**Severity: High**

The architecture is built entirely on AWS-proprietary services: Neptune, SageMaker, AppSync, DocumentDB, Step Functions, CloudFront, Amplify. Migrating to Azure, GCP, or a self-hosted stack would require replacing every layer. For a UAE-based deployment with data residency requirements, AWS Middle East (UAE) region is available, but the vendor lock-in limits architectural flexibility.

**Recommendation:** Treat this as a **reference architecture**, not a deployment blueprint. The key design patterns are transferable: (1) graph database for microsecond sub-graph queries, (2) GNN training offline + online inference endpoint, (3) real-time API for fraud scoring. Implement these patterns with open-source equivalents (Neo4j or DGL + self-hosted FastAPI) for a vendor-neutral HS deployment.

### 2. Deployment Complexity Is High

**Severity: Medium**

The deployment requires: AWS account, AWS CDK knowledge, Node.js LTS, Docker, VPC configuration (public + private subnets + NAT gateways), and IAM permissions for 8+ AWS services. Troubleshooting (e.g., the documented CloudWatch log group policy length issue) requires AWS expertise.

**Recommendation:** Use as architectural reference only. Do not attempt to deploy this solution directly into the Hawkeye Sterling stack without dedicated AWS infrastructure engineering support.

### 3. Neptune Is Not Available in All Regions

**Severity: Low for AWS deployments**

Neptune is available in 16 specific regions (listed in the README). If Hawkeye Sterling's UAE AWS deployment targets `me-central-1` (UAE) or `me-south-1` (Bahrain), confirm Neptune availability in those specific regions.

### 4. Dashboard Uses DocumentDB — Additional Operational Overhead

**Severity: Low**

The React dashboard stores transaction history in Amazon DocumentDB (MongoDB-compatible). This adds another managed database service to the stack. For Hawkeye Sterling, the existing primary PostgreSQL instance should be sufficient for dashboard data storage.

---

## Extractable Patterns for Hawkeye Sterling

Even without deploying the AWS stack, these design patterns are directly applicable:

### Pattern 1: Graph Database for Sub-Graph Queries
```python
# Neo4j equivalent of Neptune sub-graph query
def get_account_neighbourhood(account_id: str, hops: int = 2) -> Graph:
    query = """
    MATCH (a:Account {id: $account_id})-[*1..2]-(connected)
    RETURN a, connected, relationships(path)
    """
    return neo4j_session.run(query, account_id=account_id)
```

### Pattern 2: SageMaker → FastAPI GNN Inference
```python
# FastAPI inference endpoint (self-hosted equivalent)
@app.post("/fraud-score")
async def score_transaction(subgraph: SubGraphData) -> FraudScore:
    dgl_graph = build_dgl_graph(subgraph)
    with torch.no_grad():
        score = gnn_model(dgl_graph)
    return FraudScore(probability=score.item(), account_id=subgraph.account_id)
```

### Pattern 3: Step Functions → Airflow/Prefect Pipeline
The training pipeline orchestration (data prep → training → deployment → validation) maps directly to an Airflow or Prefect DAG in a vendor-neutral setup.

---

## Integration Map for Hawkeye Sterling

| AWS Component | HS Open-Source Equivalent | Pattern Used |
|--------------|--------------------------|-------------|
| Amazon Neptune | Neo4j Community / DGL graph | Entity relationship graph storage |
| SageMaker training | Local/cloud PyTorch training job | GNN model training |
| SageMaker inference | FastAPI + PyTorch endpoint | Real-time fraud scoring |
| AppSync GraphQL | HS REST API | Fraud score query interface |
| Step Functions | Airflow / Prefect | Training pipeline orchestration |
| DocumentDB | PostgreSQL | Dashboard data storage |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Architecture quality | Excellent | Correct patterns: graph DB + GNN + real-time inference |
| AWS lock-in | Poor | Every layer is proprietary |
| Deployment complexity | Poor | 8+ AWS services, CDK required |
| Transferable patterns | Excellent | All patterns work on open-source equivalents |
| Heterogeneous graph | Excellent | Correct multi-entity-type AML graph topology |
| License | Excellent | Apache 2.0 |
| HS fit | ★★☆ | Study as reference architecture; implement with Neo4j + FastAPI |

---

## Recommendation

**Study as the reference architecture; implement with open-source equivalents.** This solution demonstrates exactly the right infrastructure pattern for real-time GNN fraud detection. Extract the three key patterns — graph database for sub-graph queries, offline GNN training + online inference, real-time scoring API — and implement them with Neo4j + PyTorch + FastAPI. Do not adopt the AWS-specific implementation directly.
