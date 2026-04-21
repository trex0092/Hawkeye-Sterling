# Hawkeye Sterling V2

Regulator-grade sanctions, PEP and adverse-media screening command deck for UAE DPMS entities. Built to surpass Refinitiv World-Check.

## Positioning

- Primary-source list feeds (UN, EOCN, OFAC, EU, UK, UN DPRK/Iran PF) — no proprietary curation.
- Every hit produces a transparent, signed reasoning chain (no black-box scoring).
- Cognitive engine: 10 faculties, 190+ reasoning modes (Wave 1 + Wave 2), scorecard-graded.
- Adverse media: 5-category taxonomy, ready-made boolean OR query, keyword coverage across ML/FC, TF, PF, Corruption/OC, Legal.
- Four-eyes MLRO disposition enforced (separation of duties).
- Reports delivered to Asana on first screening and on every daily monitoring run.

## Current state · Module 01 · Subject Screening

- `public/` — static command page (obsidian theme, no gold). Sticky section nav with live progress, four-eyes SoD guard, draft autosave, sticky submit HUD, audit-envelope preview. Mode switch: First screening / Daily monitoring.
- `src/services/` — `gradeScore` (A+ → F) and `buildIntelligenceScorecard` / `buildMaxActiveInputs`.
- `src/engine/` — 10 faculties + synonyms, Wave 1 + Wave 2 reasoning mode IDs, question-template IDs, scenario-preset IDs.
- `src/adverseMedia/` — taxonomy (5 categories) + fixed boolean OR query + `buildAdverseMediaQuery(subjectName?)`.
- `src/reports/caseReport.ts` — World-Check-style `CaseReport` types (positive / negative report envelope).
- `src/integrations/asana.ts` — Asana delivery contract (`buildAsanaEnvelope`, `deliverToAsana`). Configure `ASANA_PAT`, project GID, section GIDs per mode.
- `src/integrations/claudeAgent.ts` — Claude Managed Agents contract. Takes a `CaseReport` (+ optional CSV/JSON source data), returns a narrative HTML report with charts.

## Regulatory basis

- **FDL No.10/2025** — Art.17 (MLRO), Art.20-21 (screening), Art.24 (record-keeping), Art.26-27 (disposition), Art.29 (no tipping-off), Art.2(3) (factual & objective circumstances), Art.10 / Art.14 (retention, CDD).
- **Cabinet Resolution 74/2020** — Art.4-7 (EOCN 24-hour freeze).
- **Cabinet Resolution 134/2025** — Art.19 (four-eyes, separation of duties).
- **MoE Circular 3/2025** — DPMS compliance guidance.
- **FDL 46/2021** · **Cabinet Decision 28/2023** · **Evidence Law FL 35/2022** — electronic signatures.
- **FDL 45/2021 (PDPL)** — lawful basis (legal obligation) for AML/CFT/CPF processing.

## Run the page (no build)

```bash
npm run dev
# opens http://localhost:8080/
```

The page is static HTML + CSS + vanilla ES module JS. Open `public/index.html` directly or serve `public/`.

## Type-check the engine

```bash
npm run typecheck
```

## Roadmap

- **P1** · Scaffold + design (done)
- **P2** · Sanctions ingestion (direct-source feeds + cache + cron — pending, to be wired when user integrates backend)
- **P3** · Fuzzy matching (Jaro-Winkler + Levenshtein + Double-Metaphone for AR/CJK)
- **P4** · Screening UI + results + reasoning-chain panel
- **P5** · PEP (OpenSanctions)
- **P6** · Adverse media (news APIs + RSS, taxonomy + boolean query ready)
- **P7** · Full cognitive engine (inference, deep re-scoring, argumentation, entity graphs) — faculty/mode scaffolding ready
- **P8** · Hardening, testing, deploy

## Non-goals

- No proprietary list curation.
- No black-box scoring.
- No vendor lock-in.

## Development note

This build intentionally avoids Netlify-specific primitives until the page is considered correct. Deployment primitives (functions, Blobs, scheduled cron) will be added once the front-end is signed off.
