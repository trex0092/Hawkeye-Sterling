# /audit-verify — Verify Audit Chain Integrity

Verify the hash-chained audit log and optionally anchor to blockchain.

## Usage
`/audit-verify`

## Procedure

1. Import screening module from `screening/index.js` and init
2. Run `screening.verify()` to check the audit chain
3. If chain is valid:
   - Report: entries verified, head hash, sequence number
   - Import `BlockchainAnchor` from `screening/lib/blockchain-anchor.mjs`
   - Anchor the current audit head to the configured backend
   - Show anchor receipt
4. If chain is broken:
   - Report: break point (sequence, reason)
   - Classify break: hash-mismatch, seq-out-of-order, prev-mismatch, timestamp-regression
   - State severity and immediate action required
   - Recommend MLRO escalation
5. Record observation via `claude-mem/index.mjs` with category `compliance_decision`

## Output Format
- Verification result: PASS or FAIL
- Entry count and head hash
- Blockchain anchor receipt (if anchored)
- Break details (if failed)
- End with "For review by the MLRO."
