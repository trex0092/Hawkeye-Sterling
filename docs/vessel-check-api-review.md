# Code Review: SaltyTaro/vessel-check-api

**Repository:** https://github.com/SaltyTaro/vessel-check-api  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)  
**Stars:** 3

---

## Summary

vessel-check-api is a free REST API for vessel sanctions screening, ownership transparency, and maritime vetting intelligence. Given an IMO number (International Maritime Organization vessel identifier), the API returns OFAC/EU/UN sanctions status, registered ownership chain (flag state, registered owner, technical manager, beneficial owner), port call history, and AIS (Automatic Identification System) tracking data. For Hawkeye Sterling's `src/ingestion/` layer, this fills a significant gap: maritime trade finance and commodity financing cases routinely involve vessel counterparties that current entity-screening tools do not cover.

---

## Architecture

```
Client → POST /vessel/check
  ├── Input: { imo: string, include_ownership?: boolean, include_history?: boolean }
  ↓
vessel-check-api server (Node.js / Express)
  ├── IMO validation (checksum algorithm: IMO 7-digit format)
  ├── Data aggregation layer
  │     ├── OFAC SDN list lookup (IMO-keyed vessel entries)
  │     ├── EU sanctions list lookup (vessel-specific entries)
  │     ├── UN Security Council vessel designations
  │     ├── Equasis / Lloyd's Register ownership chain
  │     └── MarineTraffic AIS position + port call history
  └── Response normalisation → unified JSON
  ↓
Response: {
  imo, vessel_name, flag_state,
  sanctions: [{ list, designation_date, authority, reason }],
  ownership: { registered_owner, technical_manager, beneficial_owner, flag },
  port_calls: [{ port, arrival, departure, cargo_type }],
  risk_indicators: [{ type, description, severity }]
}
```

---

## Key Technical Patterns

**1. IMO Number as the Universal Vessel Key**

Unlike company names (which are non-unique and transliterated), IMO numbers are permanent, unique vessel identifiers assigned at construction and retained through flag changes, name changes, and ownership transfers. The API correctly uses IMO as the primary lookup key, avoiding the name-matching problem entirely for vessels. Hawkeye Sterling should index all vessel counterparties by IMO.

**2. Ownership Chain Traversal**

The ownership lookup traverses the full maritime ownership chain: registered owner (often a single-ship company) → technical manager → beneficial owner (the controlling entity). This mirrors the UBO traversal in corporate entity screening and is essential for identifying sanctioned parties who own vessels through multiple holding layers. The depth is typically 2–3 hops.

**3. AIS Gap Detection as a Risk Indicator**

The API's `risk_indicators` include detection of AIS signal gaps — periods where a vessel's transponder was switched off. AIS gap detection is a core OFAC-recommended indicator for sanctions evasion by vessel (especially relevant for Iran, North Korea, and Russia maritime sanctions). The API flags gaps exceeding a configurable threshold (default 24 hours).

**4. Port Call History for Jurisdiction Analysis**

The port call history endpoint (last 24 months of port visits with cargo type) enables Hawkeye Sterling to assess vessel exposure to sanctioned jurisdictions — a vessel that has called at Iranian ports within the OFAC-relevant look-back period is a significant risk indicator regardless of current sanctions status.

---

## What Hawkeye Sterling Can Extract

- **IMO-keyed vessel screening**: add IMO number as a supported entity type in Hawkeye Sterling's `src/ingestion/` entity model alongside Person, Company, and BankAccount
- **Maritime sanctions lookup**: integrate the `/vessel/check` endpoint into Hawkeye Sterling's screening pipeline for trade finance cases where vessel counterparties appear in deal documentation
- **AIS gap risk indicator**: adopt AIS gap detection as a Hawkeye Sterling forensic indicator — flag transactions involving vessels with documented AIS gaps in the prior 12 months
- **Ownership chain traversal**: the 2–3 hop ownership chain lookup maps to Hawkeye Sterling's beneficial ownership traversal logic; reuse the same resolution pattern
- **Sanctioned port call list**: maintain a list of port calls in OFAC-designated jurisdictions as a transaction-level risk factor

---

## Integration Path

**TypeScript REST client.** The vessel-check-api is a Node.js/Express service with a JSON REST interface — directly callable from Hawkeye Sterling's TypeScript core. Add a `src/services/vesselClient.ts` that wraps the `/vessel/check` endpoint with retries and caching (vessel ownership changes slowly; cache results for 24 hours). Maritime screening is typically triggered when a trade finance transaction document is parsed and an IMO number is extracted — not for every payment.

For entity extraction from trade finance documents (bills of lading, LC applications), add a document parser step that extracts IMO numbers, vessel names, and flag states before calling the vessel screening API.

---

## Caveats

- **Stars: 3 / data source dependency**: the API aggregates from Equasis, MarineTraffic, and public sanctions lists. Data freshness and availability depend on these upstream sources — changes to their access policies would break the API.
- **Free tier limitations**: the API is described as "free" but with no SLA or guaranteed uptime. For production AML screening, Hawkeye Sterling should evaluate commercial maritime data vendors (Windward, Pole Star, MarineTraffic AIS API) as the primary source, with this API as a fallback or development reference.
- **IMO availability**: not all maritime counterparties have IMO numbers — small vessels (under 300 GT), fishing vessels, and inland barges typically do not. The API is limited to IMO-registered oceangoing vessels.
- **AIS data latency**: AIS data can be delayed by up to 12 hours for vessels in remote areas or at anchor. Real-time vessel position tracking requires commercial AIS subscription services.
- **No bulk screening endpoint**: the API is single-vessel per request. For bulk trade finance portfolio screening (e.g., screening all vessels referenced in a letter of credit book), implement a client-side batching loop with rate limiting.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Sanctions coverage | Good | OFAC, EU, UN vessel designations |
| Ownership chain | Very Good | Full 2–3 hop chain, mirrors UBO traversal |
| AIS gap detection | Very Good | Key OFAC-recommended evasion indicator |
| Production SLA | Poor | No SLA, free tier, upstream data dependency |
| Bulk screening | Poor | Single-vessel per request only |
| HS fit | ★★ | Fills maritime screening gap; validate against commercial alternatives |

---

## Recommendation

**Integrate as the maritime screening module in `src/ingestion/`.** Add IMO number as a first-class entity type in Hawkeye Sterling's data model. Use vessel-check-api as the development and testing reference implementation, and evaluate commercial maritime intelligence vendors (Windward Maritime AI, Pole Star) for the production path — they offer SLA-backed data, bulk APIs, and richer AIS history. The AIS gap detection and port-call jurisdiction analysis patterns from this repo are directly applicable regardless of the underlying data source.
