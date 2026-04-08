Search the Claude memory system for past compliance observations, screening results, MLRO directives, and session history.

Usage: /mem-search <query>

The memory system uses a 3-layer search pattern:
1. **Search** — returns compact results with IDs and snippets
2. **Timeline** — shows chronological context around matches
3. **Get details** — fetches full observation content

Run `node claude-mem/search/cli.mjs "<query>"` to search.

Optional filters:
- `--category <category>` — Filter by: screening_result, compliance_decision, regulatory_observation, entity_interaction, filing_activity, mlro_directive, risk_assessment, workflow_note, error_resolution, architecture_change
- `--entity <name>` — Filter by entity/counterparty name
- `--importance <min>` — Minimum importance score (1-10)
- `--limit <n>` — Max results (default: 20)

Examples:
```
node claude-mem/search/cli.mjs "sanctions screening gold dealer"
node claude-mem/search/cli.mjs "STR filing" --category filing_activity
node claude-mem/search/cli.mjs "risk" --entity "Al Fardan" --importance 7
```

To view memory stats: `node claude-mem/search/cli.mjs --stats`
