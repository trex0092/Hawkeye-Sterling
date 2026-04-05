# Scenario: Daily Asana Priorities (All Projects)

**Goal:** Every weekday at 9am, Claude picks the top 10 most important
incomplete tasks in every Asana project in the workspace and posts them as
a comment on a pinned task called `📌 Today's Priorities` in that project.

## Prerequisites (one-time, ~2 min)

1. In **every Asana project** you want prioritized, create a task named
   **exactly** `📌 Today's Priorities`. Leave it incomplete. This is where
   Claude will post. If a project doesn't have this task, it will be skipped.
2. You need an Anthropic API key with credit at
   https://console.anthropic.com.

## Module layout (6 modules)

```
[1] Schedule           (every weekday 09:00)
 └─▶ [2] Asana: List Projects
      └─▶ [3] Asana: Search Tasks           (completed = false)
           └─▶ [4] Array Aggregator          (group tasks per project)
                └─▶ [5] Anthropic Claude: Create a Prompt
                     └─▶ [6] Asana: Create a Comment   (on 📌 Today's Priorities task)
```

## Module-by-module configuration

### Module 1 — Schedule (trigger)

- Module: **Built-in → Scheduler** (no need to add; set via the clock icon at
  the bottom of the canvas).
- **Run scenario:** Days of the week
- **Days:** Mon, Tue, Wed, Thu, Fri
- **Time:** `09:00`
- **Time zone:** your local zone

### Module 2 — Asana: List Projects

- App: **Asana**
- Action: **List Projects** (sometimes "Search Projects" or "Get Projects")
- **Connection:** your Asana connection
- **Workspace:** pick your workspace
- **Archived:** `No`
- **Limit:** `100` (raise if you have more than 100 projects)

> This module outputs one bundle per project. Make automatically iterates the
> remaining modules once per project.

### Module 3 — Asana: Search Tasks

- App: **Asana**
- Action: **Search Tasks** (sometimes "List Tasks" / "List Tasks in a Project")
- **Connection:** your Asana connection
- **Project ID:** map from module 2 → **`GID`** (or `ID`)
- **Completed Since:** leave empty
- **Completed:** `No` (only incomplete tasks)
- **Limit:** `100`

> This returns up to 100 incomplete tasks for the current project.

### Module 4 — Array Aggregator

- App: **Flow Control → Array Aggregator**
- **Source Module:** `3. Asana - Search Tasks`
- **Target structure type:** Custom
- **Aggregated fields:** tick at least `Name`, `Notes`, `Due On`, `Assignee`,
  `GID`, `Permalink URL`, `Priority` (if present as a custom field)
- **Group by:** `{{2.gid}}` (module 2's project GID — groups tasks per project)

### Module 5 — Anthropic Claude: Create a Prompt

- App: **Anthropic Claude**
- Action: **Create a Prompt**
- **Connection:** your Anthropic connection
- **Model:** `Claude Sonnet 4.5` (cheapest capable model; switch to Haiku 4.5
  for ~10× cheaper, or Opus 4.5 for max quality)
- **Max Tokens:** `2000`
- **Effort Level:** `Medium`
- **Messages → Add message:**
  - **Role:** `User`
  - **Content → Add item → Type:** `Text`
  - **Text** (paste, then map the array from module 4 where shown):

```
You are a project management assistant. Below is the full list of incomplete
tasks in one Asana project. Pick the 10 tasks that should be worked on TODAY,
ranked from highest to lowest priority.

Consider: due date urgency, task age, assignee workload, blockers, and
general business impact. If a task has no due date, weight recency and
description importance.

Return ONLY a numbered list (1-10) in this exact format, nothing else:

1. [Task name] — [one-sentence reason] — due: [date or "no due date"]
2. ...

Project tasks:
{{5.array[]}}
```

> Replace `{{5.array[]}}` by clicking the **Array** output of module 4 in
> the right-side mapping panel. It will insert all the tasks as a serialized
> block of text for Claude.

### Module 6 — Asana: Create a Comment

- App: **Asana**
- Action: **Create a Comment** (or "Add Comment to Task")
- **Connection:** your Asana connection
- **Task ID:** this is the tricky part — you need the GID of the
  `📌 Today's Priorities` task inside the current project. Easiest way:
  - Insert a **Module 5.5: Asana → Search Tasks** before this one, filtered
    by `Project = {{2.gid}}` and `Name = 📌 Today's Priorities`, Limit `1`.
  - Then map module 6's `Task ID` from that search result's `GID`.
- **Text:**

```
🤖 Daily priorities — {{formatDate(now; "YYYY-MM-DD")}}

{{5.content[].text}}
```

  - `{{5.content[].text}}` is Claude's response.
  - `{{formatDate(now; "YYYY-MM-DD")}}` adds today's date at the top.

## Activation checklist

- [ ] All target projects have a `📌 Today's Priorities` task created.
- [ ] Module 1 scheduler set to Mon–Fri 09:00, correct time zone.
- [ ] Both connections (Asana + Anthropic) are green.
- [ ] Ran **Run once** manually with a test and verified a comment was posted.
- [ ] Cost estimate is acceptable (see below).
- [ ] Toggled scenario **ON**.

## Cost estimate

Assuming **N** projects with ~50 incomplete tasks each, Sonnet 4.5:

| N projects | Claude calls/month | Anthropic cost | Make ops/month |
|---|---|---|---|
| 3  | ~60  | ~$0.50 | ~450   |
| 5  | ~100 | ~$1    | ~750   |
| 10 | ~200 | ~$2    | ~1,500 ⚠ |
| 20 | ~400 | ~$4    | ~3,000 ⚠ |

⚠ Make free tier is **1,000 ops/month**. If you have more than ~6 projects
on daily runs, either:
- Switch the scheduler to weekly (Mondays only) → divides ops by 5, or
- Upgrade to Make Core ($9/month → 10,000 ops), or
- Reduce the set of projects (add a filter after module 2 to only keep
  projects tagged with a specific keyword).

## Customization ideas

- **Filter projects** — add a *Filter* between modules 2 and 3 to only run on
  projects whose name contains "active" or similar.
- **Skip empty projects** — add a *Filter* after module 3: `Total number of
  bundles > 0`.
- **Email instead of comment** — replace module 6 with an Email/Gmail module.
- **Slack digest** — replace module 6 with `Slack → Create a Message` to a
  single channel, one message per project.

## Changes to this file

Edits to this markdown do **not** propagate to Make. It's reference
documentation only. If you change the scenario in Make's UI, update this
file to match so future-you still has accurate notes.
