# Claude Memory System for Hawkeye-Sterling

Persistent memory system for Claude Code sessions. Captures compliance
decisions, screening results, regulatory observations, and MLRO directives
across sessions. Injects relevant context automatically at session start.

## Architecture

Inspired by [claude-mem](https://github.com/thedotmack/claude-mem) with
[OpenViking](https://github.com/volcengine/OpenViking)-style hierarchical
context tiers.

```
claude-mem/
  index.mjs              Public API (startSession, observe, search, loadContext)
  config.mjs             Configuration and constants
  db/
    schema.sql           SQLite schema (sessions, observations, summaries, FTS5)
    sqlite.mjs           Storage backend
    verify.mjs           Database integrity checker
  hooks/
    session-start.mjs    Load context on session start
    prompt-submit.mjs    Capture user intent
    post-tool-use.mjs    Record significant tool interactions
    on-stop.mjs          Extract compliance content from responses
    session-end.mjs      Compress and persist session
  context/
    hierarchy.mjs        L0/L1/L2 tiered context loader
    compressor.mjs       Session compression
    compact-cli.mjs      CLI for manual compression
  search/
    hybrid.mjs           Keyword + importance-weighted search
    cli.mjs              Search CLI (3-layer: search, timeline, details)
  skills/
    mem-search.mjs       Slash command integration
  setup.mjs              First-run setup script
```

## Context Tiers

| Tier | Label   | Budget     | Content |
|------|---------|------------|---------|
| L0   | Core    | ~600 tokens | Regulatory framework, active alerts, deadlines |
| L1   | Session | ~800 tokens | Recent session summaries, decisions, directives |
| L2   | Archive | ~600 tokens | Historical observations matching a query |

## Setup

```bash
cd claude-mem
npm install
npm run setup
```

## Observation Categories

| Category | Description |
|----------|-------------|
| screening_result | Sanctions, PEP, adverse media screening outcomes |
| compliance_decision | Approve, reject, block, exit decisions |
| regulatory_observation | Law changes, circular updates, FATF list changes |
| entity_interaction | Counterparty onboarding, CDD, data changes |
| filing_activity | STR, SAR, DPMSR filing drafts and submissions |
| mlro_directive | MLRO decisions and escalation instructions |
| risk_assessment | Risk ratings, EDD triggers, CDD refresh |
| workflow_note | General session activity |
| error_resolution | Bugs fixed, errors resolved |
| architecture_change | Script or system modifications |

## 3-Layer Search

Following claude-mem's token-efficient search pattern:

1. **`search`** — Returns compact index with IDs and snippets (~50-100 tokens)
2. **`timeline`** — Shows chronological context around results
3. **`getObservations`** — Fetches full details for specific IDs

```bash
node search/cli.mjs "sanctions screening"
node search/cli.mjs --timeline 42,43,44
node search/cli.mjs --details 42
node search/cli.mjs --stats
```
