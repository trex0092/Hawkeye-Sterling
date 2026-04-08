# Hawkeye-Sterling — Claude Code Memory Context

## Project Identity

Hawkeye-Sterling is an AML/CFT compliance automation system for a UAE-licensed
Dealer in Precious Metals and Stones operating as a DNFBP.

- **Supervisor**: Ministry of Economy
- **Primary law**: Federal Decree-Law No. 10 of 2025
- **FORBIDDEN**: Never cite Federal Decree-Law No. 20 of 2018

## Memory System

This project uses a persistent memory system (`claude-mem/`) that automatically
captures compliance decisions, screening results, and regulatory observations
across Claude Code sessions.

### How it works

1. **Session lifecycle hooks** (`.claude/settings.json`) trigger on session
   start, prompt submission, tool use, response completion, and session end.
2. Observations are stored in SQLite (`.claude-mem/memory.db`) with FTS5
   full-text search.
3. Context is loaded in three tiers at session start:
   - **L0 (core)**: regulatory framework, active alerts, deadlines
   - **L1 (session)**: recent session summaries, compliance decisions, MLRO directives
   - **L2 (archive)**: historical observations matching a query

### Searching memory

Use `/mem-search` or run directly:
```
node claude-mem/search/cli.mjs "query"
node claude-mem/search/cli.mjs --stats
node claude-mem/search/cli.mjs --timeline 42,43
```

### Observation categories

screening_result, compliance_decision, regulatory_observation,
entity_interaction, filing_activity, mlro_directive, risk_assessment,
workflow_note, error_resolution, architecture_change

## Coding Conventions

- **Node.js 20+**, ESM modules (`.mjs`), minimal dependencies
- All output is **plain-text UTF-8** for regulator transparency
- Formal compliance register voice, 0% AI-tells in generated content
- No em-dashes, markdown hash headings, or "as an AI" in output documents
- First person plural for the compliance function; first person singular for MLRO
- Every document ends with "For review by the MLRO."
- The `regulatory-context.mjs` file is the **single source of truth** for all
  UAE law references — never cite a provision not listed there

## Directory Layout

```
scripts/         51 automation scripts (daily/weekly/monthly/quarterly/annual)
screening/       Zero-dependency sanctions/PEP screening engine
history/         10-year compliance evidence archive (append-only)
claude-mem/      Persistent memory system (this feature)
.claude/         Claude Code hooks and commands
samples/         Format reference artefacts (fictitious data only)
docs/            Operator documentation
```

## Setup

```bash
cd claude-mem && npm install && npm run setup
```
