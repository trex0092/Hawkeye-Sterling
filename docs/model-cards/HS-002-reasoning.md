# Model Card: Reasoning Mode Executor
## HS-002 — Version 2.3.1

**Document ID:** HS-MC-002
**Status:** Production
**Last Updated:** 2026-05-06

---

## 1. System Identification

| Field | Value |
|---|---|
| System ID | HS-002 |
| System Name | Reasoning Mode Executor |
| Version | 2.3.1 |
| Primary Source | `src/brain/engine.ts`, `src/brain/reasoning-modes.ts` |
| Powered by | Anthropic Claude (`claude-sonnet-4-6` / `claude-opus-4-7`) via `EXECUTOR_MODEL` / `ADVISOR_MODEL` env vars |

---

## 2. Purpose

The Reasoning Mode Executor is the cognitive core of Hawkeye Sterling. It executes named, versioned, hashable reasoning modes against the evidence context assembled by HS-001. It is not an LLM prompt alone — it is a structured registry of 373+ reasoning functions, each with a declared faculty, category, stable ID, and callable `apply(ctx)`. After all modes run, it executes an introspection meta-reasoning pass that audits its own output.

---

## 3. Reasoning Mode Registry

### Wave 1+2 — Core Registry (273 modes)

| Category | Count | Examples |
|---|---|---|
| Logic | 21 | Deduction, induction, abduction, counterfactual |
| Cognitive Science | 22 | Framing effects, anchoring, availability heuristic |
| Decision Theory | 15 | Expected utility, minimax regret, dominance |
| Forensic | 37 | Benford's Law χ², Shannon entropy, transaction velocity |
| Compliance Framework | 30 | FATF Rec. mapping, DNFBP obligations, SDD criteria |
| Legal Reasoning | 10 | Proportionality, burden of proof, presumption |
| Strategic | 10 | Game theory, Nash equilibrium, red-queen |
| Causal | 5 | Causal DAG, do-calculus, counterfactual causal |
| Statistical | 18 | Bayesian update, confidence interval, regression |
| Graph Analysis | 10 | Centrality, community detection, path analysis |
| Threat Modeling | 14 | STRIDE, kill chain, adversarial simulation |
| Behavioral Signals | 5 | Velocity anomaly, dormant-to-active, midnight burst |
| Data Quality | 10 | Completeness audit, source triangulation, consistency |
| Governance | 16 | Policy alignment, control effectiveness, gap analysis |
| Crypto/DeFi | 16 | Address clustering, chain hop, mixer forensics |
| Sectoral Typology | 24 | DPMS cash structuring, bullion anomaly, art provenance |
| OSINT | 6 | SOCMINT, GEOINT, source grading |
| ESG | 4 | Greenwashing, forced labour, conflict minerals |
| **Total** | **273** | |

### Wave 3 — Intelligence Expansion (100+ modes, wired into MODE_OVERRIDES)

