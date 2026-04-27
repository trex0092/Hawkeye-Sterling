# Code Review: januusio/cryptowallet_risk_scoring

**Repository:** https://github.com/januusio/cryptowallet_risk_scoring  
**Stars:** 233 | **Forks:** 56 | **Open Issues:** 7  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

`cryptowallet_risk_scoring` is a Python library wrapping the Januus API for cryptocurrency wallet AML risk scoring. It evaluates Ethereum, Bitcoin, and Tron addresses across three risk dimensions — Reputation, Fraud, and Lending — using on-chain transaction graph traversal, sanctions data, and a proprietary dataset of known bad actors (darknet, ransomware, heist wallets). Results include per-factor offsets that explain exactly what drove the score.

For Hawkeye Sterling, this is the **crypto-asset screening module**: it extends traditional fiat AML screening to blockchain addresses, enabling detection of sanctions evasion via crypto, darknet proceeds, and ransomware payments in the subject's transaction history.

**License:** MPL-2.0 — weak copyleft at the file level; proprietary wrappers are permitted without disclosure obligation.

---

## What the Tool Does

```
Input: ETH / BTC / TRX wallet address(es)
    ↓
Januus API (proprietary backend)
    ├── On-chain transaction graph traversal (N degrees of separation)
    ├── Sanctions cross-reference (OFAC, terrorism lists)
    └── Known bad-actor database (darknet, ransomware, heist, NFT theft wallets)
    ↓
Output: JSON risk report
    ├── reputation_risk: 0–100
    ├── fraud_risk: 0–100
    ├── lending_risk: 0–100
    └── reasons: [{ label, offset, description }]
```

**Supported blockchains:** Ethereum (ETH), Bitcoin (BTC), Tron (TRX)

---

## Risk Score Structure

| Score | Interpretation |
|-------|---------------|
| < 25 | Good — engage normally |
| ~30 | Neutral |
| ≥ 60 | Failing — do not engage |
| > 80 | Supremely high risk |

**Five explainability reason labels:**

| Label | AML Meaning |
|-------|-------------|
| `sent-to-bad-actor` | Direct outbound exposure to flagged wallet |
| `funded-by-bad-actor` | Received funds from flagged wallet (indirect taint) |
| `bad-zero-valued-txs` | Spam/phishing transaction pattern |
| `is-bad-actor` | Wallet itself is on a bad-actor list |
| `date-verification` | Temporal anomaly in transaction history |

Each reason carries a numeric `offset` — its contribution to the total score. This makes the output directly usable in a SAR narrative.

---

## API Design

```python
from januus_riskreport import riskreport_on_entity

report = riskreport_on_entity(
    eth_addresses=["0xABCD..."],
    btc_addresses=["1A2B3C..."],
)
# {
#   "reputation_risk": 72,
#   "fraud_risk": 85,
#   "lending_risk": 31,
#   "reasons": [
#     { "label": "funded-by-bad-actor", "offset": 45 },
#     { "label": "sent-to-bad-actor",   "offset": 27 }
#   ]
# }
```

**Performance:** 95% of addresses resolve in ≤ 1 second.  
**Rate limit:** 30 queries/minute on the free tier.

---

## Strengths

### 1. Multi-Chain Coverage Where It Matters

ETH, BTC, and TRX are the three blockchains most commonly used for sanctions evasion. Tron (TRX) is the dominant USDT stablecoin transfer network for high-risk jurisdictions — supporting all three with a single call is operationally correct.

### 2. Explainable Per-Factor Offsets

`funded-by-bad-actor (+45) + sent-to-bad-actor (+27)` is a structured audit trail, not a black-box score. Compliance officers can cite specific transaction patterns in a SAR filing rather than relying on an opaque number. This is the correct design for a compliance tool.

### 3. Degrees-of-Separation Graph Traversal

The API analyses the transaction graph several hops out — not just direct counterparties. A wallet that received funds three hops from a sanctioned entity is still a risk. This hop-based analysis is the methodology used by Chainalysis and Elliptic and is the industry standard for crypto-AML.

### 4. Dark Economy Dataset

