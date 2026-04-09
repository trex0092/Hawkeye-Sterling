# /ubo — Ultimate Beneficial Owner Trace

Trace the ownership chain of an entity to identify all UBOs and check for sanctions ownership exposure.

## Usage
`/ubo <entity_name>`

## Procedure

1. Import `OwnershipGraph`, `calculateUBOs`, `validateSanctionsOwnership` from `screening/analysis/ubo-calculator.mjs`
2. Build the ownership graph from available data (check `history/registers/` for ownership records)
3. Run `calculateUBOs(graph, entityId)` with the 25% threshold
4. Run `validateSanctionsOwnership(graph, entityId, sanctionedIds)` with the 50% threshold
5. Present results:
   - All identified UBOs with effective ownership percentages
   - Ownership chains showing each step
   - Nominee/trust flags
   - FATF jurisdiction risk for each UBO
   - 50% sanctions ownership determination
6. If sanctions nexus found: state determination clearly (DESIGNATED_BY_OWNERSHIP / PARTIAL / NO_NEXUS)
7. Record observation via `claude-mem/index.mjs` with category `risk_assessment`

## Output Format
- Ownership tree with percentages
- UBO table: name, country, effective %, nominee flag, risk score
- Sanctions ownership result with action required
- End with "For review by the MLRO."