| Cluster | Modes | Count |
|---|---|---|
| Sanctions / Proliferation | `nested_designation_match`, `dual_use_chemical_routing`, `proliferation_finance_unscr1540`, `ransomware_payment_indicator`, `iran_oil_sts_transfer`, `russia_oil_price_cap_evasion`, `dprk_it_worker_payment`, `vessel_callsign_manipulation`, `sanctioned_jurisdiction_layering`, `fronting_company_indicator` | 10 |
| TBML | `tbml_invoice_manipulation`, `phantom_shipment_detection`, `carousel_vat_fraud`, `circular_trade_pattern`, `multi_invoicing_anomaly`, `mis_described_goods`, `transfer_pricing_manipulation`, `round_tripping_pattern`, `import_export_ratio_anomaly` | 9 |
| Crypto / DeFi | `mixer_forensics`, `utxo_clustering`, `bridge_crossing_trace`, `crypto_chain_hop_layering`, `nft_wash_trading`, `travel_rule_compliance_gap`, `unhosted_wallet_high_volume`, `peeling_chain_pattern`, `coinjoin_participation`, `tornado_cash_proximity`, `lazarus_address_match`, `ofac_sdn_address_match`, `defi_recursive_loan`, `smart_contract_drain`, `flash_loan_attack_pattern`, `rugpull_indicator`, `stablecoin_arbitrage_anomaly` | 17 |
| Trade / Cargo | `vessel_ais_gap`, `dual_use_goods_routing`, `gold_smuggling_corridor` | 3 |
| DPMS / Sectoral | `dpms_cash_structuring_split`, `dpms_fictitious_supplier`, `precious_stones_provenance_gap`, `bullion_warehouse_anomaly`, `assay_certificate_inconsistency`, `art_auction_provenance_gap`, `casino_chip_dumping`, `real_estate_underpricing`, `hawala_ivts_pattern`, `cash_courier_threshold` | 10 |
| Network / Professional | `mule_cluster_detection`, `professional_enabler_pattern`, `legal_pooled_account_abuse` | 3 |
| Banking | `wire_stripping_indicator`, `correspondent_banking_nesting` | 2 |
| UBO / Structures | `shell_company_indicator`, `ftz_layered_ownership`, `family_office_trust_transparency`, `dormant_company_reactivation`, `director_resignation_cluster`, `registered_agent_concentration`, `mass_filing_same_day`, `nested_designation_match` | 8 |
| PEP / Corruption | `pep_proximity_chain`, `domestic_pep_concentration`, `soe_executive_payout`, `electoral_window_anomaly`, `judicial_payment_correlation`, `procurement_kickback_pattern`, `extractive_payment_opacity` | 7 |
| Predicate Offences | `human_trafficking_pattern`, `wildlife_trafficking_indicator`, `drug_proceeds_indicator`, `illegal_logging_payment`, `tax_evasion_offshore`, `fraud_419_pattern`, `counterfeit_supply_chain`, `smuggling_corridor_uae` | 8 |
| TF / NPO | `npo_high_risk_outflow` | 1 |
| KYC / Identity | `non_face_to_face_kyc_anomaly`, `synthetic_identity_indicator`, `id_document_deepfake`, `address_aggregation_red_flag`, `multi_account_same_device`, `disposable_email_signal`, `voip_phone_anomaly`, `sim_swap_indicator`, `velocity_account_creation` | 9 |
| Behavioral | `rapid_layering_pattern`, `funnel_account_indicator`, `circular_payment_loop`, `dormant_to_active_anomaly`, `round_amount_clustering`, `midnight_burst_pattern`, `salary_account_misuse`, `atm_density_anomaly`, `impossible_geo_velocity`, `chargeback_ring_pattern` | 10 |
| Securities / Insurance | `insurance_premium_dump`, `life_policy_third_party_assignment`, `securities_swap_layering`, `wash_trading_securities`, `spoofing_layering`, `pump_and_dump_indicator` | 6 |

### Five Production-Grade Mode Implementations

The following modes ship with full production logic (not stubs):

| Mode | Logic |
|---|---|
| Benford's Law | χ² test against expected digit distribution |
| Shannon entropy | Information-theoretic anomaly detection on transaction patterns |
| Transaction velocity | Rolling window velocity computation against jurisdiction-specific thresholds |
| Source triangulation | Multi-source consistency scoring across evidence inputs |
| Completeness audit | Mandatory-field coverage check against minimum evidence standard |

---

## 4. Introspection Meta-Reasoning Pass

After all modes complete, the executor runs a self-audit producing `[meta]`-tagged findings appended to the reasoning chain:

| Meta-Check | Trigger | Action |
|---|---|---|
| Cross-category contradiction | Same category carries both `clear` and non-clear verdict | Escalate for human adjudication |
| Under-triangulation | Fewer than 3 faculties engaged on substantive evidence | Broaden investigation; flag in gaps |
| Over-confidence on zero score | Suspiciously tight high-confidence `clear` | Treat with suspicion; increase scrutiny |
| Calibration collapse | Variance of finding confidences σ < 0.05 | Flag to MLRO; Data Science review |

---

## 5. Version Control Requirements

Every mode in the registry must carry:

```typescript
interface ReasoningModeVersion {
  modeId: string;       // stable, unique
  version: string;      // semver: e.g. "2.1.0"
  deployedDate: string; // ISO 8601
  contentHash: string;  // SHA-256 of apply() implementation
  author: string;       // team or individual
  approvedBy: string;   // MLRO or governance board
  changeLog: string;    // one-line description of change
}
```

Modes without version metadata fail CI. Changes to any mode require governance approval before merge.

---

## 6. Performance Monitoring

| Metric | Endpoint | Frequency |
|---|---|---|
| Per-mode Brier / log-score | `GET /api/mlro/brier` | Hourly |
| Calibration drift | `GET /api/mlro/drift-alerts` + `src/brain/drift-alerts.ts` | Continuous |
| Mode effectiveness leaderboard | `GET /api/mlro/mode-performance` | Hourly |
| Prefix self-tuning | `src/brain/prefix-self-tuner.ts` | Weekly |
| Typology prior recalibration | `src/brain/typology-prior-calibration.ts` | Monthly |

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Science Lead | | | |
| MLRO | | | |