Data sources explicitly include ransomware creators, darknet traders, NFT thieves, and crypto heist wallets — not only formal sanctions lists. This dark-economy coverage is what distinguishes purpose-built crypto-AML tools from naive OFAC list cross-referencing.

---

## Issues and Concerns

### 1. Free API Endpoint Is Currently Paused

**Severity: Critical**

The documentation explicitly states the free endpoint is "currently paused for maintenance." The library is a thin wrapper around a remote API — without the API it does nothing. There is no offline mode, no local fallback, and no way to test without API access.

**Recommendation:** Contact Januus to confirm whether an enterprise tier with a formal SLA is available. Do not build production HS dependencies on a free-tier API that can be paused unilaterally. If unavailable, evaluate Chainalysis KYT, Elliptic, or TRM Labs — all offer enterprise crypto-AML APIs with documented SLAs and broader chain coverage.

### 2. Proprietary Backend — No Methodology Transparency

**Severity: Medium**

Risk scores come from a proprietary backend. The following are undocumented:
- Update frequency of the bad-actor database
- False positive rate on legitimate high-volume wallets (exchanges, DeFi protocols)
- Degree-of-separation cutoff for taint analysis
- Coverage of privacy coins (Monero, Zcash)

FATF and FinCEN require that AML tool vendors disclose methodology to client compliance teams on request. **Obtain methodology documentation from Januus under NDA before deploying in production.**

### 3. Library Is a Thin Wrapper With No Resilience

**Severity: Medium**

The library has no retry logic, no circuit breaker, no caching, and no async support. A single API timeout blocks the calling thread. Under the 30 req/min rate limit, concurrent screening of a large counterparty list will produce 429 errors with no backoff.

**Recommendation:** Wrap in `src/services/crypto_risk_client.py` with:
- Redis result cache (24h TTL per address — on-chain state changes slowly)
- Exponential backoff retry on transient errors
- Circuit breaker for API outage degradation
- Async batching to respect rate limits

### 4. No ERC-20 / Token-Level Analysis

**Severity: Low**

The API operates on wallet addresses, not specific token flows. A wallet holding only USDT-TRC20 (the dominant sanctions-evasion stablecoin) is scored identically to a native TRX wallet. Token-level DeFi interaction analysis is not documented.

---

## Integration Architecture for Hawkeye Sterling

```
Subject has crypto address on profile
    ↓
src/brain/crypto_screening_mode.ts
    ↓
src/services/crypto_risk_client.py
    ├── Redis cache lookup (address → result, 24h TTL)
    ├── januus riskreport_on_entity() if cache miss
    ├── Parse reasons[] → HS evidence items
    └── Return CryptoRiskResult
    ↓
Score ≥ 60          → alert flag
is-bad-actor        → sanctions escalation
funded-by-bad-actor → indirect taint → SAR note
```

| Januus Component | HS Module | Integration |
|-----------------|-----------|-------------|
| `riskreport_on_entity()` | `src/services/crypto_risk_client.py` | Typed wrapper + cache + retry |
| Risk scores | `src/brain/` | Sanctions-evasion reasoning input |
| `reasons[]` offsets | `web/` report | Explainability for compliance officers |
| Crypto address entity | `src/ingestion/` | `CryptoWallet` FtM entity extension |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Chain coverage | Good | ETH, BTC, TRX — the three highest-risk chains |
| Explainability | Very Good | Per-factor offsets — SAR-ready |
| Graph traversal | Very Good | Hop-based taint analysis (industry standard) |
| API availability | Poor | Free tier paused; enterprise SLA unconfirmed |
| Methodology transparency | Fair | Proprietary — request docs under NDA |
| Code resilience | Poor | No retry, cache, or async |
| License | Good | MPL-2.0 — safe to wrap without modification |
| HS fit | ★★☆ | Essential gap-filler — validate enterprise API first |

---

## Recommendation

**Integrate conditionally — confirm enterprise API availability before building on it.** Crypto-asset screening is a genuine gap in traditional AML stacks, and this library fills it with the right methodology (hop-based taint, explainable offsets). But the paused free endpoint is a hard blocker. Fallback candidates: Chainalysis KYT, Elliptic, TRM Labs.
