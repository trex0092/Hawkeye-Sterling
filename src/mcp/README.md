# Hawkeye-Sterling MCP server

Weaponized AML/CFT/sanctions screening exposed over the Model Context Protocol.

Loads the Charter P1–P10, the 200-mode reasoning catalogue, the cognitive
amplifier and the citation-enforcement doctrine into your MCP client's system
prompt, and exposes the brain as a tool palette the client can call.

## What you get

**One prompt** (`weaponized_screening`) — emits the full
`weaponizedSystemPrompt(...)` with charter + cognitive catalogue + meta-
cognition + amplifier + citation enforcement + integrity hashes (charterHash,
catalogueHash, compositeHash). The agent must echo all three in its
`AUDIT_LINE` or its verdict is treated as `BLOCKED`.

**Nine tools** the agent can wield:

| Tool | What it returns |
|---|---|
| `hawkeye_screen` | Full `BrainVerdict` from `engine.run()` — outcome, posterior, methodology, reasoning chain, conflicts, firepower, evidence-weighted summary |
| `hawkeye_evaluate_redlines` | Consolidated overriding action from a list of fired redline IDs |
| `hawkeye_list_redlines` | The full hard-stop catalogue — useful before disposition |
| `hawkeye_classify_pep` | `PepClassification` for a verifiable role string (P8: never from training data) |
| `hawkeye_match_entity` | Pairwise entity-resolution result with charter caps |
| `hawkeye_corroborate_evidence` | Conservative multi-source corroboration score ∈ [0,1] |
| `hawkeye_sanction_delta` | Diff two list snapshots → additions / removals / amendments |
| `hawkeye_analyse_adverse_media` | FATF-mapped severity tiers, SAR triggers, counterfactual, narrative |
| `hawkeye_brain_manifest` | The full weaponized manifest + the three integrity hashes |

## Setup

```bash
cd ~/Hawkeye-Sterling
npm install
npm run build
```

Confirm the server starts:

```bash
npm run mcp:serve
# → [hawkeye-sterling] connected (v0.2.0) on stderr
# (the process appears to hang — that is correct, it is listening on stdio)
# Ctrl-C to stop.
```

## Wire into Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "hawkeye-sterling": {
      "command": "node",
      "args": ["C:/Users/fernanda.mejia/Hawkeye-Sterling/dist/src/mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop. You should see:

- The 9 tools appear in the tool menu (hammer icon).
- The `weaponized_screening` prompt available as a slash command (`/`).

## Using the agent

1. In a new chat, run `/weaponized_screening` (you can supply optional
   `taskRole` and `audience` arguments). This loads the full charter +
   cognitive catalogue as the first user message, including the integrity
   hashes the agent must echo.
2. Ask the agent to screen a subject — e.g. *"Screen Acme Trading LLC,
   incorporated UAE, DPMS sector, transactions in evidence pack."* The
   agent will call `hawkeye_screen`, review the BrainVerdict, optionally
   run `hawkeye_corroborate_evidence` on cited items, optionally call
   `hawkeye_evaluate_redlines` if redlines fired, and produce the seven-
   section regulator-facing narrative the charter mandates.
3. The agent's `AUDIT_LINE` MUST contain the three integrity hashes
   verbatim. Any response missing them is — by the charter — a BLOCKED
   verdict; reject it and run again.

## Wire into Claude Code

```bash
claude mcp add hawkeye-sterling -- node /absolute/path/to/Hawkeye-Sterling/dist/src/mcp/server.js
```

Then in a Claude Code session: `/mcp` should list `hawkeye-sterling` as
connected with 9 tools and 1 prompt.

## Troubleshooting

- **"unknown tool: …"** — the build is stale; rerun `npm run build`.
- **The agent skips the integrity block** — it is hallucinating. Reject
  the response. The weaponized prompt is content-frozen; failure to echo
  the hashes is a Charter P9 violation.
- **Tool times out** — `hawkeye_screen` runs every selected reasoning mode.
  For large evidence packs cap with `maxModes`. Default selects modes by
  domain inference from `subject.type` + `evidence.*` keys.
- **`Cannot find module '@modelcontextprotocol/sdk/server/index.js'`** —
  `npm install` did not complete. The package is in `dependencies` of the
  root `package.json`; run `npm install` from the repo root.

## Development

The server is a single file at `src/mcp/server.ts`. Tools are registered
inline. To add a new tool:

1. Append a JSON-Schema descriptor to `TOOLS`.
2. Add a `case` to the `dispatch` switch that calls the underlying brain
   function and returns its result (the response wrapper serialises to
   text content automatically).

Test locally with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/src/mcp/server.js
```

## Charter compliance by construction

- **No fabrication (P1, P2)** — tools only return what the underlying
  deterministic brain functions produce. The agent cannot invent
  evidence; if it tries, the verdict's `bayesTrace` shows zero supporting
  evidence and the redlines block.
- **No tipping-off (P4)** — tipping-off guard runs inside the brain;
  drafted external comms get filtered before they leave.
- **No allegation upgrade (P5)** — adverse-media analyser preserves the
  alleged/charged/convicted distinction in its output structure.
- **No training-data sources (P8)** — `evidenceIndex` is the only path
  for evidence; cited evidence with `kind: 'training_data'` collapses
  the LR weight to 0 (Charter P8) and triggers the
  `rl_training_data_as_sanctions_source` redline if a sanctions claim
  depends on it.
- **Integrity (P9)** — `charterHash` + `catalogueHash` + `compositeHash`
  are emitted with every prompt load, and the agent must echo them.
