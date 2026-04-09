# /network — Network Intelligence Analysis

Analyze entity relationships, detect hidden networks, and map geographic flows.

## Usage
`/network <entity_name>` or `/network` (analyze all)

## Procedure

1. Import `analyzeNetwork` from `screening/analysis/network-intel.mjs`
2. Load transaction data from `history/registers/transactions.csv`
3. Load entity data from `history/registers/counterparties.csv`
4. Run `analyzeNetwork({ transactions, entities, addresses, ubos, familyRelationships, nominees })`
5. Present results:
   - **Clusters**: Hidden networks with member lists, risk scores, shared infrastructure
   - **Temporal patterns**: Coordinated activity detected
   - **Geographic flows**: Cross-border corridors, high-risk corridors flagged
   - **Anomaly scores**: Top anomalous entities with reasons
6. Highlight any FATF blacklist/greylist jurisdiction involvement
7. Record observation via `claude-mem/index.mjs` with category `entity_interaction`

## Output Format
- Network summary: nodes, edges, clusters
- Critical clusters with member lists
- Top anomalous entities table
- High-risk corridors
- End with "For review by the MLRO."
