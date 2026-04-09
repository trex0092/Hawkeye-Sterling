# Compliance Health Check

Run a full compliance health assessment and produce an organisation-wide grade.

**Trigger:** `/compliance-grade`

## Procedure

1. **Import the compliance grading module.**
   ```js
   import { calculateComplianceGrade } from '/home/user/Hawkeye-Sterling/screening/analysis/compliance-grade.mjs';
   ```

2. **Gather metrics from the six compliance pillars.** Use the screening module and project files to collect:
   - **Screening coverage**: Read the counterparty register and determine how many have been screened within cycle. Check `history/` for recent screening records.
   - **List freshness**: Import `checkFreshness` from `screening/lib/staleness.mjs` to assess each sanctions source age.
   - **Filing timeliness**: Read the filing register at `history/filings/register.json` to count on-time vs overdue filings.
   - **Audit integrity**: Import `verify` from `screening/index.js` and run `await Screening.verify()` to check the hash chain.
   - **Training compliance**: Check `history/` for training records or use defaults.
   - **Review cadence**: Check CDD review records for on-schedule completion.

3. **Calculate the compliance grade.**
   ```js
   const scorecard = calculateComplianceGrade({
     screening: { totalCounterparties, screenedWithinCycle, cycleMonths: 6 },
     freshness: { sources: freshnessResults },
     filing: { totalFilings, filedOnTime, overdue, pending },
     audit: { chainValid, entriesVerified, lastVerified },
     training: { totalStaff, trained, dueDate },
     review: { totalDue, completedOnTime, overdue },
   });
   ```

4. **Display the scorecard.** Present:
   - **Overall Grade**: e.g., "B+ (Very Good)" with the numeric score
   - **Pillar-by-pillar breakdown**: For each of the 6 pillars show:
     - Pillar name and weight
     - Score (0-100)
     - Detail text
     - Any findings (deficiencies)

5. **List all findings** across pillars. Each finding should be presented as:
   - Severity (critical / warning / info)
   - Pillar affected
   - Description
   - Recommended remediation action

6. **Show recommendations** from the scorecard. Prioritize by severity.

7. **Record in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'compliance_decision',
     content: `Compliance grade: ${scorecard.grade} (${scorecard.score}%). Findings: ${scorecard.findings.length}. Weakest pillar: ${weakest}.`,
     importance: scorecard.grade.startsWith('F') ? 10 : scorecard.grade.startsWith('D') ? 8 : 5,
   });
   ```

8. **End with:**
   > Compliance grade calculated per FDL No. 10/2025 Art. 20-22 and FATF Recommendation 18. For review by the MLRO.
