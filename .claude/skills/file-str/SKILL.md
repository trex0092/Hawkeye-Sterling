# STR Filing Workflow

Create a Suspicious Transaction Report draft and advance it through the MLRO approval workflow.

**Trigger:** `/file-str <subject> <narrative>`

## Procedure

1. **Import the MLRO workflow and goAML generator.**
   ```js
   import { FilingWorkflow } from '/home/user/Hawkeye-Sterling/screening/lib/mlro-workflow.mjs';
   import { generateGoAMLXml } from '/home/user/Hawkeye-Sterling/screening/export/goaml-xml.mjs';
   ```

2. **Initialise the filing workflow.**
   ```js
   const workflow = new FilingWorkflow('/home/user/Hawkeye-Sterling/history/filings/register.json');
   await workflow.load();
   ```

3. **Create the filing draft.** Use the provided subject and narrative.
   ```js
   const filing = await workflow.create({
     type: 'STR',
     subjectName: '<subject>',
     narrative: '<narrative>',
     createdBy: 'compliance-analyst',
     triggerDate: new Date().toISOString().split('T')[0],
   });
   ```

4. **Generate goAML XML draft.**
   ```js
   const xml = generateGoAMLXml({
     type: 'STR',
     subjectName: '<subject>',
     subjectType: 'person',
     narrative: '<narrative>',
     reporterName: 'DPMS Entity',
     mlroName: 'MLRO',
   });
   ```

5. **Display the filing status.** Show:
   - **Filing ID**: `filing.id`
   - **State**: `filing.state` (starts as `draft`)
   - **Subject**: `filing.subjectName`
   - **Deadline**: `filing.deadline` (15 business days from trigger)
   - **State machine**: DRAFT -> ANALYST_REVIEW -> MLRO_REVIEW -> APPROVED -> FILED
   - **goAML XML**: Show the generated XML (first 30 lines or summary)

6. **Record in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'filing_activity',
     content: `STR draft created: ${filing.id} for subject "${filing.subjectName}". State: ${filing.state}. Deadline: ${filing.deadline}`,
     entityName: filing.subjectName,
     importance: 9,
   });
   ```

7. **Tipping-off prohibition warning.** Always display prominently:
   > WARNING: Federal Decree-Law No. 10/2025 Art. 17 prohibits tipping off. Do NOT disclose the existence of this STR to the subject or any third party. Violation is a criminal offence.

8. **End with:**
   > Filing created in DRAFT state. Must progress through ANALYST_REVIEW and MLRO_REVIEW before submission to the FIU via goAML. For review by the MLRO.
