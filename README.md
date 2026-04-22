# Hawkeye Sterling

> Regulator-grade AML / CFT / sanctions / PEP / adverse-media screening engine.
> **Built to surpass Refinitiv World-Check.**

Hawkeye Sterling pairs direct-source sanctions ingestion with a first-class
cognitive engine. Every verdict is produced by named reasoning modes, across
ten declared faculties, and the **full reasoning chain is persisted** — no
black-box scoring. Every AI-generated output is governed by a content-frozen
compliance charter that forbids fabrication, legal conclusions, tipping-off,
and unsupported risk scoring.

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
| Report delivery | Vendor portal | **Asana inbox** — on first screening and every daily monitoring run |
| Assistant guardrails | Vendor terms | **Content-frozen compliance charter** — P1–P10 absolute prohibitions enforced |
| Cost model | Per-seat licence · opaque tiers | **Self-hostable** · no per-seat gate |

---

## Current state · V2 command deck

Module 01 · Subject Screening is the operator landing. Obsidian command-deck
UI (no gold), sticky section nav with live progress, four-eyes separation-of-
duties guard, Record-ID auto-issue, draft autosave, audit-envelope JSON
preview, mode switch: *First screening* / *Daily monitoring*.

---

## The Cognitive Brain

### Ten faculties

Each faculty is a declared cognitive specialisation, carrying a synonym cluster
that scopes it and a bound set of reasoning modes it draws on.

| Faculty | Synonyms |
|---|---|
| Reasoning | logic, deduction, inference, rationalization, argumentation, analysis, cogitation, ratiocination, sense-making, thought process |
| Data Analysis | data interpretation, data mining, data crunching, analytics, quantitative analysis, statistical analysis, data examination, data evaluation, data modeling, data processing |
| Deep Thinking | contemplation, reflection, rumination, introspection, meditation, pondering, musing, deliberation, cerebration, profound thought |
| Intelligence | intellect, acumen, cleverness, brilliance, brainpower, wit, sagacity, perspicacity, mental capacity, cognitive ability |
| Smartness | sharpness, shrewdness, astuteness, quick-wittedness, savvy, canniness, ingenuity, resourcefulness, adroitness, keenness |
| Strong Brain | sharp mind, keen intellect, powerful mind, quick mind, agile mind, brilliant mind, analytical mind, steel-trap mind, mental prowess, intellectual firepower |
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

Five risk categories, 100+ keywords, and the canonical pre-compiled boolean
OR query for news / RSS / search-API ingestion, exposed as
`ADVERSE_MEDIA_QUERY`:

1. Money Laundering & Financial Crime
2. Terrorist Financing
3. Proliferation Financing
4. Corruption, Bribery & Organised Crime
5. Legal, Criminal & Regulatory Proceedings

### Weaponized-brain composer

`src/brain/weaponized.ts` fuses the compliance charter + faculties +
reasoning modes + adverse-media taxonomy into a single signed manifest with
FNV-1a integrity hashes. `weaponizedSystemPrompt({ taskRole, audience })` is
the one-line import every AI integration uses as its governing policy.

### Reasoning chain persistence

Every `BrainVerdict` carries `findings[]`, a faculty-labelled `chain[]`,
`recommendedActions[]`, and a `CognitiveDepth` sidecar (faculties touched,
modes run, categories spanned, chain length). This is the audit artefact a
regulator can request — and the evidence trail your MLRO uses years later.

---

## Compliance charter (non-negotiable)

Every AI-generated output is governed by `src/policy/systemPrompt.ts`. It
cannot be paraphrased, softened, or bypassed by downstream prompts.

**P1** No unverified sanctions assertions · **P2** No fabricated adverse media
/ citations · **P3** No legal conclusions · **P4** No tipping-off content ·
**P5** No allegation-to-finding upgrade · **P6** No merging of distinct
persons/entities · **P7** No "clean" result without scope declaration ·
**P8** No training-data-as-current-source · **P9** No opaque risk scoring ·
**P10** No proceeding on insufficient information.

Match-confidence taxonomy is enforced: **EXACT · STRONG · POSSIBLE · WEAK ·
NO MATCH**. Every response carries the mandatory 7-section structure
(Subject Identifiers, Scope Declaration, Findings, Gaps, Red Flags,
Recommended Next Steps, Audit Line).

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

