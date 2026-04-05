# HAWKEYE STERLING V2 — compliance automation scripts

This folder holds the Node.js scripts that run the firm's AML and CFT
compliance automation. Each script is designed to run unattended on a
GitHub Actions schedule, and every artefact produced is archived under
`history/` for the ten-year retention obligation set by the applicable
provision of Federal Decree-Law No. 10 of 2025.

The entity is HAWKEYE STERLING V2, a UAE-licensed Dealer in Precious
Metals and Stones classified as a Designated Non-Financial Business
and Profession, supervised by the Ministry of Economy. The Money
Laundering Reporting Officer is Luisa Fernanda.

## Script catalogue

| Script | Schedule | Purpose | Archive |
|---|---|---|---|
| `daily-priorities.mjs` | Mon–Fri 09:00 Asia/Dubai | Per-entity top-10 priorities with risk scoring, portfolio digest, counterparty register update, goAML filing detection | `history/daily/`, `history/filings/`, `history/registers/` |
| `weekly-report.mjs` | Friday 16:00 Asia/Dubai | Weekly cross-entity pattern report for the MLRO | `history/weekly/` |
| `weekly-mlro-report.mjs` | Friday 17:00 Asia/Dubai | Formal Weekly MLRO Report to Senior Management | `history/mlro-weekly/` |
| `daily-retro.mjs` | Mon–Fri 17:00 Asia/Dubai | End-of-day completion retro comparing morning priorities to closures | `history/retro/` |
| `inspection-bundle.mjs` | On demand | Inspection evidence bundle manifest for supervisory visits | `history/inspections/` |
| `counterparty-register.mjs` | Library module | CSV-backed cross-entity counterparty register. Called by `daily-priorities.mjs`. | `history/registers/counterparties.csv` |
| `filing-drafts.mjs` | Library module | goAML filing detection and draft generator (STR, SAR, DPMSR, PNMR, FFR). Called by `daily-priorities.mjs`. | `history/filings/` |
| `notify.mjs` | Library module | Optional Gmail notification for the daily portfolio digest and weekly reports | — |
| `regulatory-context.mjs` | Library module | UAE legal framework constants and 0% AI-tells style rules used by every Claude call | — |
| `history-writer.mjs` | Library module | Deterministic file paths under `history/` | — |

## Shared regulatory framing

Every Claude call in every script uses the same `SYSTEM_PROMPT` exported
from `regulatory-context.mjs`. That system prompt:

- Establishes the voice of the compliance function of HAWKEYE STERLING V2
  drafting material for the attention of the MLRO, Luisa Fernanda.
- Lists the only legal references that may be cited verbatim: Federal
  Decree-Law No. 10 of 2025, the Ministry of Economy as DNFBP supervisor,
  the Executive Office for Control and Non-Proliferation as sanctions
  implementing body, the Financial Intelligence Unit and the goAML
  platform, the 10-year retention obligation.
- Forbids citing Federal Decree-Law No. 20 of 2018, any invented article
  number, any invented Cabinet Decision number and any specific AED
  threshold that the MLRO has not confirmed.
- Enforces a 0% AI-tells writing style: formal UAE compliance register,
  no em-dashes, no markdown hash headings, no "as an AI" / "let me" /
  "I hope this helps", short sentences, first person plural for the
  compliance function, first person singular for the MLRO.
- Requires an explicit imperative next-action line at the end of every
  analytical section and a final `For review by the MLRO, Luisa Fernanda.`
  line on every document.

Every response is passed through `validateOutput()` before archival. A
response that cites the 2018 law, contains an em-dash or uses a forbidden
AI phrase is rejected and retried.

## goAML filing mode

`scripts/filing-mode.json` controls draft generation for the five filing
types. Default is `manual` across the board, because the MLRO is in
charge of all filings. The automation never submits to goAML.

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

In `automatic` mode the daily run generates a draft for every detected
candidate of that type. Flip a single type to `automatic` only after the
MLRO is confident in the detector for that type.

