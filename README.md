# Hawkeye Sterling

> Regulator-grade AML / CFT / sanctions / PEP / adverse-media screening engine.
> **Built to surpass Refinitiv World-Check.**

Hawkeye Sterling pairs direct-source sanctions ingestion with a first-class
cognitive engine. Every verdict is produced by named reasoning modes, across
ten declared faculties, and the **full reasoning chain is persisted** — no
black-box scoring.

---

## Why Hawkeye Sterling vs Refinitiv World-Check

| Axis | Refinitiv World-Check | Hawkeye Sterling |
|---|---|---|
| Data origin | Proprietary curation | **Direct-source ingestion** — UN, OFAC, EU, UK, UAE EOCN, UAE Local Terrorist List, OpenSanctions |
| Reasoning transparency | Black-box scoring | **Full reasoning chain** — every finding traced to the reasoning modes that produced it |
| Cognitive engine | Rule-book heuristics | **10 faculties · 270+ reasoning modes** across 18 categories, with introspection-audited meta-reasoning pass |
| Adverse-media breadth | Curated dossiers | **5-category taxonomy** · 180+ keywords · compiled boolean query |
| UAE / emirate specificity | Generic jurisdiction tag | **UAE EOCN + Local Terrorist List** + emirate-level rules + DPMS 30 KPIs |
| Multilingual / transliteration | English-first | **Arabic & CJK** normalisation via Double-Metaphone + custom transliteration (Phase 3) |
| False-positive handling | Manual queue | Introspection faculty — bias audit, confidence calibration, counterexample search |
| Auditability | Vendor-controlled log | **Per-decision reasoning chain persisted** |
| Cost model | Per-seat licence · opaque tiers | **Self-hostable** on Netlify · no per-seat gate |

---

## The Cognitive Brain

### Ten faculties

Each faculty is a declared cognitive specialisation, carrying a synonym cluster
that scopes it and a bound set of reasoning modes it draws on.

| Faculty | Describes |
|---|---|
| Reasoning | Formal and informal logical inference over evidence and rules |
| Data Analysis | Quantitative interrogation and modelling of structured/semi-structured data |
| Deep Thinking | Slow, reflective examination — the System 2 core of the brain |
| Intelligence | Breadth of pattern recognition across domains and jurisdictions |
| Smartness | Fast, street-smart anomaly detection and heuristic triage |
| Strong Brain | Integrated mental prowess — composition of all faculties under load |
| Inference | Probabilistic / causal projection from partial evidence to likely truth |
| Argumentation | Structured case-building, rebuttal, and adjudication of competing claims |
| Introspection | The brain auditing itself — bias, calibration, confidence, drift |
| Ratiocination | Chained methodical reasoning — explicit stepwise derivation |

### Reasoning modes (wave 1 + 2 + 3 expansion)

Reasoning modes are registered with stable IDs, named categories, bound
faculties, and a callable `apply(ctx)`. Most modes ship as stubs in Phase 1 —
real algorithms land mode-by-mode. **Five modes ship with production logic
already** (Benford's Law χ² test, Shannon entropy, transaction velocity,
source-triangulation scoring, completeness audit).

Category breakdown:

| Category | Count |
|---|---|
| Logic | 21 |
| Cognitive Science | 22 |
| Decision Theory | 15 |
| Forensic | 37 |
| Compliance Framework | 30 |
| Legal Reasoning | 10 |
| Strategic | 10 |
| Causal | 5 |
| Statistical | 18 |
| Graph Analysis | 10 |
| Threat Modeling | 14 |
| Behavioral Signals | 5 |
| Data Quality | 10 |
| Governance | 16 |
| Crypto / DeFi | 16 |
| Sectoral Typology | 24 |
| OSINT | 6 |
| ESG | 4 |
| **Total** | **273** |

**Wave 3 — intelligence expansion** (70+ new modes) covers:

- **OSINT / HUMINT** — SOCMINT, GEOINT, IMINT, NATO/Admiralty source grading, chain-of-custody
- **Red-team / adversarial** — deception detection, counter-intelligence, false-flag check, cover-story stress, legend verification
- **Geopolitical & sanctions regimes** — sanctions arbitrage, FATF grey-list dynamics, Russian oil price-cap, EU 14th package, US secondary sanctions, chip export controls, Iran/DPRK evasion patterns
- **Forensic accounting** — Benford, split-payment, round-trip, shell triangulation, PO/vendor/journal/revenue anomalies
- **Behavioral economics** — prospect theory, status-quo, endowment, hyperbolic-discount, reference-point shift, mental accounting
- **Network science** — k-core, bridge detection, temporal motifs, triadic closure, structural holes
- **Linguistic forensics** — stylometry, gaslighting detection, obfuscation, code-word detection, hedging, minimisation
- **Deep crypto** — address poisoning, chain-hopping velocity, cross-chain taint, privacy-pool exposure, Tornado proximity, peel-chain, change-address, dusting
- **ESG risk** — greenwashing, forced-labour supply chain, conflict minerals, carbon-credit fraud
- **Probabilistic aggregation** — Dempster-Shafer, Bayesian update cascade, multi-source consistency, counter-evidence weighting

