# Jurisdiction Intelligence Briefing

Generate a comprehensive intelligence briefing for a jurisdiction using World Monitor data.

**Trigger:** `/intel-brief <country_code>`

## Procedure

1. **Import the World Monitor deep intelligence module.**
   ```js
   import {
     fullBriefing,
     calculateCII,
     detectEarlyWarnings,
     trackSanctionsVelocity,
   } from '/home/user/Hawkeye-Sterling/screening/sources/worldmonitor-deep.mjs';
   ```

2. **Fetch full intelligence briefing** for the given ISO 2-letter country code.
   ```js
   const briefing = await fullBriefing('<country_code>', { hours: 72, limit: 50 });
   ```

3. **Display the Country Intelligence Index (CII).** From the briefing or via `calculateCII()`, show:
   - **Overall CII score** (0-100, higher = more risk)
   - **Risk tier**: Low (0-25), Moderate (26-50), High (51-75), Critical (76-100)
   - **Dimension scores**: FATF status, sanctions activity, political stability, financial crime, regulatory quality, precious metals risk, media sentiment, and others
   - Present each dimension with its score, weight, and event count

4. **Show early warnings** from `detectEarlyWarnings()`. For each warning display:
   - Warning type (coup signal, sanctions pre-announcement, regime instability, etc.)
   - Severity level
   - Supporting intelligence events
   - Recommended compliance action

5. **Show sanctions velocity** from `trackSanctionsVelocity()`. Present:
   - Designation rate (new sanctions per period)
   - Trend direction (accelerating, stable, decelerating)
   - Predicted FATF greylist risk if applicable

6. **Record in memory.**
   ```js
   import mem from '/home/user/Hawkeye-Sterling/claude-mem/index.mjs';
   mem.observe({
     category: 'regulatory_observation',
     content: `Intel briefing for ${countryCode}: CII=${ciiScore}, early warnings=${warningCount}, sanctions velocity=${velocity}`,
     importance: ciiScore >= 75 ? 9 : ciiScore >= 50 ? 7 : 4,
   });
   ```

7. **Provide a recommendation** based on the CII score:
   - **0-25**: "Low risk jurisdiction. Standard monitoring sufficient."
   - **26-50**: "Moderate risk. Monitor intelligence feeds weekly. Review counterparty exposure."
   - **51-75**: "High risk jurisdiction. Recommend EDD for all counterparties in this jurisdiction. Brief MLRO."
   - **76-100**: "Critical risk. Recommend suspending new onboarding for this jurisdiction pending MLRO review."

8. **End with:**
   > Intelligence sourced from World Monitor / GDELT. Assessment per FATF Recommendation 1. For review by the MLRO.
