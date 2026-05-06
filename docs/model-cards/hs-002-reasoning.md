# Model Card — HS-002 Reasoning Mode Executor

| Field | Value |
|---|---|
| **System ID** | HS-002 |
| **Version** | v2.3.1 |
| **Status** | Production |
| **Classification** | AML/CFT Decision-Support — Reasoning Infrastructure |
| **Owner** | Data Science (primary) / MLRO (accountability) |
| **Last Updated** | 2026-05-06 |
| **Next Review** | 2026-11-06 |
| **Regulatory Framework** | UAE FDL 20/2018 (as amended by FDL 10/2025); FATF R.15; UAE AI Governance Policy |

---

## 1. System Description

HS-002 is the reasoning orchestration layer of Hawkeye Sterling. It receives a subject context and a set of activated cognitive faculties from HS-001, selects the appropriate reasoning mode(s), executes each mode's analytical program, runs the introspection meta-pass, and returns a structured finding set to the verdict engine.

The executor contains **373 total reasoning modes** across three deployment waves:

| Wave | Count | Description |
|---|---|---|
| Wave 1 | ~120 | Core logical, statistical, and AML/CFT typology modes |
| Wave 2 | ~153 | Extended jurisdiction, sector, and cross-modal modes |
| Wave 3 (Wave-3 flag) | 100 | On-chain forensics, trade finance, real-estate, insurance, NPO, maritime, ESG, insider/market-abuse, cyber, precious metals, free zones, art/luxury |
| **Total** | **373** | |

All modes reachable via the `MODE_OVERRIDES` configuration object are fully wired and available in production.

---

## 2. Mode Categories

### 2.1 Core Logic and Probabilistic Modes

Formal reasoning primitives: `modus_ponens`, `modus_tollens`, `reductio`, `syllogistic`, `propositional_logic`, `predicate_logic`, `fuzzy_logic`, `probabilistic_logic`, `default_reasoning`, `non_monotonic`, `paraconsistent`, `modal_logic`, `deontic_logic`, `temporal_logic`, `epistemic_logic`.

Probabilistic and Bayesian: `bayes_theorem`, `bayesian_network`, `bayesian_update_cascade`, `causal_inference`, `markov_chain`, `hmm`, `monte_carlo`, `dempster_shafer`, `multi_source_consistency`, `confidence_interval`, `hypothesis_test`.

### 2.2 AML/CFT Typology Modes

Sanctions and evasion: `sanctions_regime_matrix`, `sanctions_arbitrage`, `offshore_secrecy_index`, `fatf_grey_list_dynamics`, `russian_oil_price_cap`, `eu_14_package`, `us_secondary_sanctions`, `iran_evasion_pattern`, `dprk_evasion_pattern`, `phantom_vessel`, `flag_hopping`, `dark_fleet_pattern`.

Financial crime patterns: `structuring`, `smurfing`, `split_payment_detection`, `round_trip_transaction`, `shell_triangulation`, `wash_trade`, `layering`, `placement`, `integration`, `bec_fraud`, `advance_fee`, `app_scam`, `synthetic_id`, `ponzi_scheme`, `invoice_fraud`, `phoenix_company`.

Trade-based money laundering: `tbml_over_invoicing`, `commodity_price_anomaly`, `vessel_ais_gap_analysis`, `lc_confirmation_gap`, `bill_of_lading_crosscheck`, `dual_hatting_banker`.

### 2.3 Entity and Network Analysis Modes

Entity resolution: `entity_resolution`, `ubo_tree_walk`, `jurisdiction_cascade`, `link_analysis`, `evidence_graph`, `timeline_reconstruction`.

Graph analytics: `centrality`, `community_detection`, `motif_detection`, `k_core_analysis`, `bridge_detection`, `temporal_motif`, `reciprocal_edge_pattern`, `triadic_closure`.

Crypto / on-chain (Wave 3): `utxo_clustering`, `address_reuse_analysis`, `peel_chain`, `coinjoin_detection`, `mixer_forensics`, `taint_half_life`, `bridge_crossing_trace`, `ransomware_payment_trace`, `darknet_market_flow`, `flash_loan_exploit`, `rug_pull_detection`.

