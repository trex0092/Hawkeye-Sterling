# [Reporting Entity] — compliance automation scripts

This folder holds every Node.js script that runs the firm's AML and CFT
compliance automation. Each script is designed to run unattended on a
GitHub Actions schedule (or on demand where appropriate) and every
artefact produced is archived under `history/` for the ten-year
retention obligation set by the applicable provision of Federal
Decree-Law No. 10 of 2025.

The entity is [Reporting Entity], a UAE-licensed Dealer in Precious
Metals and Stones classified as a Designated Non-Financial Business
and Profession, supervised by the Ministry of Economy. The Money
Laundering Reporting Officer is the MLRO.

## Complete script catalogue

### Scheduled — daily

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `daily-priorities.mjs` | Mon–Fri 09:00 | Per-entity top-10 with risk scoring, portfolio digest, counterparty register update, goAML filing detection | `history/daily/`, `history/filings/`, `history/registers/` |
| `daily-ops-logs.mjs` | Mon–Fri 09:05 | Four deterministic audit logs: sanctions screening, PEP watch, cash transaction, high-risk counterparty | `history/daily-ops/` |
| `daily-retro.mjs` | Mon–Fri 17:00 | End-of-day completion retro comparing morning priorities to closures | `history/retro/` |

### Scheduled — weekly (Fridays)

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `weekly-report.mjs` | 16:00 | Weekly cross-entity pattern report for the MLRO | `history/weekly/` |
| `weekly-mlro-report.mjs` | 17:00 | Formal Weekly MLRO Report to Senior Management | `history/mlro-weekly/` |
| `weekly-filings-summary.mjs` | 17:30 | Count and narrative of goAML filing drafts produced during the week | `history/weekly-filings/` |
| `weekly-ops-logs.mjs` | 18:00 | Training summary, dormant file reminder, escalation log | `history/weekly-ops/` |

### Scheduled — monthly (first business day)

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `monthly-mlro-report.mjs` | 09:00 | Monthly MLRO Consolidation to Senior Management and the Board | `history/mlro-monthly/` |
| `monthly-incident-log.mjs` | 09:30 | Refused transactions, declined onboardings, compliance exceptions | `history/monthly-incidents/` |
| `monthly-ops-logs.mjs` | 10:00 | CDD refresh reminder and EDD case tracker | `history/monthly-ops/` |

### Scheduled — quarterly (first business day after quarter end)

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `quarterly-mlro-report.mjs` | 09:00 | Quarterly MLRO Report to Senior Management and the Board | `history/mlro-quarterly/` |
| `quarterly-jurisdiction-heatmap.mjs` | 09:45 | Jurisdiction exposure heatmap from the counterparty register | `history/quarterly-jurisdiction/` |
| `quarterly-ops-logs.mjs` | 10:30 | Typology library update and beneficial ownership clarity report | `history/quarterly-ops/` |

### Scheduled — annual

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `annual-mlro-report.mjs` | 1st business day of January 09:00 | Annual MLRO Report to Senior Management and the Board | `history/mlro-annual/` |
| `annual-risk-assessment.mjs` | 15 January 09:00 | Annual Enterprise-Wide AML and CFT Risk Assessment draft | `history/annual/` |
| `annual-training-report.mjs` | 31 January 09:00 | Annual AML and CFT Training Completion Report | `history/annual/` |
| `annual-programme-effectiveness.mjs` | 31 January 10:00 | Five-pillar deterministic programme effectiveness scorecard | `history/annual/` |
| `annual-customer-exit-report.mjs` | 31 January 10:30 | Record of customer relationships exited or escalated during the year | `history/annual/` |

All times are Asia/Dubai.

### On demand (`workflow_dispatch` only, no schedule)

| Script | Inputs | Purpose | Archive |
|---|---|---|---|
| `customer-file-summary.mjs` | `task_gid` | One-page summary of a specific Asana task, posted back on the task | `history/on-demand/` |
| `dnfbp-saq.mjs` | — | Pre-fill of the MOE DNFBP Self-Assessment Questionnaire | `history/on-demand/` |
| `board-aml-pack.mjs` | `board_meeting_date` | Board-ready AML pack ahead of a standing Board meeting | `history/on-demand/` |
| `inspection-bundle.mjs` | `window_days` | Inspection evidence bundle manifest for a supervisory visit | `history/inspections/` |
| `mlro-handover-report.mjs` | `incoming_mlro_name` | MLRO handover continuity snapshot | `history/handover/` |
| `trend-export.mjs` | `window_days` | Spreadsheet-friendly CSV snapshot for external charting | `history/on-demand/` |

### Library modules (not executed directly)

