# Code Review: geeknam/aws-neptune-aml

**Repository:** https://github.com/geeknam/aws-neptune-aml  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 7

---

## Summary

aws-neptune-aml demonstrates a fully serverless AML graph-screening architecture built on AWS Neptune (managed graph database), AWS Glue (ETL), and AWS Lambda (query execution). Transaction data is ingested via Glue jobs into Neptune as a property graph, and Lambda functions execute parameterised Gremlin traversals to detect cyclic money flows, fan-in aggregation, and multi-hop entity relationships. For Hawkeye Sterling's `src/services/`, this is the most relevant public reference for a production-grade, cloud-native graph storage pattern that scales without managing graph database infrastructure.

---

## Architecture

```
Raw transaction data (S3)
  ↓
AWS Glue ETL job
  ├── Schema normalisation (account, transaction, counterparty nodes)
  ├── Edge creation (SENT_TO, OWNS, CONTROLS relationships)
  └── Neptune bulk loader (CSV → Neptune via S3 staging)
  ↓
AWS Neptune (property graph, Gremlin API)
  ├── Account vertices (id, name, jurisdiction, risk_tier)
  ├── Transaction edges (amount, currency, timestamp, channel)
  └── Entity vertices (Person, Company, beneficialOwner)
  ↓
AWS Lambda functions (Gremlin query runners)
  ├── cycle_detector.py       ← g.V().repeat().until() cycle traversal
  ├── fan_in_detector.py      ← in-degree threshold query
  ├── entity_linker.py        ← 2-hop shared-controller lookup
  └── risk_scorer.py          ← aggregate pattern hits → entity risk score
  ↓
API Gateway → JSON response to caller
```

Lambda functions are invoked directly by API Gateway for synchronous single-entity screening, or by SQS for asynchronous batch screening of large account populations.

---

## Key Technical Patterns

**1. Neptune Bulk Loader for Initial Ingestion**

Neptune's bulk loader accepts CSV files staged in S3 in a specific vertex/edge CSV format. The Glue job transforms raw transaction CSVs into Neptune-compatible format and writes to an S3 staging prefix. Neptune then loads directly from S3, achieving ~1M edges/minute on a `db.r5.4xlarge` instance. This is the correct ingestion path for historical data loads (e.g., loading 5 years of transaction history at onboarding).

**2. Parameterised Gremlin Traversals**

All Neptune queries are parameterised Gremlin traversals stored as named Lambda functions — not ad-hoc query strings. For example, the cycle detector uses:

```python
g.V(seed_id).repeat(out('SENT_TO').simplePath()).until(
    loops().is_(gt(2)).or_().has('id', seed_id)
).path().limit(100)
```

Parameterisation (seed_id, depth limit) prevents runaway traversals on dense subgraphs.

**3. SQS-Backed Batch Processing**

Batch screening (e.g., nightly re-screening of a full customer portfolio) is handled via SQS: the orchestrator enqueues one message per account, Lambda polls the queue, and Neptune handles concurrent Gremlin queries. SQS dead-letter queue captures failed screenings for retry without data loss.

**4. IAM-Controlled Neptune Access**

Neptune is deployed in a private VPC subnet with IAM authentication enabled. Lambda functions assume an execution role with least-privilege Neptune permissions. There is no direct public access to the graph database. This is the correct security architecture for production AML infrastructure.

---

## What Hawkeye Sterling Can Extract

- **Neptune Glue ETL pattern**: the Glue → Neptune bulk loader is a direct template for Hawkeye Sterling's historical data ingestion path in `src/ingestion/`
- **Gremlin traversal library**: the parameterised cycle, fan-in, and entity-linker Gremlin queries are directly portable to Hawkeye Sterling's graph query layer
- **SQS batch pattern**: adopt the SQS-backed Lambda pattern for Hawkeye Sterling's nightly portfolio re-screening mode
- **IAM Neptune auth**: the VPC + IAM auth configuration is a security baseline Hawkeye Sterling must meet for any AWS-hosted graph deployment
- **API Gateway → Lambda → Neptune chain**: this is Hawkeye Sterling's serverless `src/services/` architecture if deploying on AWS

---

## Integration Path

**TypeScript REST client.** Neptune is queried via Lambda (Python/Gremlin). Expose screening results through API Gateway with a JSON response contract. Hawkeye Sterling's TypeScript core calls the API Gateway endpoint — no Python microservice required as the serverless Lambda layer handles execution. For local development, use a Neptune Analytics local endpoint or a Gremlin-compatible local graph (JanusGraph in Docker).

---

## Caveats

- **Stars: 7 / dated Gremlin syntax**: the repo was last updated before Neptune's OpenCypher and SPARQL support matured. Hawkeye Sterling may prefer Neptune's openCypher API over Gremlin for more readable queries.
- **Neptune cost**: Neptune is not cheap. A minimum `db.r5.large` with a reader instance runs ~$350/month. Hawkeye Sterling should evaluate Neptune Analytics (pay-per-query) vs. provisioned Neptune vs. self-managed Memgraph for cost at target query volumes.
- **No local development story**: Neptune does not have a free local emulator. The repo offers no local development setup. Use Apache TinkerPop + Gremlin Server locally as a development substitute.
- **Lambda cold-start latency**: Lambda functions querying Neptune via Gremlin have a cold-start overhead of 500ms–2s. For Hawkeye Sterling's synchronous real-time screening path, use provisioned concurrency or a persistent connection pool via a Lambda extension.
- **Glue ETL is batch-only**: the Glue job does not support incremental/streaming ingestion. Real-time transaction graph updates require a separate Lambda trigger on the transaction stream (Kinesis → Lambda → Neptune `addV`/`addE`).

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Graph storage architecture | Very Good | Neptune + IAM + VPC is production-grade |
| Query patterns | Good | Parameterised Gremlin, depth-limited traversals |
| Real-time support | Poor | Batch ETL only, no streaming ingestion |
| Local development | Poor | No Neptune emulator; TinkerPop workaround required |
| Cost | Fair | Neptune pricing requires careful capacity planning |
| HS fit | ★★ | Strong AWS graph architecture reference; evaluate cost vs. Memgraph |

---

## Recommendation

**Use as the AWS Neptune architecture reference for `src/services/`.** The Glue bulk loader, parameterised Gremlin traversal library, and SQS batch screening pattern are all production-grade. Before committing to Neptune, run a cost comparison against self-managed Memgraph on ECS — Memgraph is typically cheaper at moderate transaction volumes and offers a closer development-to-production parity. If the team is AWS-first and wants managed infrastructure, Neptune is the right choice and this repo is the correct starting point.
