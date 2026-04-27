# Code Review: taranis-ai/taranis-ai

**Repository:** https://github.com/taranis-ai/taranis-ai  
**Version:** 1.3.6 (released 2026-04-01)  
**Stars:** 1,000+ | **Forks:** 129 | **Open Issues:** 118  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Taranis AI is an open-source OSINT platform that uses NLP and AI to automate intelligence gathering, enrichment, and structured reporting from unstructured web/news sources. It operates as a four-service containerised system: ingress proxy, frontend (Flask + HTMX), core REST API, and async worker processes (collectors, bots, presenters, publishers) backed by PostgreSQL and Redis.

For Hawkeye Sterling, Taranis AI is the **adverse media monitoring and OSINT enrichment pipeline**: it replaces manual news monitoring with an automated collection-to-analysis workflow. The collector/bot architecture maps directly to Hawkeye Sterling's need to screen subjects against adverse media across thousands of sources on a continuous basis.

---

## Architecture

```
Nginx (ingress)
    ↓
Frontend (Flask + HTMX + Tailwind)   ← Analyst UI
    ↓
Core (REST API + PostgreSQL)          ← Entity/report storage
    ↓
Worker (RQ/Redis queue)
    ├── Collectors   ← Ingest from web/RSS/API sources
    ├── Bots         ← NLP enrichment, classification, tagging
    ├── Presenters   ← Structure enriched content into reports
    └── Publishers   ← Distribute to PDF, external systems, MISP

SSE Broker ← Real-time push to analyst dashboard
```

**Language:** Python 83.5%, HTML 15.4%  
**Database:** PostgreSQL (production) or SQLite (development)  
**Queue:** RQ (Redis Queue) for async job processing

---

## Strengths

### 1. Collector → Bot → Presenter → Publisher Pipeline

The four-stage worker pipeline is architecturally correct for continuous OSINT:

- **Collectors** handle source-specific ingestion (HTTP feeds, RSS, APIs) and normalise raw content
- **Bots** apply NLP enrichment: named entity recognition, classification, summarisation, quality scoring
- **Presenters** format enriched content into structured analyst-ready reports
- **Publishers** distribute outputs: PDF, MISP threat sharing, downstream APIs

This separation means adding a new data source only requires a new Collector, without touching the enrichment or reporting pipeline. Adding a new output format only requires a new Presenter.

### 2. SSE Broker for Real-Time Updates

Taranis AI ships a Server-Sent Events broker for live dashboard updates. As new intelligence items are collected and processed, they push to the analyst UI in real time without polling. This is the correct pattern for a live threat monitoring dashboard — the same approach used by Crucix (reviewed separately) but with a more structured data model behind it.

### 3. RQ / Redis Async Job Queue

Long-running NLP operations (article summarisation, entity extraction, translation) run as RQ jobs, not in the HTTP request cycle. This prevents timeout failures on slow sources and allows job retries on transient failures. Queue depth and job status are monitorable via standard Redis tooling.

### 4. MISP Integration for Threat Intelligence Sharing

Taranis AI has an experimental integration with MISP (Malware Information Sharing Platform), the de facto standard for structured threat intelligence sharing. While experimental, this provides a pathway to sharing Hawkeye Sterling's adverse media findings with partner institutions through a standardised IOC format.

### 5. Actively Maintained

Version 1.3.6 was released April 1, 2026 — the project is in active development. The 1,000+ stars and 129 forks indicate substantial adoption in the security/intelligence community.

---

## Issues and Concerns

### 1. License Is EUPL-1.2 — Copyleft With Commercial Restrictions

**Severity: High**

Taranis AI is licensed under the European Union Public Licence 1.2 (EUPL-1.2). The EUPL is a copyleft licence: if Hawkeye Sterling incorporates Taranis AI as a component and distributes the result (including as a SaaS service to clients), the EUPL may require making the combined work's source code available under a compatible licence.

The EUPL's "compatible licences" list includes GPL, AGPL, EUPL, and others — but not MIT, Apache 2.0, or BSD. If Hawkeye Sterling is or will be a commercial proprietary product, direct code integration is legally risky.

**Recommendation:** Treat Taranis AI as an **adjacent service**, not an embedded library. Deploy it as a separate microservice and consume its REST API output. API-level consumption of EUPL software does not trigger the copyleft obligation (the "network boundary" is sufficient). Do not import Taranis AI Python modules into Hawkeye Sterling's own codebase.

### 2. 16 GB RAM Requirement for Full NLP

**Severity: Medium**

Full NLP features (entity recognition, summarisation, classification) require 16GB RAM and 4 CPU cores. Minimal deployment (ingestion only, no AI enrichment) requires 2GB RAM. In a shared cloud environment with multiple Hawkeye Sterling services, the NLP worker pod will be the largest resource consumer.

**Recommendation:** Deploy the NLP worker as a dedicated pod with node affinity. For development and CI, disable NLP bots and use the minimal configuration to reduce resource usage.

