# Hawkeye-Sterling automation scripts

Small Node.js scripts that automate repetitive compliance-workflow tasks
against Asana and other tools. They are designed to run from the command line
locally or on a schedule from GitHub Actions.

## `daily-priorities.mjs`

**What it does**

Every weekday morning, for every active Asana project in the
`HAWKEYE STERLING V2` workspace:

1. Fetches all **incomplete** tasks in the project.
2. Finds a pinned task named `📌 Today's Priorities`. If the project does
   not have one, it is **skipped** — the pinned task acts as an opt-in list.
3. Flags **at-risk** tasks (overdue or due within `AT_RISK_DAYS` — default
   3 business days) and surfaces them as a dedicated `⚠️ AT RISK` section
   at the top of the comment with direct Asana links.
4. Sends a curated shortlist (at-risk first, then due-date, then freshness)
   to Claude with a compliance-aware prompt.
5. Claude returns a ranked top-10 list with a one-sentence justification per
   task, weighted by regulatory severity, due dates, and dependencies. Each
   line is rewritten with a clickable Asana permalink.
6. Posts the enriched comment on the `📌 Today's Priorities` task.

After processing every project, the script also calls Claude once more with
all per-project top-10s and generates a **cross-entity portfolio digest**
(`TOP 5 PORTFOLIO PRIORITIES` + `CROSS-ENTITY PATTERNS`). This single
comment is posted to the pinned `📌 Today's Priorities` task inside the
project named by `PORTFOLIO_PROJECT_NAME` (default `SCREENINGS`), so you
get one page to read for "what matters today across the whole group" on top
of the per-entity drill-downs.

Scrolling the comment history of any pinned task gives you a day-by-day log
of AI-suggested priorities.

## `weekly-report.mjs`

**What it does**

Every Friday at 16:00 Asia/Dubai, pulls every task modified in the last 7
days across every active Asana project and asks Claude to write a single
**weekly pattern report** with this structure:

- `HEADLINE` — the single most important takeaway for the week
- `CROSS-ENTITY PATTERNS` — typologies/counterparties/jurisdictions that
  appeared in more than one entity
- `EMERGING RISKS` — new or escalating items that deserve attention next week
- `STALLED INVESTIGATIONS` — items sitting open for multiple weeks
- `WINS OF THE WEEK` — tasks closed that materially reduced risk
- `RECOMMENDED NEXT WEEK FOCUS` — three bullets to walk into Monday with

The report is posted once, as a comment on the pinned `📌 Today's Priorities`
task inside the `PORTFOLIO_PROJECT_NAME` project. This lets one place hold
both the daily tactical digests and the weekly strategic narrative.

### Local usage

```bash
cd scripts
npm install

export ASANA_TOKEN=1/...                  # Asana personal access token
export ANTHROPIC_API_KEY=sk-ant-...        # Anthropic API key with credit
export ASANA_WORKSPACE_ID=1213645083721316 # from the Asana URL or API
export ASANA_TEAM_ID=1213645083721318      # optional — HAWKEYE STERLING V2
export CLAUDE_MODEL=claude-sonnet-4-5      # optional, default sonnet-4-5
export PINNED_TASK_NAME="📌 Today's Priorities"  # optional, default as shown

# Dry run first — logs what would be posted but doesn't touch Asana
npm run daily-priorities:dry

# Real run
npm run daily-priorities
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ASANA_TOKEN` | ✅ | — | Asana personal access token. Create at https://app.asana.com/0/my-apps |
| `ANTHROPIC_API_KEY` | ✅ | — | API key from https://console.anthropic.com (needs a few USD of credit) |
| `ASANA_WORKSPACE_ID` | ✅ | — | Numeric workspace ID, e.g. `1213645083721316` |
| `ASANA_TEAM_ID` | optional | — | Scope to one team. Recommended: `HAWKEYE STERLING V2` team ID |
| `CLAUDE_MODEL` | optional | `claude-haiku-4-5` | Any Claude model ID. Switch to `claude-sonnet-4-5` for higher quality once you are past Anthropic Tier 1 |
| `PINNED_TASK_NAME` | optional | `📌 Today's Priorities` | Exact task name to post per-project comments on |
| `PORTFOLIO_PROJECT_NAME` | optional | `SCREENINGS` | Case-insensitive substring match; the pinned task inside the matched project receives the portfolio digest and weekly report |
| `MAX_TASKS_PER_PROJECT` | optional | `75` | How many tasks to send Claude per project. Lower it on Tier-1 Anthropic accounts |
| `NOTES_SNIPPET_LENGTH` | optional | `80` | Characters of task description sent to Claude per task |
| `PROJECT_DELAY_MS` | optional | `30000` | Pause between projects so we stay under the Tier-1 rate limit (30k input tokens/min) |
| `AT_RISK_DAYS` | optional | `3` | A task is flagged at-risk if overdue or due within this many days |
| `WEEKLY_WINDOW_DAYS` | optional | `7` | How far back `weekly-report.mjs` looks for activity |
| `DRY_RUN` | optional | `false` | Set to `true` to log without posting |

