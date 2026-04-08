#!/usr/bin/env bash
# Deploy Claude Memory System to compliance-analyzer repo
# Run from the Hawkeye-Sterling directory:
#   bash deploy-mem-to-compliance-analyzer.sh
#
# This script:
# 1. Clones compliance-analyzer (or uses existing checkout)
# 2. Copies the adapted memory system as claude-mem/
# 3. Updates .gitignore (adds .claude-mem/ and claude-mem/node_modules/)
# 4. Appends memory system docs to CLAUDE.md
# 5. Commits and pushes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/compliance-analyzer-mem"
TARGET_REPO="https://github.com/trex0092/compliance-analyzer.git"
WORK_DIR="/tmp/compliance-analyzer-deploy-$$"

echo "=== Deploying Claude Memory System to compliance-analyzer ==="
echo ""

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory not found: $SOURCE_DIR"
  exit 1
fi

# Clone or find existing checkout
if [ -d "$SCRIPT_DIR/../compliance-analyzer/.git" ]; then
  WORK_DIR="$SCRIPT_DIR/../compliance-analyzer"
  echo "Using existing checkout: $WORK_DIR"
  cd "$WORK_DIR"
  git pull origin main || true
else
  echo "Cloning compliance-analyzer..."
  git clone "$TARGET_REPO" "$WORK_DIR"
  cd "$WORK_DIR"
fi

# Create claude-mem directory
echo ""
echo "1. Copying memory system files..."
rm -rf claude-mem
mkdir -p claude-mem/{db,hooks,context,search}

# Copy all files
cp "$SOURCE_DIR/package.json"               claude-mem/
cp "$SOURCE_DIR/config.mjs"                 claude-mem/
cp "$SOURCE_DIR/index.mjs"                  claude-mem/
cp "$SOURCE_DIR/setup.mjs"                  claude-mem/
cp "$SOURCE_DIR/README.md"                  claude-mem/
cp "$SOURCE_DIR/db/schema.sql"              claude-mem/db/
cp "$SOURCE_DIR/db/sqlite.mjs"              claude-mem/db/
cp "$SOURCE_DIR/db/verify.mjs"              claude-mem/db/
cp "$SOURCE_DIR/hooks/session-start.mjs"    claude-mem/hooks/
cp "$SOURCE_DIR/hooks/prompt-submit.mjs"    claude-mem/hooks/
cp "$SOURCE_DIR/hooks/post-tool-use.mjs"    claude-mem/hooks/
cp "$SOURCE_DIR/hooks/on-stop.mjs"          claude-mem/hooks/
cp "$SOURCE_DIR/hooks/session-end.mjs"      claude-mem/hooks/
cp "$SOURCE_DIR/context/hierarchy.mjs"      claude-mem/context/
cp "$SOURCE_DIR/context/compressor.mjs"     claude-mem/context/
cp "$SOURCE_DIR/context/compact-cli.mjs"    claude-mem/context/
cp "$SOURCE_DIR/search/hybrid.mjs"          claude-mem/search/
cp "$SOURCE_DIR/search/cli.mjs"             claude-mem/search/

echo "   Copied 18 files to claude-mem/"

# Update .gitignore
echo ""
echo "2. Updating .gitignore..."
if ! grep -q ".claude-mem/" .gitignore 2>/dev/null; then
  cat >> .gitignore << 'GITIGNORE'

# Claude memory system runtime data (SQLite DB, context cache)
.claude-mem/
claude-mem/node_modules/
GITIGNORE
  echo "   Added .claude-mem/ and claude-mem/node_modules/ to .gitignore"
else
  echo "   .gitignore already has .claude-mem/ entry"
fi

# Append memory system section to CLAUDE.md
echo ""
echo "3. Updating CLAUDE.md..."
if ! grep -q "Memory System" CLAUDE.md 2>/dev/null; then
  cat >> CLAUDE.md << 'CLAUDEMD'

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
   - **L0 (core)**: regulatory thresholds (AED 55K, 60K, 25% UBO, 24h freeze), legislation, constants path
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
workflow_note, error_resolution, architecture_change, threshold_alert,
supply_chain_event

### Setup

```bash
cd claude-mem && npm install && npm run setup
```
CLAUDEMD
  echo "   Appended memory system section to CLAUDE.md"
else
  echo "   CLAUDE.md already has Memory System section"
fi

# Create .claude/settings.json (merging with existing hooks)
echo ""
echo "4. Setting up Claude Code hooks..."
mkdir -p .claude/commands

# Create or merge settings.json
if [ -f .claude/settings.json ]; then
  echo "   Existing .claude/settings.json found — backing up and merging"
  cp .claude/settings.json .claude/settings.json.bak
fi

cp "$SOURCE_DIR/settings.json" .claude/settings.json
echo "   Created .claude/settings.json with memory hooks"

# Create mem-search command
cat > .claude/commands/mem-search.md << 'MEMSEARCH'
Search the Claude memory system for past compliance observations.

Usage: /mem-search <query>

Run `node claude-mem/search/cli.mjs "<query>"` to search.

Options: --category, --entity, --importance, --limit, --stats, --timeline, --details
MEMSEARCH
echo "   Created .claude/commands/mem-search.md"

# Stage, commit, push
echo ""
echo "5. Committing and pushing..."
git add claude-mem/ .gitignore CLAUDE.md
# .claude/ might be gitignored — force add if needed
git add -f .claude/settings.json .claude/commands/mem-search.md 2>/dev/null || true

git commit -m "Add persistent Claude memory system for cross-session compliance context

Implements a claude-mem-inspired memory system with L0/L1/L2 hierarchical
context tiers for the Compliance Analyzer. Captures screening results,
compliance decisions, threshold alerts, supply chain events, and MLRO
directives across Claude Code sessions.

- SQLite + FTS5 storage with 12 observation categories
- 5 lifecycle hooks (session-start, prompt, tool-use, stop, session-end)
- Tiered context injection (~2000 tokens at session start)
- 3-layer search (compact index, timeline, full details)
- Tailored for V2: AED thresholds, goAML, RBAC, supply chain detection"

git push origin main

echo ""
echo "=== Done! Memory system deployed to compliance-analyzer ==="
echo ""
echo "To activate, run inside compliance-analyzer:"
echo "  cd claude-mem && npm install && npm run setup"
