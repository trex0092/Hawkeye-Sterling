# Code Review: koala73/worldmonitor

**Repository:** https://github.com/koala73/worldmonitor  
**Stars:** 52,000+ | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

WorldMonitor is a real-time global intelligence dashboard that aggregates AI-curated news, geopolitical events, conflict monitoring, and macroeconomic signals into a live-updating web interface. Built in TypeScript with AI-powered news summarisation and categorisation, it is the leading open-source reference implementation for an intelligence monitoring dashboard UX. With 52K stars, it is one of the most widely starred intelligence-category repositories on GitHub.

For Hawkeye Sterling, WorldMonitor is the **dashboard UX pattern reference** for `web/` — specifically for the Intel feed page (adverse media, geopolitical risk) and the regulatory feed page (sanctions updates, enforcement actions), providing battle-tested UI patterns for displaying real-time intelligence streams.

**License:** MIT — fully permissive.

---

## What the Tool Does

```
Data sources:
    ├── RSS/Atom feeds (news agencies, government, NGOs)
    ├── GDELT project (global event database)
    ├── News APIs (NewsAPI, GDELT, Mediastack)
    └── Social media signals
    ↓
Backend (TypeScript / Node.js)
    ├── Feed aggregator (polling, deduplication, normalisation)
    ├── AI summarisation (OpenAI/Anthropic API)
    │       Per-article: 2-sentence summary, category tag, sentiment
    ├── Geopolitical categorisation
    │       Conflict, sanctions, election, economic, natural disaster
    └── Real-time push to frontend (WebSocket / SSE)
    ↓
Frontend (React/Next.js TypeScript)
    ├── Live map view: events plotted by geographic origin
    ├── Feed view: chronological intelligence stream with AI summaries
    ├── Category filters: conflict / sanctions / economic / political
    ├── Entity spotlight: country/region drill-down
    └── Severity/risk tiering: colour-coded event criticality
```

**Core feed component pattern (TypeScript/React):**
```typescript
interface IntelItem {
  id:           string;
  headline:     string;
  summary:      string;       // AI-generated 2-sentence summary
  category:     IntelCategory; // SANCTIONS | CONFLICT | REGULATORY | ECONOMIC
  severity:     'critical' | 'elevated' | 'moderate' | 'low';
  source:       string;
  published_at: Date;
  geo:          { lat: number; lng: number; country: string };
  entities:     string[];     // Named entities extracted from article
}

// Real-time stream component
<IntelFeed
  items={intelItems}
  onItemClick={openDetailPanel}
  filterCategories={activeFilters}
  severityThreshold="moderate"
/>
```

---

## Strengths

### 1. 52K Stars — Production-Grade UX Patterns

52K stars means this dashboard UX has been reviewed and adopted by tens of thousands of developers. The component architecture, real-time update patterns, and information density decisions have been validated at scale. For a compliance dashboard where analysts spend 8+ hours per day, UX quality directly affects alert fatigue and investigative efficiency.

### 2. Severity Tiering and Colour Coding

WorldMonitor's visual severity tiering (critical / elevated / moderate / low with colour coding and iconography) is directly applicable to Hawkeye Sterling's alert severity display. The visual grammar — red for critical, amber for elevated, grey for informational — is recognisable to compliance analysts familiar with Bloomberg Terminal and SWIFT GPI dashboards.

### 3. Live Map Geospatial Overlay

Plotting intelligence events on an interactive map (country, city level) gives analysts rapid geographic context. For HS, this is directly applicable: a sanctions alert from Russia, an adverse media story from Panama, and a new FATF grey-listing can all be plotted simultaneously to show whether a customer's counterparty network is concentrated in a specific risk geography.

### 4. Category Filter Architecture

The category filter system (toggle by category type, severity threshold slider) is a UI pattern directly reusable for Hawkeye Sterling's Intel and regulatory feed pages. Compliance analysts need to filter the regulatory feed to show only OFAC updates, or only FCA enforcement actions, without rebuilding the feed component.

### 5. AI Summary Integration

The per-article AI summarisation pattern (2-sentence summary from full article text) is the correct approach for high-volume adverse media feeds. Analysts cannot read 200 full articles per day; they need AI-summarised headlines with a click-through to the full article for relevant items.

---

## Issues and Concerns

### 1. No Compliance / Entity-Specific Alerting

**Severity: Medium**

WorldMonitor is a general intelligence dashboard — it monitors world events without entity-specific relevance filtering. Hawkeye Sterling's Intel feed needs to surface only articles relevant to screened entities or their counterparty networks. The naive approach (show all news) produces alert fatigue.

**Recommendation:** Add an entity relevance layer in `src/ingestion/adverse_media_filter.ts` that scores each incoming Intel item against the active customer/entity watchlist using NER entity extraction and name matching. Display only items with relevance_score > threshold.

### 2. OpenAI API Dependency for Summarisation

**Severity: Low**

WorldMonitor uses OpenAI API for AI summarisation. For a compliance context where news articles may contain sensitive information about investigations, routing all articles through a third-party API has data handling implications.

**Recommendation:** Replace OpenAI summarisation with a self-hosted LLM (Ollama + LLaMA 3.1 8B is sufficient for 2-sentence news summarisation) to keep article content within HS's infrastructure perimeter.

### 3. GDELT Data Volume Management

**Severity: Low**

GDELT generates 50,000+ events per day globally. For an AML compliance feed, displaying all GDELT events creates noise. The WorldMonitor implementation does not appear to provide strong relevance pre-filtering.

**Recommendation:** Pre-filter GDELT events to AML-relevant CAMEO event codes (sanctions imposition, financial regulatory action, arrest related to financial crime) before ingesting into the HS Intel feed.

---

## Integration Architecture for Hawkeye Sterling

```
web/pages/intel.tsx          ← WorldMonitor feed component adapted
    ├── <IntelFeed>           pattern from WorldMonitor
    │       items: adverse_media + geopolitical_risk + regulatory_updates
    │       filter: category (SANCTIONS | REGULATORY | ADVERSE_MEDIA)
    │       severity_threshold: configurable per analyst preference
    │       entity_filter: show only items mentioning watchlist entities
    └── <GeoRiskMap>          geospatial overlay
            country risk colouring (FATF grey/blacklist + sanctions regime)
            event pins for recent designations and enforcement actions

web/pages/regulatory.tsx     ← WorldMonitor feed component adapted
    ├── <RegulatoryFeed>
    │       OFAC updates, FCA enforcement, FinCEN advisories
    │       FATF grey/blacklist changes
    └── AI 2-sentence summary per item (self-hosted LLM)
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Community validation | Excellent | 52K stars — most validated in this review set |
| Dashboard UX patterns | Excellent | Severity tiering, map, category filters |
| AI summarisation | Good | Replace OpenAI with self-hosted for data handling |
| Entity relevance filtering | Poor | Not built in — add NER relevance layer |
| GDELT noise management | Caution | Pre-filter to AML-relevant CAMEO codes |
| Licensing | Excellent | MIT |
| HS fit | ★★★ | Web layer UX reference — highest community validation |

---

## Recommendation

**Use as the primary UX reference and component library for the Hawkeye Sterling Intel and regulatory feed pages.** Adapt the `<IntelFeed>`, `<GeoRiskMap>`, and category filter components for AML-specific data. Add an entity relevance pre-filter layer in `src/ingestion`. Replace OpenAI summarisation with a self-hosted LLM. Pre-filter GDELT to AML-relevant event codes. This is the most community-validated repository in the entire reviewed set — the UX patterns are production-proven at scale.