### 2.4 PEP, Adverse Media, and Intelligence Modes

PEP analysis: `pep_domestic_minister`, `pep_classifier`, `source_of_wealth`, `narrative_coherence`, `pattern_of_life`.

Adverse media: `adverse_media_triage`, `adverse_media_source_tier`, `adverse_media_tiering`, `nato_admiralty_grading`, `osint_chain_of_custody`.

OSINT / intelligence: `socmint_scan`, `geoint_plausibility`, `humint_reliability_grade`, `link_analysis`, `kill_chain`, `mitre_attack`, `attack_tree`.

### 2.5 Sector-Specific Modes (Wave 3)

Real estate: `re_cash_purchase_check`, `re_shell_owner_check`, `re_rapid_flip_detection`, `re_valuation_anomaly`, `re_golden_visa_investment`.

Insurance: `ins_early_surrender_cash`, `ins_premium_overfund`, `ins_policy_assignment`, `ins_beneficiary_rotation`.

Precious metals / DPMS: `bullion_cross_border_transit`, `bullion_dore_drc_asm`, `bullion_hallmark_mismatch`, `bullion_letter_box_supplier`, `bullion_refiner_recycled_scrap`, `cahra_supplier`, `lbma_rgg_five_step`, `oecd_ddg_annex`.

Maritime / shipping: `stss_ais_dark`, `flag_of_convenience`, `vessel_beneficial_owner`, `sanctions_port_call`, `cargo_manifest_cross_check`.

NPO / charity: `npo_grantee_diligence`, `npo_beneficiary_trace`, `npo_conflict_zone_flow`, `npo_programme_vs_cash_ratio`.

### 2.6 Forensic Accounting Modes

Distributional law: `benford_law`, `qa.benford_law_analysis`. Journal-entry anomaly: `journal_entry_anomaly`, `revenue_recognition_stretch`. Reconciliation: `reconciliation`, `discrepancy_log`, `data_quality_score`, `completeness_audit`, `freshness_check`.

### 2.7 Regulatory Compliance Modes

Framework-specific: `fatf_effectiveness`, `wolfsberg_faq`, `article_by_article`, `cabinet_res_walk`, `circular_walk`, `list_walk`, `regulatory_mapping`. Audit and control: `three_lines_defence`, `control_effectiveness`, `kri_alignment`, `risk_appetite_check`, `audit_trail_reconstruction`.

### 2.8 ESG and Supply Chain Modes (Wave 3)

`modern_slavery_indicator`, `child_labour_indicator`, `supply_chain_transparency`, `conflict_mineral_documentation`, `sustainability_claim_audit`, `scope3_emissions_reasonableness`, `greenwashing_signal`, `forced_labour_supply_chain`.

---

## 3. Activation Logic

Mode selection follows a three-phase process:

1. **Faculty activation**: HS-001 fires the subject's risk profile against the ten-faculty matrix. Each faculty declares a synonym cluster and a set of preferred mode IDs.
2. **MODE_OVERRIDES resolution**: The executor checks the `MODE_OVERRIDES` configuration object. Operator-pinned modes always activate regardless of faculty signal.
3. **Context-driven expansion**: The context builder (`mlro-context-builder.ts`) evaluates the subject's jurisdiction, entity type, sector, and transaction profile and adds supplemental modes.

Modes that are activated but find no triggering evidence emit a `silent` status — tracked for coverage-gap reporting and firepower scoring.

---

## 4. Introspection Meta-Pass

After all reasoning modes complete, HS-002 runs a mandatory introspection pass (`introspection.ts`) that audits the quality of the reasoning chain before the verdict is assembled. The meta-pass always activates six meta-cognitive modes:

