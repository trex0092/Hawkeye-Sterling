# /anomaly — ML Anomaly Detection on Transactions

Run the ML anomaly detection ensemble on transaction data.

## Usage
- `/anomaly` — Analyze all recent transactions
- `/anomaly <entity>` — Analyze transactions for a specific entity

## Procedure

1. Import `detectAnomalies`, `trainBaselines` from `screening/analysis/ml-anomaly.mjs`
2. Load transactions from `history/registers/transactions.csv`
3. Optionally filter by entity if specified
4. Train behavioral baselines: `trainBaselines(transactions)`
5. Run detection: `detectAnomalies(transactions, { entityProfiles })`
6. Present results:
   - Top anomalies ranked by ensemble score
   - Per-anomaly: detector breakdown (Isolation Forest, Z-Score, LOF, Reconstruction, Behavioral)
   - Severity distribution: critical/high/medium/low/normal counts
   - Top anomalous entities
   - Statistics: mean/median/p95/p99 anomaly scores
7. Record observation via `claude-mem/index.mjs` with category `risk_assessment`

## Output Format
- Summary statistics table
- Top 10 anomalies with full detector breakdown
- Entity anomaly leaderboard
- Severity distribution
- Recommendations for critical/high anomalies
- End with "For review by the MLRO."
