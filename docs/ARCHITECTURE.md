# Architecture overview

This document describes the high-level architecture of the Hawkeye-Sterling
compliance automation.

## System diagram

```
                     ┌─────────────┐
                     │  Asana API  │  task data, comments, attachments
                     └──────┬──────┘
                            │
         ┌──────────────────┼──────────────────┐
         │            GitHub Actions           │  39 scheduled workflows
         │  (cron triggers + workflow_dispatch) │
         └──────────────────┬──────────────────┘
                            │
                  ┌─────────┴─────────┐
                  │   scripts/*.mjs   │  44 Node.js scripts
                  │                   │
                  │  regulatory-      │  UAE legal framework constants
                  │  context.mjs      │  SYSTEM_PROMPT, validateOutput()
                  │                   │
                  │  lib/report-      │  wrapDocument(), renderTable(),
                  │  scaffold.mjs     │  Asana client, Claude caller
                  │                   │
                  │  history-         │  writeHistory() + category helpers
                  │  writer.mjs       │  auto-creates directories + DOCX
                  └─────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │                           │
     ┌────────┴────────┐        ┌────────┴────────┐
     │  Claude API     │        │  history/        │
     │  (narrative     │        │  10-year archive │
     │   reports only) │        │  plain-text UTF-8│
     └─────────────────┘        │  git-backed      │
                                └──────────────────┘
```

## Script categories

### Narrative scripts (use Claude API)
These scripts call the Anthropic API to generate analytical commentary.
Every Claude response passes through `validateOutput()` before archival.

- daily-priorities, daily-entity-report, daily-retro
- weekly-report, weekly-mlro-report, weekly-filings-summary
- monthly-mlro-report, monthly-incident-log
- quarterly-mlro-report, quarterly-jurisdiction-heatmap
- annual-mlro-report, annual-risk-assessment, annual-training-report
- customer-file-summary, dnfbp-saq, board-aml-pack

### Deterministic scripts (no Claude API)
These scripts produce factual aggregation tables from Asana task data,
the counterparty register, or the history archive. Output is reproducible.

- daily-ops-logs, weekly-ops-logs, monthly-ops-logs, quarterly-ops-logs
- annual-programme-effectiveness, annual-customer-exit-report
- mlro-handover-report, trend-export
- transaction-monitor, cdd-refresh-tracker, deadline-calendar
- hash-manifest, str-quality-score, generate-dashboard
- sanctions-screening, pep-screening, adverse-media, regulatory-watcher

### Library modules (not executed directly)
- regulatory-context.mjs — UAE legal framework, SYSTEM_PROMPT
- history-writer.mjs — archive paths, writeHistory(), DOCX generation
- counterparty-register.mjs — CSV read/write, cross-entity flagging
- filing-drafts.mjs — goAML filing detection and draft generation
- notify.mjs — no-op notification stub
- lib/report-scaffold.mjs — shared utilities

## Screening engine

Located at `screening/`. A standalone Node.js module with zero runtime
dependencies that provides:

- Sanctions list ingestion (UN, OFAC, UK OFSI, OpenSanctions)
- Fuzzy matching (Levenshtein, Jaro-Winkler, token-set, phonetic)
- Hash-chained audit trail (tamper-evident, append-only)
- MCP server interface for Claude Desktop / Cursor integration

See `screening/README.md` for full documentation.

## Data flow

1. GitHub Actions triggers a workflow on schedule or dispatch
2. The script reads task data from Asana and/or the counterparty register
3. For narrative scripts: Claude generates analytical text; validateOutput()
   enforces style rules and legal citation accuracy
4. history-writer.mjs archives the artefact as plain-text + DOCX under history/
5. The workflow commits any new files in history/ back to the repository
6. The script posts a summary comment on the relevant Asana task

## Security model

- Entity names and MLRO identity are GitHub Actions secrets, never in source
- The automation never submits filings to goAML; all filings are manual
- Filing mode is controlled by scripts/filing-mode.json (default: manual)
- The archive is append-only; hash-manifest.mjs detects tampering
- All output is plain-text UTF-8 for regulator transparency
