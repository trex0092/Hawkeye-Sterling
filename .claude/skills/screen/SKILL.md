# Sanctions/PEP Screening

Screen an entity against all sanctions, PEP, and adverse media sources.

**Trigger:** `/screen <name>`

## Procedure

1. **Import and initialise the screening module.**
   ```js
   import * as Screening from '/home/user/Hawkeye-Sterling/screening/index.js';
   await Screening.init();
   ```

2. **Run the screen.** Build a query object from the provided name and call `Screening.screen()`.
   ```js
   const result = await Screening.screen({ name: '<name>', includeAdverseMedia: true });
   ```

3. **Format and display the result.** Present these fields clearly:
   - **Decision** (`result.decision`): `clear`, `review`, or `block`
   - **Top Band** (`result.topBand`): `reject`, `low`, `medium`, `high`, or `exact`
   - **Case ID** (`result.caseId`)
   - **Top Matches** (`result.hits`): For each hit show `matchedName`, `score`, `band`, `source`, `programs`, and `countries`
   - **Adverse Media** (`result.adverseMedia`): For each article show `title`, `domain`, `tone`

4. **Record the screening result in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'screening_result',
     content: `Screened "${name}": decision=${result.decision}, band=${result.topBand}, hits=${result.hits.length}`,
     entityName: name,
     importance: result.decision === 'block' ? 10 : result.decision === 'review' ? 7 : 3,
   });
   ```

5. **Provide a recommendation based on the band.**
   - `clear` / no hits: "No matches found. Entity may proceed with standard onboarding."
   - `low` / `medium`: "Potential matches require analyst review before onboarding. Recommend Enhanced Due Diligence."
   - `high` / `exact`: "Strong match detected. Entity MUST NOT be onboarded until MLRO review is complete. Escalate immediately."

6. **Compliance note.** Always end output with:
   > Screening performed against all enabled sources. Result archived in audit chain. For review by the MLRO.