### 3. 118 Open Issues

**Severity: Low–Medium**

118 open issues against a single-repository project indicates either active community engagement or a maintenance backlog. Without reviewing the issue breakdown (bugs vs. feature requests vs. questions), the count is a yellow flag for stability.

**Recommendation:** Before deploying in production, audit the open issues for data-loss bugs, security vulnerabilities, or Collector crashes. Prioritise reviewing issues related to any data sources Hawkeye Sterling intends to use.

### 4. Flask Frontend Is Synchronous

**Severity: Low–Medium**

The frontend service is Flask-based. Flask's default WSGI server is single-threaded and not suitable for high-concurrency. Under load from many simultaneous analyst sessions or high-frequency SSE streams, the frontend will bottleneck.

**Recommendation:** Deploy Flask behind Gunicorn with multiple workers (`gunicorn -w 4`). If real-time SSE throughput becomes a bottleneck, migrate the SSE broker to a dedicated async service (FastAPI + anyio or a Redis pub-sub forwarder).

### 5. AI/ML Enrichment Details Are Opaque

**Severity: Low–Medium**

The repository describes NLP enrichment and "AI-augmented articles" but does not clearly document which NLP models are used, whether they are local (transformers) or remote API calls (OpenAI/Anthropic), and what the quality/accuracy characteristics are for financial crime-relevant entity types (company names, jurisdiction names, financial terms).

**Recommendation:** Review the Bot implementations in `src/worker/bots/` before deploying in production to understand which model provider is called and what data is sent externally. If Taranis AI sends article text to external LLM APIs, this is a data residency issue for compliance-sensitive deployments.

---

## Integration Architecture for Hawkeye Sterling

```
                  Taranis AI (separate service)
┌───────────────────────────────────────────────┐
│  Collectors: RSS/web/news sources             │
│      ↓                                        │
│  Bots: NER, classification, summarisation     │
│      ↓                                        │
│  Core REST API (items, reports, tags)         │
└─────────────┬─────────────────────────────────┘
              │  HTTP REST (API boundary — EUPL safe)
              ↓
┌─────────────────────────────────────┐
│  src/ingestion/adverse_media.ts     │  Pull new items on schedule
│  src/brain/adverse_media_mode.ts   │  Match entities, score relevance
│  src/services/taranis_client.ts    │  Typed API wrapper             
│  web/ dashboard                     │  Surface high-relevance hits  
└─────────────────────────────────────┘
```

### Which HS Modules

| Taranis AI Component | HS Module | Integration |
|---------------------|-----------|-------------|
| Collectors (web/RSS) | `src/ingestion/` | Adverse media source ingestion |
| NLP Bots (NER, classification) | `src/brain/` | Named entity → HS subject matching |
| Core REST API items endpoint | `src/services/taranis_client.ts` | Scheduled polling for new intelligence |
| SSE broker | `web/` | Live adverse media alert feed in dashboard |
| Presenters (PDF reports) | `src/services/` | Compliance evidence package generation |
| MISP publisher | Future: threat intel sharing | Share HS flags with partner institutions |

### Recommended `src/services/taranis_client.ts` Contract

```typescript
interface TaranisItem {
  id: string;
  title: string;
  content: string;
  source: string;
  published: string;       // ISO timestamp
  tags: string[];
  entities: { name: string; type: string }[];  // NER output
  relevance_score: number;
}

async function fetchAdverseMedia(subject: FtMEntity): Promise<TaranisItem[]> {
  const query = `${subject.name} ${subject.jurisdiction ?? ''}`.trim();
  const resp = await fetch(`${TARANIS_URL}/api/v1/osint-items?q=${encodeURIComponent(query)}`);
  return resp.json();
}
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Pipeline architecture | Very Good | Collector→Bot→Presenter→Publisher is correct design |
| AI/ML features | Good | NLP enrichment, NER; specific models undocumented |
| Real-time updates | Very Good | SSE broker built in |
| Resource requirements | Fair | 16GB RAM for full NLP — significant |
| License | Caution | EUPL-1.2 copyleft — API boundary required |
| Open issues | Fair | 118 issues — audit before production use |
| HS fit | ★★☆ | Strong adverse media pipeline — deploy as adjacent service |

---

## Recommendation

**Deploy as an adjacent OSINT microservice, not an embedded library.** The EUPL-1.2 licence prohibits direct code integration into a proprietary product, but API-level consumption is clean. The collector/bot architecture is exactly what Hawkeye Sterling needs for continuous adverse media monitoring.

**Deployment steps:**
1. Deploy Taranis AI in its own Docker pod (separate from HS stack)
2. Configure Collectors for financial crime news sources (Reuters, Bloomberg, OCCRP, FATF publications)
3. Tune NLP Bots for financial entity types (company names, jurisdictions, PEP names)
4. Write `src/services/taranis_client.ts` to poll for new items and match against active HS subjects
5. Surface high-relevance hits in the HS analyst dashboard via the HS SSE stream
