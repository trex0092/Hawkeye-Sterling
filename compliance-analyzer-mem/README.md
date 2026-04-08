# Claude Memory System for Compliance Analyzer (Hawkeye Sterling V2)

Persistent memory system for Claude Code sessions. Captures compliance
decisions, screening results, threshold alerts, supply chain events, and
MLRO directives across sessions. Injects relevant context automatically.

## Installation

Copy the `claude-mem/` directory to your compliance-analyzer repo root:

```bash
# From inside the compliance-analyzer repo:
cp -r /path/to/compliance-analyzer-mem claude-mem
cd claude-mem && npm install && npm run setup

# Copy settings.json to .claude/settings.json:
mkdir -p .claude
cp claude-mem/settings.json .claude/settings.json

# Add to .gitignore:
echo ".claude-mem/" >> .gitignore
echo "claude-mem/node_modules/" >> .gitignore
```

## Tailored for Compliance Analyzer

This version is specifically adapted for the Hawkeye Sterling V2 app:

### L0 Core Context (always injected)
- UAE AML/CFT/CPF regulatory thresholds (AED 55K, AED 60K, 25% UBO, 24h freeze)
- Federal Decree-Law No. 10 of 2025 as primary law
- src/domain/constants.ts as single source of truth
- 12 quick compliance scenarios

### Observation Categories (12 total)
| Category | Triggers on |
|----------|-------------|
| screening_result | TFS screening, PEP checks, sanctions matches |
| compliance_decision | Onboarding approvals, exits, blocks |
| regulatory_observation | Law changes, constants.ts edits |
| entity_interaction | KYC/KYS, UBO verification |
| filing_activity | goAML exports, STR/SAR drafts |
| mlro_directive | MLRO decisions, escalations |
| risk_assessment | Risk ratings, gap assessments |
| threshold_alert | AED 55K/60K breaches, cross-border |
| supply_chain_event | Responsible sourcing, LBMA, gold origin |
| workflow_note | General session activity |
| error_resolution | Bugs fixed |
| architecture_change | Service/auth/RBAC modifications |

### Hook Detection Patterns
The hooks detect compliance-analyzer-specific file paths:
- `src/domain/constants.ts` (importance: 9)
- `compliance-suite.js` (importance: 8)
- `goaml-export.js` (importance: 8)
- `threshold-monitor.js` (importance: 7)
- `regulatory-monitor.js` (importance: 7)
- `supply-chain.js` (importance: 6)
- `src/risk/` (importance: 7)
- `auth-rbac.js` (importance: 7)
- `management-approvals.js` (importance: 6)

## Context Tiers

| Tier | Budget | Content |
|------|--------|---------|
| L0 | ~600 tokens | Thresholds, legislation, constants path, alerts |
| L1 | ~800 tokens | Recent sessions, decisions, screenings, directives |
| L2 | ~600 tokens | Historical observations matching a query |

## 3-Layer Search

```bash
node claude-mem/search/cli.mjs "TFS screening"
node claude-mem/search/cli.mjs --category threshold_alert
node claude-mem/search/cli.mjs --timeline 42,43
node claude-mem/search/cli.mjs --stats
```
