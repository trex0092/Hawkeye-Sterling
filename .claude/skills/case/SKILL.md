# /case — Investigation Case Management

Create, update, or review investigation cases.

## Usage
- `/case create <entity> <reason>` — Open a new case
- `/case list` — Show all open cases
- `/case <case_id>` — Show case details
- `/case escalate <case_id>` — Escalate to MLRO

## Procedure

1. Import `CaseManager` from `screening/lib/case-manager.mjs`
2. Initialize with register path `.screening/case-register.json`
3. Based on the command:
   - **create**: Call `create()` with entity, reason, priority (auto-assess based on context)
   - **list**: Call `list()` filtered by status, show as table with SLA countdown
   - **view**: Call `get(caseId)`, show full timeline, evidence, assignments
   - **escalate**: Call `transition()` to escalate, require reason
4. Show SLA status: P1=24h, P2=3d, P3=7d, P4=30d
5. Flag overdue cases prominently
6. Record observation via `claude-mem/index.mjs` with category `workflow_note`

## Output Format
- Case header: ID, status, priority, assignee, SLA
- Evidence chain timeline
- Linked cases and entities
- End with "For review by the MLRO."
