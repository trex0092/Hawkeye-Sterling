# Make.com automations

This folder stores Make.com scenario blueprints so the automations around this
project can be version-controlled alongside the code.

## Scenarios

### `daily-priorities-scenario.md` ⭐ current focus

**Flow:** Schedule (Mon–Fri 9am) → Asana List Projects → Asana Search Tasks →
Array Aggregator → Claude prioritize top 10 → Asana Create Comment on a pinned
`📌 Today's Priorities` task in each project.

See the markdown file for the full click-by-click build guide, cost estimates,
and customization notes. Built manually in Make's UI rather than via a
blueprint import (because several module IDs are not stable across Make
versions and auto-import fails on them).

### `asana-claude-triage.blueprint.json`

**Flow:** Asana (Watch Tasks) → Anthropic Claude (Create a Prompt) → Asana (Add Comment)

Every new Asana task in the selected project is summarized by Claude Sonnet 4.5
and the summary is posted back as a comment on the same task.

#### Import into Make

1. Open https://eu1.make.com (or your region) and create a new scenario.
2. In the scenario editor, click the three-dot menu (⋯) in the bottom toolbar
   → **Import Blueprint**.
3. Upload `asana-claude-triage.blueprint.json`.
4. Reconnect the two connections that appear with red badges:
   - **Asana** → click the module → *Connection* → **Add** → sign in.
   - **Anthropic Claude** → click the module → *Connection* → **Add** → paste
     an API key from https://console.anthropic.com (needs a few dollars of
     credit; each task costs roughly $0.001–0.01 with Sonnet 4.5).
5. On module 1 (Asana Watch Tasks), pick your **Project** from the dropdown.
6. Click **Save**.
7. **Before enabling**, click **Run once** and create one test task in the
   selected Asana project to verify the flow end-to-end.
8. When the first run is green, toggle the scenario **ON**. Important: when
   Make asks where to start, pick **"From now on"** so it does not re-process
   every historical task.

#### Cost / ops guardrails

- Each task triggers 3 Make operations (Asana read + Claude + Asana comment).
  On the free plan (1,000 ops/month) that is ~333 tasks/month.
- Each task calls the Anthropic API once. Sonnet 4.5 at ~1k tokens in /
  300 tokens out ≈ **$0.008** per task. Switch to Claude Haiku 4.5 if you want
  roughly 10× cheaper.
- Raise **Max Tokens** if summaries get cut off. Lower **Effort Level** to
  `low` if you want faster/cheaper responses.

#### Customizing the prompt

The prompt lives in module 2, `mapper.messages[0].content[0].text`. Edit it in
Make's UI after import — changes made to this JSON file are **not** pushed
back to Make automatically.
