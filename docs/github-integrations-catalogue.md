# GitHub Integrations Catalogue for Hawkeye Sterling

> 57 curated repositories organised by capability area.  
> Each entry shows: repo · stars · what to extract · which Hawkeye Sterling module gains it.

---

## 1. AML / Transaction Monitoring (9 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 1 | [IBM/AMLSim](https://github.com/IBM/AMLSim) | 355 | Multi-agent synthetic transaction generator with 14 known laundering patterns (fan-in, fan-out, cycle, scatter-gather, stack). Use as a test harness for your reasoning modes. | `src/brain` — test fixtures for forensic modes |
| 2 | [IBM/TabFormer](https://github.com/IBM/TabFormer) | 363 | BERT/GPT trained on tabular credit-card transaction sequences. Pre-trained representations capture temporal spending patterns. | `src/brain` — behavioural-signals modes |
| 3 | [subrata-samanta/Langgraph_AML_Detection](https://github.com/subrata-samanta/Langgraph_AML_Detection) | 9 | LangGraph pipeline for graph-based AML: nodes for data ingestion, pattern matching, and suspicious-entity flagging. Blueprint for a multi-step agentic screening flow. | `src/brain` — agentic reasoning chain |
| 4 | [AnirudhBabu/AMLPatternDetection](https://github.com/AnirudhBabu/AMLPatternDetection) | 1 | Vectorised SQL + in-memory graph traversal pipeline across 850K accounts and 9M transactions. DuckDB + Memgraph stack. | `src/ingestion` — transaction ingestion pipeline |
| 5 | [dhiaej/AML-Fraud-Detection-System](https://github.com/dhiaej/AML-Fraud-Detection-System) | 1 | GNN risk scoring + FastAPI + React + PyTorch Geometric. Full-stack reference for integrating a GNN risk score into a TypeScript frontend. | `web/` + `src/services` |
| 6 | [gregorizeidler/AI-squadron-AML](https://github.com/gregorizeidler/AI-squadron-AML) | 1 | Coordinated AI-agent squad: one agent monitors blockchain, one analyses transaction patterns, one files STR reports. Multi-agent architecture pattern. | `src/brain` — multi-agent orchestration |
| 7 | [geeknam/aws-neptune-aml](https://github.com/geeknam/aws-neptune-aml) | 7 | Graph-database AML with AWS Neptune + Glue + Lambda. Serverless architecture pattern for graph-based screening at scale. | `src/services` — graph storage layer |
| 8 | [mongodb-industry-solutions/AML-Fraud-prevention-Demo](https://github.com/mongodb-industry-solutions/AML-Fraud-prevention-Demo) | 13 | GenAI real-time fraud detection integrated with MongoDB Atlas. Shows streaming transaction analysis with LLM reasoning at clearing time. | `src/monitoring` — real-time alert layer |
| 9 | [luuisotorres/AML-MultiAgent-RAG](https://github.com/luuisotorres/AML-MultiAgent-RAG) | 14 | Multi-agent RAG that answers AML/CFT compliance queries from a vector store of FATF guidance, regulatory circulars, and typology reports. | `src/brain` — compliance Q&A faculty |

---

## 2. Sanctions & PEP Data (7 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 10 | [opensanctions/opensanctions](https://github.com/opensanctions/opensanctions) | 720 | Canonical open sanctions + PEP database. Scrapers for 120+ sources (UN, OFAC, EU, UK, Interpol, national lists). Ingestion pipeline directly usable. | `src/ingestion` — sanctions source |
| 11 | [opensanctions/yente](https://github.com/opensanctions/yente) | 129 | Self-hostable REST API over OpenSanctions with fuzzy name matching and the W3C Reconciliation API spec. Drop-in entity-matching service. | `src/services` — matching microservice |
| 12 | [opensanctions/followthemoney](https://github.com/opensanctions/followthemoney) | 58 | FtM entity graph data model (Person, Company, Ownership, Directorship, Payment). Shared ontology used across OpenSanctions, Aleph, and dozens of fincrime tools. | `src/brain` — entity type system |
| 13 | [alephdata/followthemoney](https://github.com/alephdata/followthemoney) | 269 | Original FtM model + Python processing tools. Entity merging, deduplication helpers, Pandas export. | `src/ingestion` — entity normalisation |
| 14 | [PatrickAttankurugu/AfricaPEP](https://github.com/PatrickAttankurugu/AfricaPEP) | 1 | Open PEP database covering all 54 African countries. Neo4j graph relationships, fuzzy name matching, FastAPI. Fills a gap in commercial PEP lists. | `src/ingestion` — PEP source (Africa) |
| 15 | [PirSalmanShah/sanction-checker](https://github.com/PirSalmanShah/sanction-checker) | 0 | Lightweight Node.js OpenSanctions client. Thin wrapper pattern reusable as a serverless function for batch name checks. | `src/services` — batch screening endpoint |
| 16 | [SaltyTaro/vessel-check-api](https://github.com/SaltyTaro/vessel-check-api) | 3 | Free API for vessel sanctions screening, ownership transparency, and vetting intelligence. IMO number → sanctions + ownership lookup. | `src/ingestion` — maritime screening |

---

## 3. Graph-Based Fraud & Network Analysis (9 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 17 | [safe-graph/DGFraud](https://github.com/safe-graph/DGFraud) | 752 | Deep Graph-based Fraud Detection Toolbox. 8 GNN algorithms benchmarked on Yelp and Amazon datasets. Reference implementations. | `src/brain` — graph-analysis modes |
| 18 | [pygod-team/pygod](https://github.com/pygod-team/pygod) | 1490 | Graph Outlier Detection library. 20+ algorithms, unified API. Detects anomalous nodes/edges in transaction networks. | `src/brain` — graph anomaly modes |
| 19 | [YingtongDou/CARE-GNN](https://github.com/YingtongDou/CARE-GNN) | 309 | GNN fraud detector robust to camouflage (fraudsters mimicking benign behaviour). CIKM 2020. | `src/brain` — adversarial-detection modes |
| 20 | [awslabs/realtime-fraud-detection-with-gnn-on-dgl](https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl) | 227 | End-to-end AWS blueprint: Neptune graph DB + SageMaker GNN training + AppSync real-time API. Production reference architecture. | `src/services` — graph infrastructure |
| 21 | [awslabs/sagemaker-graph-fraud-detection](https://github.com/awslabs/sagemaker-graph-fraud-detection) | 107 | SageMaker + DGL heterogeneous graph fraud detection. Shows how to model mixed entity types (accounts, merchants, devices) as a single graph. | `src/brain` — heterogeneous graph modes |
| 22 | [Zhu-Shatong/DynamicSocialNetworkFraudDetection](https://github.com/Zhu-Shatong/DynamicSocialNetworkFraudDetection) | 79 | GNN on dynamic (temporal) social networks. Captures how fraud rings evolve over time, not just static snapshots. | `src/brain` — temporal-motif modes |
| 23 | [bdi-lab/DRAG](https://github.com/bdi-lab/DRAG) | 27 | Dynamic Relation-Attentive GNN for fraud detection. ICDMW 2023. Models changing relationship types over time. | `src/brain` — temporal-graph modes |
| 24 | [Rupali-2507/MULE_HUNTER](https://github.com/Rupali-2507/MULE_HUNTER) | 4 | Real-time mule-account detection for UPI. GraphSAGE + JA3 device fingerprinting + Isolation Forest. Detects smurfing rings in milliseconds. | `src/brain` — smurfing detection mode |
| 25 | [AkshatJha0411/Graph-Based-AML-Detection](https://github.com/AkshatJha0411/Graph-Based-AML-Detection) | 1 | Forensic GNN for structuring and smurfing detection in 5M+ transactions. Explainable AI tools to map "Mastermind" ring topologies. | `src/brain` — structuring/smurfing modes |

---

## 4. Anomaly Detection & Scoring (6 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 26 | [yzhao062/pyod](https://github.com/yzhao062/pyod) | 9821 | 60+ anomaly detectors (Isolation Forest, COPOD, ECOD, DeepSVDD) across tabular, time-series, graph, and text. The standard library. | `src/brain` — statistical anomaly modes |
| 27 | [yzhao062/anomaly-detection-resources](https://github.com/yzhao062/anomaly-detection-resources) | 9268 | Curated papers, toolboxes, datasets for anomaly detection including LLM-based approaches (2025). Research reference. | `docs/` — reference catalogue |
| 28 | [benedekrozemberczki/awesome-fraud-detection-papers](https://github.com/benedekrozemberczki/awesome-fraud-detection-papers) | 1794 | 200+ curated fraud detection papers with code. Graph, NLP, tabular. | `docs/` — research catalogue |
| 29 | [selimfirat/pysad](https://github.com/selimfirat/pysad) | 286 | Streaming anomaly detection. Detects concept drift in real-time transaction streams without batch retraining. | `src/monitoring` — streaming alert engine |
| 30 | [januusio/cryptowallet_risk_scoring](https://github.com/januusio/cryptowallet_risk_scoring) | 233 | Explainable crypto wallet risk scoring. Fully interpretable score breakdown (direct exposure, indirect exposure, entity type). | `src/brain` — crypto/DeFi risk modes |
| 31 | [chirindaopensource/search_benford_law_compatibility](https://github.com/chirindaopensource/search_benford_law_compatibility) | 0 | Chi-squared + MAD Benford's Law forensic accounting toolkit on FTSE data. Replicates Ausloos et al. (2025) methodology. | `src/brain` — Benford mode (production logic) |

---

## 5. OSINT & Investigation Tools (9 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 32 | [sherlock-project/sherlock](https://github.com/sherlock-project/sherlock) | 82K | Username search across 400+ social networks. Returns profile URLs, existence flags. | `src/brain` — SOCMINT mode |
| 33 | [smicallef/spiderfoot](https://github.com/smicallef/spiderfoot) | 17K | 200+ OSINT module framework. Correlates IPs, domains, emails, names, phone numbers into a unified graph. Self-hostable. | `src/integrations` — OSINT orchestration |
| 34 | [soxoj/maigret](https://github.com/soxoj/maigret) | 19K | Username → profile dossier from 3000+ sites. Extracts linked accounts, emails, locations. | `src/brain` — SOCMINT / person profile mode |
| 35 | [taranis-ai/taranis-ai](https://github.com/taranis-ai/taranis-ai) | 1001 | AI-powered OSINT aggregation + situational analysis. News clustering, NLP summarisation, analyst workflow. Production-grade. | `src/ingestion` — adverse-media pipeline |
| 36 | [sundowndev/phoneinfoga](https://github.com/sundowndev/phoneinfoga) | 16K | Phone number OSINT: carrier, region, VOIP detection, reputation lookup. REST API available. | `src/brain` — contact-point verification mode |
| 37 | [Lissy93/web-check](https://github.com/Lissy93/web-check) | 32K | All-in-one website analysis: WHOIS, DNS, SSL, headers, tech stack, trackers. Useful for domain due diligence on corporate websites. | `src/brain` — WEBINT mode |
| 38 | [qeeqbox/social-analyzer](https://github.com/qeeqbox/social-analyzer) | 22K | Person-profile analysis across 1000+ platforms. API + CLI + web UI. Returns profile metadata, activity patterns. | `src/brain` — SOCMINT mode |
| 39 | [laramies/theHarvester](https://github.com/laramies/theHarvester) | 16K | Email, subdomain, and employee name harvester. Maps an organisation's digital footprint from public sources. | `src/brain` — corporate OSINT mode |
| 40 | [InQuest/ThreatIngestor](https://github.com/InQuest/ThreatIngestor) | 911 | Threat intelligence aggregation from Twitter, Pastebin, RSS, GitHub, MISP. Pipeline pattern reusable for adverse-media ingestion. | `src/ingestion` — threat-intel source |

---

## 6. KYC / Identity Verification (7 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 41 | [manhcuong02/eKYC](https://github.com/manhcuong02/eKYC) | 56 | Electronic KYC: document OCR + face liveness detection + face matching. FaceNet + MTCNN pipeline. | `src/integrations` — identity verification |
| 42 | [recognito-vision/Windows-FaceRecognition-FaceLivenessDetection-Python](https://github.com/recognito-vision/Windows-FaceRecognition-FaceLivenessDetection-Python) | 65 | NIST FRVT Top-1 face recognition + passive liveness detection SDK. Deepfake-resistant. | `src/integrations` — biometric verification |
| 43 | [ggravlingen/pygleif](https://github.com/ggravlingen/pygleif) | 21 | Python client for GLEIF (Global Legal Entity Identifier Foundation) API. LEI → entity legal name, jurisdiction, ownership structure. | `src/ingestion` — LEI/entity lookup |
| 44 | [kby-ai/IDCardRecognition-Docker](https://github.com/kby-ai/IDCardRecognition-Docker) | 21 | ID card, passport, and driving licence OCR in Docker. MRZ scanning, barcode, NFC. | `src/integrations` — document scanning |
| 45 | [ishansurdi/AegisKYC](https://github.com/ishansurdi/AegisKYC) | 11 | AI KYC platform: adaptive risk scoring + OCR + deepfake detection + cryptographic credentialing. Reduces verification to 8–12 min. | `src/integrations` — full KYC pipeline |
| 46 | [mocharil/KYC-KYB-Automation](https://github.com/mocharil/KYC-KYB-Automation) | 6 | FastAPI KYC/KYB: ID OCR + face comparison + business document analysis via Vertex AI. KYB (business) screening gap. | `src/integrations` — KYB automation |
| 47 | [Deep-Identity-Inc/agent-skills](https://github.com/Deep-Identity-Inc/agent-skills) | 2 | MCP server + Claude skill for face liveness, ID verification, deepfake detection, and AML screening via deepidv API. Native Claude Code integration. | `src/integrations` — MCP identity skill |

---

## 7. Crypto / Blockchain Compliance (4 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 48 | [sambacha/ofac-list](https://github.com/sambacha/ofac-list) | 15 | OFAC SDN list formatted for on-chain use. Ethereum address → OFAC match lookup. | `src/ingestion` — crypto sanctions list |
| 49 | [slowmist/automatic-tron-address-clustering](https://github.com/slowmist/automatic-tron-address-clustering) | 13 | ML + graph algorithms to cluster TRON addresses and track illicit fund flows. SlowMist (leading blockchain security firm). | `src/brain` — crypto clustering mode |
| 50 | [januusio/cryptowallet_risk_scoring](https://github.com/januusio/cryptowallet_risk_scoring) | 233 | Explainable crypto wallet risk scores. Direct + indirect OFAC exposure, entity classification, layering signals. | `src/brain` — crypto/DeFi risk modes |
| 51 | [brandonhimpfen/awesome-crypto-compliance](https://github.com/brandonhimpfen/awesome-crypto-compliance) | 5 | Curated list of crypto AML/KYC tools, frameworks, and regulatory resources. Research reference. | `docs/` — crypto compliance reference |

---

## 8. LLM / Agentic Compliance (4 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 52 | [zoharbabin/due-diligence-agents](https://github.com/zoharbabin/due-diligence-agents) | 9 | Multi-agent M&A due diligence: legal, financial, commercial, and technical analysis across contracts with exact citation cross-referencing. | `src/brain` — due diligence agent pattern |
| 53 | [luuisotorres/AML-MultiAgent-RAG](https://github.com/luuisotorres/AML-MultiAgent-RAG) | 14 | Multi-agent RAG over AML/CFT compliance documents. Vector store of FATF reports, typologies, regulatory circulars. | `src/brain` — compliance Q&A / RAG |
| 54 | [taranis-ai/taranis-ai](https://github.com/taranis-ai/taranis-ai) | 1001 | AI news OSINT with analyst workflow, NLP clustering, and report generation. Full production system. | `src/ingestion` — adverse-media AI pipeline |
| 55 | [koala73/worldmonitor](https://github.com/koala73/worldmonitor) | 52K | Real-time global intelligence dashboard (AI news aggregation, geopolitical monitoring). TypeScript + AI. Reference for the Hawkeye dashboard UX. | `web/` — dashboard UX pattern |

---

## 9. Forensic Accounting & Risk (3 repos)

| # | Repository | ★ | What to Extract | HS Module |
|---|-----------|---|-----------------|-----------|
| 56 | [chirindaopensource/search_benford_law_compatibility](https://github.com/chirindaopensource/search_benford_law_compatibility) | 0 | Full forensic accounting pipeline: Benford χ² + MAD test, risk-based prioritisation, reproducible methodology. | `src/brain` — Benford forensic mode |
| 57 | [yas304/SENTINTEL-AI-DRIFT-AUDITOR](https://github.com/yas304/SENTINTEL-AI-DRIFT-AUDITOR) | 0 | AI governance: audits deployed ML models for bias, drift, and explainability risks. Generates audit-ready compliance reports. | `src/brain` — introspection/bias-audit faculty |

---

## Priority Integration Shortlist (Top 10 for Immediate Value)

| Priority | Repo | Why Now |
|----------|------|---------|
| ★★★ | `opensanctions/opensanctions` | Extends your direct-source ingestion with 120+ lists you don't yet cover |
| ★★★ | `opensanctions/yente` | Self-hostable fuzzy-matching API — replaces ad-hoc name matching today |
| ★★★ | `opensanctions/followthemoney` | Shared entity ontology across all data sources — unifies your schema |
| ★★★ | `IBM/AMLSim` | Generates synthetic test cases for all 14 laundering patterns — fills test gap |
| ★★★ | `safe-graph/DGFraud` | Adds 8 production-ready GNN fraud algorithms to `src/brain` graph modes |
| ★★ | `yzhao062/pyod` | 60 anomaly detectors in one library — underpins statistical/forensic modes |
| ★★ | `taranis-ai/taranis-ai` | AI adverse-media pipeline — replaces keyword scraping with NLP clustering |
| ★★ | `pygod-team/pygod` | Graph outlier detection — detects anomalous ownership nodes in entity graphs |
| ★★ | `januusio/cryptowallet_risk_scoring` | Explainable crypto risk scores with OFAC exposure breakdown |
| ★★ | `ggravlingen/pygleif` | LEI → legal entity name + jurisdiction + ownership — free, direct-source |
