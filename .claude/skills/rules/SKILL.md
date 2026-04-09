# /rules — Custom Detection Rule Management

Manage custom compliance detection rules.

## Usage
- `/rules list` — Show all rules with status
- `/rules test <rule_id> <sample_data>` — Dry-run a rule
- `/rules stats` — Show rule firing statistics
- `/rules builtin` — Load all 10 built-in DPMS rules

## Procedure

1. Import `RuleEngine` from `screening/lib/rule-engine.mjs`
2. Initialize with rules path `.screening/rules.json`
3. Based on command:
   - **list**: Show all rules with: ID, name, priority, enabled, severity, conditions summary
   - **test**: Run `dryRun(ruleId, sampleContext)` and show whether rule would fire
   - **stats**: Show per-rule fire counts, false positive rates, precision
   - **builtin**: Load all 10 pre-configured DPMS rules (AED 55K cash, sanctions match, PEP, FATF lists, etc.)
4. Rules cover: transaction.amount, entity.country, screening.band, entity.is_pep, etc.
5. Actions: alert, block, escalate, flag_for_review, add_to_watchlist, require_edd

## Output Format
- Rule table: ID, name, priority, enabled, severity, last fired
- Test result: FIRED or NOT FIRED with condition-by-condition breakdown
- Statistics with precision metrics
- End with "For review by the MLRO."
