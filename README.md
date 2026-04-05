# Compliance automation

This repository holds the AML and CFT compliance automation used by a
UAE-licensed Dealer in Precious Metals and Stones, classified as a
Designated Non-Financial Business and Profession and supervised by the
Ministry of Economy.

The automation runs unattended on GitHub Actions. Every artefact it
produces is committed back to this repository under `history/` so the
ten-year retention obligation set by the applicable provision of Federal
Decree-Law No. 10 of 2025 is satisfied by the repository's own history.

Identifying details (MLRO name, entity legal name) are injected at run
time from GitHub Actions secrets. The public source code carries only
the generic labels "the Reporting Entity" and "the Money Laundering
Reporting Officer".

## Repository layout

| Folder | Contents |
|---|---|
| `scripts/` | The 24 Node.js scripts that drive the automation, plus `lib/report-scaffold.mjs` shared helpers and `regulatory-context.mjs` single source of truth for the UAE legal framework. See `scripts/README.md`. |
| `.github/workflows/` | The 24 GitHub Actions workflows that schedule and dispatch each script. |
| `samples/` | Format-reference artefacts with fictitious data. Used to anchor the house style. |
| `history/` | The live ten-year evidence archive written by the automation during real runs. See `history/README.md`. |

## Cadences covered

- Daily: priorities, operational logs, end-of-day retro
- Weekly: pattern report, MLRO report, filings summary, operational logs
- Monthly: MLRO consolidation, incident log, operational logs
- Quarterly: MLRO report, jurisdiction heatmap, operational logs
- Annual: MLRO report, enterprise-wide risk assessment, programme
  effectiveness review, training report, customer-exit report
- On demand: inspection bundle, board AML pack, DNFBP self-assessment
  questionnaire pre-fill, MLRO handover report, customer file summary,
  historical trend export

## Regulatory framing

All narrative output cites only the confirmed UAE AML and CFT framework:

- Federal Decree-Law No. 10 of 2025 (primary law). The 2018 law is
  explicitly forbidden.
- Ministry of Economy as DNFBP supervisor.
- Executive Office for Control and Non-Proliferation as sanctions
  implementing body for the UN Security Council Consolidated List and
  the UAE Local Terrorist List.
- Financial Intelligence Unit via the goAML platform for STR, SAR,
  DPMSR, PNMR, FFR.
- Ten-year record retention.

Every Claude call uses the same `SYSTEM_PROMPT` and passes through a
strict `validateOutput()` style guard before the artefact is archived.

## How to run

The automation is invoked by GitHub Actions on schedule and by manual
`workflow_dispatch`. Required secrets at the repository level:

| Secret | Purpose |
|---|---|
| `ASANA_TOKEN` | Asana personal access token |
| `ANTHROPIC_API_KEY` | Anthropic API key with credit |
| `ASANA_WORKSPACE_ID` | Asana workspace ID |
| `ASANA_TEAM_ID` | Team ID (optional) |
| `MLRO_NAME` | Identity injection for sign-off blocks (optional) |
| `ENTITY_LEGAL_NAME` | Identity injection for the reporting entity name (optional) |

For local execution and the full environment variable reference see
`scripts/README.md`.

## Filing mode

`scripts/filing-mode.json` controls draft generation for the five goAML
filing types. Default is `manual` across the board. The automation
never submits to goAML. The MLRO is in charge of every filing.