| Module | Purpose |
|---|---|
| `regulatory-context.mjs` | UAE legal framework constants, `SYSTEM_PROMPT`, `STYLE_REMINDER`, `CONFIRMED_REFERENCES`, `validateOutput()` |
| `history-writer.mjs` | Deterministic paths under `history/`, `isoDate()`, `isoWeek()`, category-specific write helpers |
| `counterparty-register.mjs` | CSV read/write and `upsertFromTasks()` with cross-entity flagging |
| `filing-drafts.mjs` | STR / SAR / DPMSR / PNMR / FFR detection and draft generator, driven by `filing-mode.json` |
| `notify.mjs` | No-op notification stub retained so existing `import { notify }` statements keep resolving |
| `lib/report-scaffold.mjs` | Shared scaffolding: Asana client factory, Claude caller, `wrapDocument()`, `renderTable()`, typology classifier |

### Configuration files

| File | Purpose |
|---|---|
| `filing-mode.json` | MLRO-controlled per-type mode for the five goAML filing drafts. Default: all `manual` |
| `package.json` | Node 22+ engine, single dependency: `@anthropic-ai/sdk` |

## Shared regulatory framing

Every Claude call in every narrative script uses the same `SYSTEM_PROMPT`
exported from `regulatory-context.mjs`. That system prompt:

- Establishes the voice of the compliance function of [Reporting Entity]
  drafting material for the attention of the MLRO.
- Lists the only legal references that may be cited verbatim: Federal
  Decree-Law No. 10 of 2025, the Ministry of Economy as DNFBP supervisor,
  the Executive Office for Control and Non-Proliferation as sanctions
  implementing body, the Financial Intelligence Unit and the goAML
  platform, the 10-year retention obligation.
- Forbids citing Federal Decree-Law No. 20 of 2018, any invented article
  number, any invented Cabinet Decision number and any specific AED
  threshold the MLRO has not confirmed.
- Enforces a 0% AI-tells writing style: formal UAE compliance register,
  no em-dashes, no markdown hash headings, no "as an AI" / "let me" /
  "I hope this helps", short sentences, first person plural for the
  compliance function, first person singular for the MLRO.
- Requires an explicit imperative next-action line at the end of every
  analytical section and a final `For review by the MLRO.`
  line on every document.

Every response is passed through `validateOutput()` before archival. The
deterministic scripts (`daily-ops-logs.mjs`, `weekly-ops-logs.mjs`,
`monthly-ops-logs.mjs`, `quarterly-ops-logs.mjs`,
`annual-programme-effectiveness.mjs`, `annual-customer-exit-report.mjs`,
`mlro-handover-report.mjs`, `trend-export.mjs`) do not call Claude at
all — they produce factual aggregation tables using the shared
scaffolding so the output is reproducible and audit-friendly.

## goAML filing mode

`scripts/filing-mode.json` controls draft generation for the five
filing types. Default is `manual` across the board, because the MLRO
is in charge of all filings. The automation never submits to goAML.

```json
{
  "STR":   "manual",
  "SAR":   "manual",
  "DPMSR": "manual",
  "PNMR":  "manual",
  "FFR":   "manual"
}
```

In `manual` mode the daily run flags candidate tasks and nothing else.
To produce a draft narrative for a specific flagged task, add the tag
`hsv2:draft-now` to the task in Asana. The next daily run will pick up
the tag, generate the draft, post it as a comment on the task and
archive it under `history/filings/`.

## Local usage

```bash
cd scripts
npm install

export ASANA_TOKEN=1/...
export ANTHROPIC_API_KEY=sk-ant-...
export ASANA_WORKSPACE_ID=1213645083721316
export ASANA_TEAM_ID=1213645083721318      # optional

# Dry run first
npm run daily-priorities:dry

# Real run
npm run daily-priorities

# Any other script
node daily-ops-logs.mjs
node weekly-mlro-report.mjs
# ...
```

## Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ASANA_TOKEN` | yes | Asana personal access token |
| `ANTHROPIC_API_KEY` | yes | Anthropic API key with credit |
| `ASANA_WORKSPACE_ID` | yes | Asana workspace ID |
| `ASANA_TEAM_ID` | optional | Team ID |
| `CLAUDE_MODEL` | optional | Default `claude-haiku-4-5` |
| `PINNED_TASK_NAME` | optional | Default `📌 Today's Priorities` |
| `PORTFOLIO_PROJECT_NAME` | optional | Default `SCREENINGS` |
| `MLRO_NAME` | optional | Overrides the generic `the Money Laundering Reporting Officer` label in generated documents |
| `ENTITY_LEGAL_NAME` | optional | Overrides the generic `the Reporting Entity` label in generated documents |
| `DRY_RUN` | optional | Set to `true` to log without posting |

## Samples vs history

`samples/` contains format reference documents with **fictitious** data.
`history/` contains the live ten-year evidence archive written by the
automation during real runs. See `history/README.md` for the full rules.

## Contact

All questions about these scripts go to the Money Laundering Reporting
Officer, the MLRO.
