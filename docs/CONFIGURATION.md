# Configuration guide

## GitHub Actions secrets

These secrets must be set at the repository level for the automation
to function.

| Secret | Required | Purpose |
|---|---|---|
| `ASANA_TOKEN` | yes | Asana personal access token |
| `ANTHROPIC_API_KEY` | yes | Anthropic API key with credit |
| `ASANA_WORKSPACE_ID` | yes | Asana workspace GID |
| `ASANA_TEAM_ID` | optional | Team GID for project filtering |
| `MLRO_NAME` | optional | Replaces "the Money Laundering Reporting Officer" in generated documents |
| `ENTITY_LEGAL_NAME` | optional | Replaces "[Reporting Entity]" in generated documents |

## Environment variables

These variables can be set in the shell environment for local execution
or in the workflow YAML for GitHub Actions.

| Variable | Default | Purpose |
|---|---|---|
| `ASANA_TOKEN` | — | Asana API authentication |
| `ANTHROPIC_API_KEY` | — | Claude API authentication |
| `ASANA_WORKSPACE_ID` | — | Target Asana workspace |
| `ASANA_TEAM_ID` | — | Team filter (optional) |
| `CLAUDE_MODEL` | `claude-haiku-4-5` | Model for narrative generation |
| `PINNED_TASK_NAME` | `Today's Priorities` | Name of the pinned portfolio task |
| `PORTFOLIO_PROJECT_NAME` | `SCREENINGS` | Name of the screening project |
| `MLRO_NAME` | `the Money Laundering Reporting Officer` | Identity injection |
| `ENTITY_LEGAL_NAME` | `the Reporting Entity` | Entity name injection |
| `DRY_RUN` | `false` | Set to `true` to log without posting to Asana |
| `TARGET_YEAR` | current year | Override for annual scripts |
| `AUTO_CREATE_TASKS` | `false` | Allow transaction-monitor to auto-create Asana tasks |

## Filing mode (scripts/filing-mode.json)

Controls whether goAML filing drafts are generated automatically or
only when the MLRO explicitly requests them.

```json
{
  "STR":   "manual",
  "SAR":   "manual",
  "DPMSR": "manual",
  "PNMR":  "manual",
  "FFR":   "manual"
}
```

**Modes:**

- `manual` — The daily run flags candidate tasks but does not generate
  drafts. To produce a draft, the MLRO adds the tag `hsv2:draft-now` to
  the task in Asana. The next daily run generates the draft.
- `auto` — The daily run generates a draft for every flagged task
  without waiting for the MLRO's tag. The draft is still not submitted;
  it is held for MLRO review.

**Important:** The automation never submits filings to the Financial
Intelligence Unit. Filing is always a manual act by the MLRO.

## Deadlines (scripts/deadlines.json)

A JSON array of regulatory and internal deadlines maintained by the
MLRO. Each entry has:

```json
{
  "id": "moe-annual-return",
  "label": "MOE DNFBP annual return",
  "due": "2026-06-30",
  "owner": "MLRO",
  "recurrence": "annual"
}
```

The `deadline-calendar.mjs` script reads this file daily and produces
a bucketed report (overdue, critical, warning, approaching).

## Entity codes

The automation identifies entities by matching Asana project names:

| Code | Project name pattern | Entity |
|---|---|---|
| FB | `FG BRANCH` | Entity Alpha |
| FL | `FG LLC` | Entity Bravo |
| ML | `MADISON LLC` | Entity Charlie |
| NL | `NAPLES LLC` | Entity Delta |
| GM | `GRAMALTIN AS` | Entity Echo |
| ZF | `ZOE FZE` | Entity Foxtrot |

## Workflow schedules

All times are Asia/Dubai (UTC+4).

| Cadence | Time | Scripts |
|---|---|---|
| Daily (Mon-Fri) | 09:00 | daily-priorities |
| Daily (Mon-Fri) | 09:05 | daily-ops-logs, daily-entity-report |
| Daily (Mon-Fri) | 09:10-09:35 | sanctions-screening, pep-screening, adverse-media, transaction-monitor, cdd-refresh-tracker, deadline-calendar, regulatory-watcher |
| Daily (Mon-Fri) | 17:00 | daily-retro |
| Weekly (Friday) | 16:00 | weekly-report |
| Weekly (Friday) | 17:00-18:00 | weekly-mlro-report, weekly-filings-summary, weekly-ops-logs |
| Monthly (1st biz day) | 09:00-10:00 | monthly-mlro-report, monthly-incident-log, monthly-ops-logs |
| Quarterly (1st biz day after Q-end) | 09:00-10:30 | quarterly-mlro-report, quarterly-jurisdiction-heatmap, quarterly-ops-logs |
| Annual (January) | various | annual-mlro-report, annual-risk-assessment, annual-training-report, annual-programme-effectiveness, annual-customer-exit-report |
| On demand | manual | customer-file-summary, dnfbp-saq, board-aml-pack, inspection-bundle, mlro-handover-report, trend-export |