### Pre-requisites in Asana

In every project you want prioritized, create a single task named **exactly**
`📌 Today's Priorities` (copy the emoji to avoid encoding issues). Pin it to
the top, no assignee, no due date, not completed. Projects without this task
are silently skipped.

### Cost

- **GitHub Actions:** free tier covers this easily (~2 minutes per run × 22
  runs/month ≈ 44 minutes of the 2,000 free minutes/month).
- **Anthropic API:** ~\$1–3/month with Sonnet 4.5 for 6 projects × 22 days.
  Switch `CLAUDE_MODEL` to `claude-haiku-4-5-20251001` for ~10× cheaper.
- **Asana API:** free.

## Automation: GitHub Actions

Two workflows live in `.github/workflows/`:

### `daily-priorities.yml`
- **Schedule:** Monday–Friday at 09:00 Asia/Dubai (05:00 UTC).
- **Manual:** `Actions` tab → `Daily Asana Priorities` → `Run workflow`.
  You can tick the "Dry run" option to test without posting.

### `weekly-report.yml`
- **Schedule:** every Friday at 16:00 Asia/Dubai (12:00 UTC).
- **Manual:** `Actions` tab → `Weekly Compliance Pattern Report` → `Run
  workflow`. Has the same Dry run toggle.

### One-time setup

1. Push this branch to GitHub.
2. In the repo, go to **Settings → Secrets and variables → Actions → New
   repository secret** and add:
   - `ASANA_TOKEN` → your Asana personal access token
   - `ANTHROPIC_API_KEY` → your Anthropic API key
   - `ASANA_WORKSPACE_ID` → `1213645083721316`
   - `ASANA_TEAM_ID` → *(optional)* your HAWKEYE STERLING V2 team ID
3. *(Optional)* Under **Variables** (same page), add:
   - `CLAUDE_MODEL` — e.g. `claude-haiku-4-5-20251001` if you want cheaper
   - `PINNED_TASK_NAME` — if you want a different pinned task name
4. Open the **Actions** tab, find **Daily Asana Priorities**, click
   **Run workflow** → set Dry run to `true` → Run. Verify the logs look sane.
5. Run it again with Dry run `false` to post real comments.
6. From that point on it runs automatically every weekday at 09:00 Dubai time.

### Getting the Asana workspace/team IDs

The workspace ID is visible in any Asana URL — the number after `/0/` or in
the project URL path. You can also fetch it from the API:

```bash
curl -H "Authorization: Bearer $ASANA_TOKEN" \
  https://app.asana.com/api/1.0/workspaces
```

For this repo the workspace is `[Workspace] Compliance Tasks` with ID
`1213645083721316`.

### Getting a personal access token

1. Go to https://app.asana.com/0/my-apps
2. Click **+ Create new token**.
3. Name it e.g. `hawkeye-sterling-daily-priorities`.
4. Copy the token (you'll only see it once) and paste it into the GitHub
   secret `ASANA_TOKEN`.

## Troubleshooting

- **"Missing required env var"** — one of the three required secrets is not
  set. Check the repo secrets page.
- **Asana 401** — `ASANA_TOKEN` is wrong, revoked, or missing the scope for
  your workspace.
- **Asana 403 on `/projects`** — the token's user is not a member of the
  workspace, or the `ASANA_TEAM_ID` is from a different workspace.
- **`no "📌 Today's Priorities" task — skipping`** — the project does not
  have the pinned task. Create it in Asana (row 1 of the project list) with
  the exact name including the emoji. Only enable the projects you want.
- **Anthropic 401** — bad API key.
- **Anthropic 429 / credit exhausted** — add credit at
  https://console.anthropic.com/settings/billing.
