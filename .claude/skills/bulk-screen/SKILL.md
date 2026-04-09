# Bulk Screening from CSV

Screen multiple entities from a CSV file in a single batch operation.

**Trigger:** `/bulk-screen <path_to_csv>`

## Procedure

1. **Import the bulk onboarding and screening modules.**
   ```js
   import { parseCSV, bulkScreen } from '/home/user/Hawkeye-Sterling/screening/lib/bulk-onboard.mjs';
   import { readFile } from 'node:fs/promises';
   ```

2. **Read and parse the CSV file.** The CSV should have at minimum a `name` column. Optional columns: `country`, `type`, `dob`, `id_number`, `annual_volume`, `product_type`.
   ```js
   const csvString = await readFile('<path_to_csv>', 'utf8');
   const entities = parseCSV(csvString);
   ```
   Report how many entities were parsed from the file.

3. **Run bulk screening** against all sanctions, PEP, and adverse media sources.
   ```js
   const results = await bulkScreen(entities, {
     projectRoot: '/home/user/Hawkeye-Sterling',
     includeRiskScore: true,
     onProgress: (idx, total, entity) => {
       // Report progress at 25%, 50%, 75%, 100%
     },
   });
   ```

4. **Display the summary.** Show aggregate counts:
   - **Total entities**: number parsed from CSV
   - **Approved** (clear): count and percentage
   - **EDD Required** (review): count and percentage
   - **Rejected** (block): count and percentage

5. **List blocked entities.** For each entity with a `block` decision, show:
   - Entity name
   - Matched sanctions list or PEP source
   - Top match score and band
   - Reason for block

6. **List entities requiring EDD.** For each entity with a `review` decision, show:
   - Entity name
   - Match band and score
   - Recommended next steps

7. **Generate the onboarding report.** Summarize the results in a structured format suitable for the compliance register. Include:
   - Date of screening
   - Source data file path
   - Total screened, pass/fail/review breakdown
   - List of all blocked entity names

8. **Record in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'screening_result',
     content: `Bulk screening of ${entities.length} entities from ${path}: ${approved} approved, ${edd} EDD required, ${rejected} rejected`,
     importance: rejected > 0 ? 9 : 5,
   });
   ```

9. **End with:**
   > Bulk screening complete. All results archived in audit chain. Blocked entities must NOT be onboarded. EDD entities require enhanced review. For review by the MLRO.
