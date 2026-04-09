# Entity Risk Scoring

Calculate a quantitative risk score for an entity using the likelihood x impact matrix.

**Trigger:** `/risk-score <name> <country>`

## Procedure

1. **Import the risk scoring module.**
   ```js
   import { calculateRisk } from '/home/user/Hawkeye-Sterling/screening/analysis/risk-scoring.mjs';
   ```

2. **Build the parameters object.** Use the provided name and country code. If additional context is available (PEP status, sanctions score, product type, channel, volume), include them.
   ```js
   const assessment = calculateRisk({
     name: '<name>',
     country: '<country>',
     isPep: false,            // set true if known PEP
     sanctionsScore: 0,       // from prior screening result if available
     annualVolumeAed: 0,      // if known
     productType: 'other',    // fine_gold, gold_jewellery, precious_stones, mixed, other
     channel: 'wire',         // cash, cheque, wire, crypto, card
     adverseMediaCount: 0,
     sowVerified: false,
   });
   ```

3. **Display the risk assessment.** Present these fields:
   - **Risk Score** (`assessment.score`): value from 1 to 25
   - **Band** (`assessment.band`): LOW (1-4), MEDIUM (5-9), HIGH (10-15), CRITICAL (16-25)
   - **CDD Level** (`assessment.cddLevel`): SDD, CDD, or EDD
   - **Review Cycle** (`assessment.reviewCycle`): 12 months, 6 months, 3 months, or 1 month
   - **Senior Management Approval** (`assessment.requiresSeniorApproval`): required if score >= 16 or PEP

4. **List all likelihood factors** from `assessment.likelihoodFactors`. Show each factor name, weight, and detail.

5. **List all impact factors** from `assessment.impactFactors`. Show each factor name, weight, and detail.

6. **Show recommendations** from `assessment.recommendations`. Present each as an actionable item.

7. **Show methodology reference**: `assessment.methodology.reference`

8. **Record in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'risk_assessment',
     content: `Risk scored "${name}" (${country}): score=${assessment.score}, band=${assessment.band}, cdd=${assessment.cddLevel}`,
     entityName: name,
     importance: assessment.score >= 16 ? 10 : assessment.score >= 10 ? 7 : 4,
   });
   ```

9. **Compliance note.** End with:
   > Risk assessment per FDL No. 10/2025 Art. 13-14 and FATF Recommendation 1. For review by the MLRO.