## Local usage

```bash
cd scripts
npm install

export ASANA_TOKEN=1/...                   # Asana personal access token
export ANTHROPIC_API_KEY=sk-ant-...         # Anthropic API key with credit
export ASANA_WORKSPACE_ID=1213645083721316  # Compliance Tasks workspace
export ASANA_TEAM_ID=1213645083721318       # optional: HAWKEYE STERLING V2 team

# Dry runs log what would be posted and archived but do not touch Asana
# or the history folder.
npm run daily-priorities:dry
npm run weekly-report:dry

# Real runs
npm run daily-priorities
npm run weekly-report
node daily-retro.mjs
node weekly-mlro-report.mjs
node inspection-bundle.mjs
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ASANA_TOKEN` | yes | — | Asana personal access token |
| `ANTHROPIC_API_KEY` | yes | — | Anthropic API key with credit |
| `ASANA_WORKSPACE_ID` | yes | — | Asana workspace ID |
| `ASANA_TEAM_ID` | optional | — | Team ID for HAWKEYE STERLING V2 |
| `CLAUDE_MODEL` | optional | `claude-haiku-4-5` | Any Claude model ID |
| `PINNED_TASK_NAME` | optional | `📌 Today's Priorities` | Pinned task name each programme uses |
| `PORTFOLIO_PROJECT_NAME` | optional | `SCREENINGS` | Case-insensitive substring for the portfolio target project |
| `MAX_TASKS_PER_PROJECT` | optional | `75` | Cap tasks sent to Claude per project |
| `NOTES_SNIPPET_LENGTH` | optional | `80` | Characters of task notes included in the prompt |
| `PROJECT_DELAY_MS` | optional | `30000` | Pause between projects to stay under Anthropic Tier-1 rate limits |
| `AT_RISK_DAYS` | optional | `3` | Days until due that counts as at-risk |
| `WEEKLY_WINDOW_DAYS` | optional | `7` | Rolling window for the weekly scripts |
| `WINDOW_DAYS` | optional | `365` | Window for the inspection bundle |
| `DRY_RUN` | optional | `false` | Set to `true` to log without posting |
| `GMAIL_USER` | optional | — | Gmail sender for notification email |
| `GMAIL_APP_PASSWORD` | optional | — | 16-character Google app password |
| `GMAIL_TO` | optional | `GMAIL_USER` | Notification recipient |

## GitHub Actions workflows

| Workflow | File | Schedule |
|---|---|---|
| Daily Asana Priorities | `.github/workflows/daily-priorities.yml` | Mon–Fri 09:00 Asia/Dubai |
| Daily Completion Retro | `.github/workflows/daily-retro.yml` | Mon–Fri 17:00 Asia/Dubai |
| Weekly Compliance Pattern Report | `.github/workflows/weekly-report.yml` | Friday 16:00 Asia/Dubai |
| Weekly MLRO Report to Senior Management | `.github/workflows/weekly-mlro-report.yml` | Friday 17:00 Asia/Dubai |
| Inspection Evidence Bundle | `.github/workflows/inspection-bundle.yml` | On demand |

Every workflow:

1. Checks out the repository at full depth with write credentials.
2. Installs the Anthropic SDK via `npm install --omit=dev` (no other
   runtime dependency).
3. Runs the relevant script with the secrets forwarded as environment
   variables.
4. Commits any new files under `history/` back to `main` with a dated
   message. Dry runs skip the commit step.

## Samples vs history

The repository contains two parallel folders that must not be confused.

`samples/` contains format reference documents with **fictitious** data.
Use it to see what each artefact will look like before it runs against
live data. Nothing under `samples/` is evidence.

`history/` contains the live 10-year evidence archive written by the
automation during real runs. Treat it with the same care as any other
compliance record. See `history/README.md` for the full rules.

## Contact

All questions about these scripts are directed to the Money Laundering
Reporting Officer, Luisa Fernanda.