## Delivery

- **Asana** — first-screening and every daily-monitoring report is posted to
  a configured Asana project (inbox → MLRO triage). Contract in
  `src/integrations/asana.ts`.
- **Claude Managed Agents** — CSV/JSON source data → narrative HTML report
  with embedded charts. Contract in `src/integrations/claudeAgent.ts`. Always
  prepends `SYSTEM_PROMPT` before any task-specific role.

---

## Phase roadmap

1. ✅ **Scaffold + cognitive-brain registry** — 10 faculties, 200 reasoning
   modes, templates, scenarios, adverse-media taxonomy.
2. ✅ **V2 command deck** — Module 01 · Subject Screening (obsidian, four-eyes,
   HUD, autosave, envelope preview, mode switch) + compliance charter +
   weaponized-brain composer.
3. **Sanctions ingestion** — UN · OFAC · EU · UK · UAE EOCN · UAE Local
   Terrorist List · cache · daily scheduled refresh.
4. **Fuzzy matching** — Levenshtein · Jaro-Winkler · Double-Metaphone ·
   Arabic / CJK transliteration · confidence-calibrated match scoring.
5. **Screening UI + reasoning-chain panel** — live evidence graph, hit-level
   disposition, reasoning-chain audit export.
6. **PEP** — OpenSanctions ingestion · family & close-associates enrichment.
7. **Adverse media** — NewsAPI · GDELT · Google CSE · direct RSS.
8. **Cognitive engine v2** — real mode implementations · entity graphs ·
   Bayesian re-scoring · argumentation adjudication · introspection audit.
9. **Hardening & deploy** — integration tests · load · CSP validation ·
   production deployment.

---

## Directory

```
hawkeye-sterling/
├── package.json, tsconfig.json
├── src/
│   ├── brain/
│   │   ├── types.ts              domain model
│   │   ├── faculties.ts          10 faculties × synonyms × bound modes
│   │   ├── reasoning-modes.ts    200 reasoning-mode registry
│   │   ├── question-templates.ts investigative questionnaires
│   │   ├── scenarios.ts          named scenario presets
│   │   ├── adverse-media.ts      5-category taxonomy + compiled query
│   │   ├── engine.ts             orchestrator, cognitive-depth metrics
│   │   ├── audit.ts              self-audit (npm run brain:audit)
│   │   ├── weaponized.ts         charter + catalogue composer
│   │   └── index.ts              barrel
│   ├── policy/
│   │   └── systemPrompt.ts       content-frozen compliance charter
│   ├── services/
│   │   ├── grade.ts              A+ → F grading
│   │   └── intelligenceScorecard.ts  intelligent / smart / autonomous / composite
│   ├── reports/
│   │   └── caseReport.ts         World-Check-style envelope (positive / negative)
│   └── integrations/
│       ├── asana.ts              first-screening + daily-monitoring delivery
│       └── claudeAgent.ts        CSV/JSON → narrative HTML report
└── public/
    ├── index.html                Module 01 · Subject Screening (obsidian)
    ├── styles.css                obsidian theme, hairline rules, cyan/amber/red
    ├── app.js                    HUD controller, validation, four-eyes, autosave
    └── assets/favicon.svg
```

---

## Getting started

Prerequisites: **Node 20+**, **npm**.

```bash
npm install
npm run dev               # static serve on http://localhost:8080
npm run typecheck         # strict TS, zero errors expected
npm run brain:audit       # prints registry totals, flags any dupes / gaps
```

---

## Regulatory anchors

- Federal Decree-Law No. 20 of 2018 (as amended, incl. FDL No. 10 of 2025).
- Cabinet Decision No. 10 of 2019 (as amended, incl. CR 134 of 2025).
- Cabinet Decision No. 74 of 2020 (Terrorism Lists / TFS).
- Cabinet Resolution No. 16 of 2021 (administrative penalties).
- MoE DNFBP circulars and guidance for the precious-metals sector.
- FATF Recommendations and relevant Methodology paragraphs.
- LBMA Responsible Gold Guidance (supply-chain context).

---

## Deployment

Deployment happens when the project owner verifies the product is **perfect**.
The build ships as a static page plus a typed TypeScript library; the hosting
platform is chosen at integration time.

---

## Licence

Proprietary — all rights reserved.