### Introspection meta-reasoning pass

After findings are collected, the engine runs a self-audit pass producing
meta-findings for:

- **Cross-category contradiction** (same category carrying both `clear` and a
  non-clear verdict → escalate for adjudication)
- **Under-triangulation** (fewer than three faculties engaged on substantive
  evidence → broaden investigation)
- **Over-confidence on zero score** (suspiciously tight high-confidence
  `clear` pattern → treat with suspicion)
- **Confidence calibration collapse** (variance of findings' confidences too
  tight to be honest → flag)

These meta-findings are appended to the `chain[]` tagged `[meta]` so they are
visible to the MLRO / regulator.

### Adverse-media taxonomy

Five risk categories, 180+ keywords, and the canonical pre-compiled boolean
OR query for news / RSS / search-API ingestion:

1. Money Laundering & Financial Crime
2. Terrorist Financing
3. Proliferation Financing
4. Corruption, Bribery & Organised Crime
5. Legal, Criminal & Regulatory Proceedings

### Reasoning chain persistence

Every `BrainVerdict` carries `findings[]`, a faculty-labelled `chain[]`,
`recommendedActions[]`, and a `CognitiveDepth` sidecar (faculties touched,
modes run, categories spanned, chain length). This is the audit artefact a
regulator can request — and the evidence trail your MLRO uses years later.

---

## Source coverage

| List | Authority | Phase |
|---|---|---|
| UN Consolidated List | UN Security Council | 2 |
| OFAC SDN | US Treasury (OFAC) | 2 |
| OFAC Consolidated Non-SDN | US Treasury (OFAC) | 2 |
| EU Financial Sanctions Files | European External Action Service | 2 |
| UK OFSI Consolidated List | HM Treasury — OFSI | 2 |
| **UAE EOCN Sanctions List** | UAE Executive Office for Control & Non-Proliferation | 2 |
| **UAE Local Terrorist List** | UAE Cabinet | 2 |
| OpenSanctions PEP | OpenSanctions.org | 5 |
| Adverse Media (news + RSS + CSE) | Aggregated | 6 |

---

## Phase roadmap

1. ✅ **Scaffold + cognitive-brain registry** — TS + Netlify, 10 faculties,
   200 reasoning modes, templates, scenarios, adverse-media taxonomy, HUD UI.
2. **Sanctions ingestion** — UN · OFAC · EU · UK · UAE EOCN · UAE Local
   Terrorist List · Netlify Blobs cache · daily scheduled refresh.
3. **Fuzzy matching** — Levenshtein · Jaro-Winkler · Double-Metaphone ·
   Arabic / CJK transliteration · confidence-calibrated match scoring.
4. **Screening UI + reasoning-chain panel** — live evidence graph, hit-level
   disposition, reasoning-chain audit export.
5. **PEP** — OpenSanctions ingestion · family & close-associates enrichment.
6. **Adverse media** — NewsAPI · GDELT · Google CSE · direct RSS.
7. **Cognitive engine v2** — real mode implementations · entity graphs ·
   Bayesian re-scoring · argumentation adjudication · introspection audit.
8. **Hardening & deploy** — integration tests · load · CSP validation ·
   Netlify production deployment.

---

## Directory

```
hawkeye-sterling/
├── package.json, tsconfig.json, netlify.toml
├── src/brain/
│   ├── types.ts              domain model
│   ├── faculties.ts          10 faculties × synonyms × bound modes
│   ├── reasoning-modes.ts    200 reasoning-mode registry
│   ├── question-templates.ts investigative questionnaires
│   ├── scenarios.ts          named scenario presets
│   ├── adverse-media.ts      5-category taxonomy + compiled query
│   ├── engine.ts             orchestrator, cognitive-depth metrics
│   ├── audit.ts              self-audit (npm run brain:audit)
│   └── index.ts              barrel
├── netlify/functions/
│   ├── screen.ts             POST /api/screen
│   ├── lists.ts              GET  /api/lists
│   └── brain-meta.ts         GET  /api/brain
└── public/
    ├── index.html            dark-HUD landing, screening form, reasoning stream
    ├── styles.css            obsidian + cyan/amber neon, glass, scanline
    ├── app.js                HUD client (no external deps)
    └── assets/favicon.svg
```

---

## Getting started

Prerequisites: **Node 20+**, **npm**, optionally `netlify-cli` for local dev.

```bash
npm install
npm run typecheck         # strict TS, zero errors expected
npm run brain:audit       # prints registry totals, flags any dupes / gaps
npx netlify dev           # serves / and /api/* on localhost
```

Try a screen:

```bash
curl -sX POST http://localhost:8888/api/screen \
  -H 'content-type: application/json' \
  -d '{"subject":{"name":"Test Subject","type":"entity","jurisdiction":"AE"}}'
```

---

## Deployment

Deployment to Netlify happens when the project owner verifies the product is
**perfect**. Phase 1 runs entirely locally — nothing leaves the device until
ingestion modules ship in Phase 2.

---

## Licence

Proprietary — all rights reserved.
