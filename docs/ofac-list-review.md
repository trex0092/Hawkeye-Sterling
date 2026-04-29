# Code Review: sambacha/ofac-list

**Repository:** https://github.com/sambacha/ofac-list  
**Stars:** 15 | **License:** MIT  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

A structured, continuously auto-updated mirror of the OFAC Specially Designated Nationals (SDN) and Consolidated Sanctions List, formatted specifically for programmatic and on-chain use. The repository provides the OFAC SDN list as JSON with Ethereum wallet address → OFAC match lookup, automated via GitHub Actions to stay current with OFAC's daily update cadence. This is a crypto-native repackaging of the official OFAC data.

For Hawkeye Sterling, this is the **crypto-native OFAC sanctions list source** for `src/ingestion` — directly enabling blockchain address screening against the OFAC SDN list without requiring a commercial API or manual data pipeline for Ethereum address lookups.

**License:** MIT — the code and formatting scripts are MIT. The underlying OFAC data is public domain (US government).

---

## What the Tool Does

```
Source: OFAC SDN XML feed (official, daily updates)
    ↓
GitHub Actions workflow (scheduled, daily)
    ├── Fetch latest OFAC SDN XML
    ├── Parse: entities, aliases, address fields
    ├── Extract: Ethereum addresses from digital currency address fields
    │       OFAC SDN format: "Digital Currency Address - ETH: 0x..."
    ├── Build lookup structures:
    │       eth_addresses.json: { "0xABCD...": [{ sdn_entry... }] }
    │       sdn_full.json: full structured SDN list
    └── Commit + push to repository
    ↓
Repository always reflects latest OFAC SDN state

Usage (TypeScript):
    import sdn from 'ofac-list/eth_addresses.json';
    const hit = sdn[address.toLowerCase()];
    // hit: SDN entry or undefined
```

**GitHub Actions schedule:**
```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # daily at 06:00 UTC (after OFAC daily update)
  workflow_dispatch:       # manual trigger
```

---

## Strengths

### 1. Ethereum Address Lookup — Fills a Specific Gap

OFAC explicitly lists Ethereum (and BTC, USDT/TRON, LTC, XMR) wallet addresses for sanctioned entities in its SDN digital currency address fields. Mapping these addresses to entity records enables real-time blockchain address screening. This repository structures those addresses for O(1) lookup — no parsing of OFAC XML required at query time.

### 2. Daily Auto-Update via GitHub Actions

OFAC updates the SDN list multiple times per week, with emergency updates for new designations (e.g., after a major ransomware event or geopolitical designation). The GitHub Actions workflow keeps the repository current, which is essential — an AML tool using a stale sanctions list has a serious compliance gap.

**Recommendation:** Mirror this repository internally and verify the GitHub Actions update timestamp on every use. Set up an alert if the last commit is > 2 days old (potential upstream failure).

### 3. Structured JSON — No XML Parsing at Runtime

The official OFAC SDN list is distributed as XML (and CSV), which requires parsing at query time. This repository pre-processes it to JSON, enabling direct import or static file serving. For high-volume blockchain transaction screening (thousands of addresses per second), O(1) JSON lookup significantly outperforms XML parsing.

### 4. Full SDN Entity Data Retained

Beyond Ethereum addresses, the structured JSON retains the full SDN entity record: entity name, aliases, date of birth, address, passport numbers, programme (IRAN, RUSSIA, SDGT, etc.), and remarks. This enables the HS screening engine to present full entity context for any address match.

---

## Issues and Concerns

### 1. Ethereum-Only Address Coverage

**Severity: Medium**

OFAC designates wallet addresses across multiple chains: BTC, ETH, USDT (TRON), XMR, LTC, DASH, and others. This repository's primary focus is Ethereum address lookup. Bitcoin and TRON USDT addresses are the higher-volume channels for sanctions evasion (based on Chainalysis reporting).

**Recommendation:** Supplement with a BTC address index (OFAC lists BTC addresses explicitly in the SDN XML) and TRON/USDT addresses. The same GitHub Actions pattern can produce `btc_addresses.json` and `tron_addresses.json`.

### 2. No Fuzzy / Near-Match for Entity Names

**Severity: Medium**

The repository provides exact Ethereum address lookup but does not support fuzzy name matching for the entity records. The SDN entity name search (e.g., "Mikhail Ivanov" vs "Mikhail Ivanov-Petrov") requires a separate fuzzy matching layer.

**Recommendation:** Use this repository for blockchain address screening only. Wire entity name matching through HS's existing fuzzy name screening engine (Jaro-Winkler, token-sorted ratio), not through this repository's JSON structure.

### 3. 15 Stars — Not a High-Profile Repository

**Severity: Low**

15 stars is low for a compliance tool. The data itself is authoritative (sourced directly from OFAC), but the parsing and structuring scripts should be audited to confirm they correctly extract all digital currency address fields from the SDN XML without losing any entries.

**Recommendation:** Run a spot-check: take 10 known OFAC-designated Ethereum addresses (Lazarus Group, Tornado Cash, etc.) and verify they appear correctly in the JSON index.

---

## Integration Architecture for Hawkeye Sterling

```
Crypto transaction event (deposit / withdrawal)
    ↓
src/ingestion/crypto_address_screener.ts
    ├── Normalise address: toLowerCase(), strip checksums
    ├── ETH: lookup in ofac_eth_addresses.json (in-memory Map)
    │       → hit: { sdn_entry, programme, aliases, remarks }
    │       → miss: clean
    ├── BTC: lookup in ofac_btc_addresses.json (extend this repo)
    ├── TRON: lookup in ofac_tron_addresses.json (extend this repo)
    └── Hit → SANCTIONS_ALERT with full SDN entity record
    ↓
src/brain/sanctions_alert_mode.ts
    ├── Block transaction
    ├── File OFAC match report
    └── Escalate to compliance officer
```

**Update ingestion:**
```typescript
// Mirror repo, refresh daily
const OFAC_MIRROR_URL = 'https://internal-mirror/ofac-list';
// Alert if last_updated > 48 hours
```

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Ethereum address lookup | Excellent | O(1) JSON lookup, structured SDN data |
| Update cadence | Good | Daily GitHub Actions, mirrors OFAC updates |
| Data authority | Excellent | Direct OFAC SDN source |
| BTC/TRON coverage | Poor | ETH focus; BTC/TRON must be added |
| Entity name search | Not applicable | Blockchain address lookup only |
| Licensing | Excellent | MIT + public domain OFAC data |
| HS fit | ★★★ | Crypto OFAC screening — extend to BTC/TRON |

---

## Recommendation

**Integrate as the Ethereum address sanctions screener** in `src/ingestion`. Mirror the repository internally with a freshness check. Extend the GitHub Actions workflow pattern to produce BTC and TRON address indices, covering the higher-volume fiat-to-crypto channels. Verify address coverage spot-check (Lazarus Group, Tornado Cash) before production deployment.