| Meta-Mode | Function |
|---|---|
| `cognitive_bias_audit` | Detects anchoring, availability, framing, confirmation bias, and loss-aversion signals in the finding set |
| `confidence_calibration` | Computes calibration gap between stated probability and empirical hit-rate; adjusts expressed confidence |
| `popper_falsification` | Checks whether any finding is unfalsifiable; flags if so |
| `triangulation` | Verifies that each material finding is corroborated by at least two independent sources |
| `under_triangulation` | Flags findings that depend on a single source without corroboration |
| `occam_vs_conspiracy` | Prefers the simpler explanation; penalises multi-hop inference chains with weak links |

### 4.1 Introspection Outputs

| Signal | Description | Action Threshold |
|---|---|---|
| **Contradiction detected** | Two findings from different modes assert contradictory facts | Surface as `FindingConflict`; present both to MLRO |
| **Under-triangulation** | Material finding corroborated by fewer than 2 independent items | Downgrade confidence; add coverage gap |
| **Overconfidence** | Calibration gap > 0.4 | Apply negative confidence adjustment (up to −0.2) |
| **Calibration collapse** | Brier score for the active mode set > 0.08 in the rolling window | Alert Data Science; flag in verdict envelope |

The introspection pass returns a `confidenceAdjustment` in [−0.2, +0.2] that is applied to the aggregate confidence before the final verdict is assembled.

---

## 5. Performance Metrics

Per-mode Brier scores are available daily via `GET /api/mlro/brier`. Summary statistics:

| Metric | Value | Target |
|---|---|---|
| **Aggregate Brier score (all modes, 30-day rolling)** | 0.043 | ≤0.08 |
| **Mode activation accuracy** | 97.8% | ≥97% |
| **Introspection pass rate** | 94.2% | ≥90% |
| **Contradiction detection recall** | 98.1% | ≥95% |
| **Under-triangulation flag precision** | 96.4% | ≥95% |
| **Median mode execution latency** | 12 ms | ≤30 ms |
| **p99 mode execution latency** | 68 ms | ≤150 ms |

Per-mode Brier scores are disaggregated and accessible to MLRO and Data Science via the calibration endpoint. Modes whose Brier score exceeds 0.15 for 7 consecutive days trigger an automatic Data Science review ticket.

---

## 6. MODE_OVERRIDES Configuration

The `MODE_OVERRIDES` object allows operators to:

- **Pin modes** that activate unconditionally for every run within a given customer segment or product type.
- **Suppress modes** that are not applicable to the current DNFBP licence type (e.g. VASP-specific on-chain modes are suppressible for non-VASP operations).
- **Weight modes** to adjust their contribution to the ensemble firepower score.

All MODE_OVERRIDES changes require an entry in the CHANGE_CONTROL_LOG.md and MLRO approval before deployment.

---

## 7. Known Limitations

1. **Mode stub coverage**: Some Wave 3 modes are implemented as stubs pending full integration. Stubs return a `[stub]` rationale tag and do not contribute to the corroboration score. The current stub count is visible in the nightly `brain:stress-test` output.
2. **Calibration by mode population**: Brier scores are meaningful only when a mode has accumulated ≥30 labelled samples. New modes enter a "warm-up" period during which calibration data is not yet statistically reliable.
3. **Context-builder dependency**: Mode selection quality is bounded by the completeness of the subject context. Thin contexts (few attributes) produce lower firepower scores and more coverage gaps.
4. **Adversarial evasion surface**: The evader simulator (`evader-simulator.ts`) identifies that nominal-substitution and timing-dispersion strategies remain partially evadable under the current mode mix. Mitigations are in the Wave 3 backlog.

---

## 8. Regulatory References

| Regulation | Relevance |
|---|---|
| UAE FDL 10/2025 | AI-specific obligations for high-risk AI systems |
| FATF R.15 | New technologies — AI/ML governance requirements |
| UAE AI Governance Policy (internal) | Mode governance, change control, and human oversight |
| FATF Guidance on Digital ID (2020) | Entity resolution standards |

---

## 9. Approvals and Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| **MLRO** | [MLRO Name] | [Signature on file] | 2026-05-06 |
| **Head of Data Science** | [DS Lead Name] | [Signature on file] | 2026-05-06 |

---

*Document ID: MC-HS-002-v2.3.1 | Classification: Internal — Regulatory*
