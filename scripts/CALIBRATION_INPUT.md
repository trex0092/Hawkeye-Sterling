# Corroboration Calibration — Input Format

The script `scripts/calibrate-corroboration.mjs` consumes a JSON array
of historical dispositioned cases and recommends a quality-weight lift
coefficient for `FusionResult.corroboration` → `qualities` map uplift.

## Where to source the input data

You have three options depending on where your case audit trail lives:

### Option A — Netlify Blobs `audit/entry/*.json`

If you've been signing dispositions through `/api/audit/sign`, every
disposition is a chained Blob entry. Export with:

```bash
# 1. List all audit entries
curl https://hawkeye-sterling.netlify.app/api/audit?limit=5000 \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  > audit-export.json

# 2. Filter to dispositions (action in 'clear', 'escalate', 'str', 'freeze', 'dispose')
node -e "
const all = JSON.parse(require('fs').readFileSync('audit-export.json','utf8'));
const dispositions = all.entries.filter(e => ['clear','escalate','str','freeze','dispose'].includes(e.action));
require('fs').writeFileSync('dispositions.json', JSON.stringify(dispositions, null, 2));
console.log('Wrote', dispositions.length, 'dispositions');
"
```

Then transform `dispositions.json` into the `CalibrationCase[]` shape (below).

### Option B — Outcome-feedback journal Blob snapshots

If you've enabled the OutcomeFeedbackJournal (`feedback-journal-blobs.ts`),
every MLRO outcome is in `journal/outcome-records-*.json` Blobs. Same
Blobs API export pattern as Option A, then transform.

### Option C — Hand-curated CSV → JSON

If you don't have the audit chain yet but have ~50 cases in a spreadsheet,
export to CSV with these columns and convert to JSON:

| caseId | subjectName | evidenceCount | independentSources | evidenceKinds | autoVerdictWithoutCorroboration | mlroFinalVerdict | outcomeStatus |
|---|---|---|---|---|---|---|---|

## Required input shape

A JSON array of objects matching this TypeScript interface:

```typescript
interface CalibrationCase {
  /** Your internal case ID — used for traceability in the report. */
  caseId: string;

  /** Subject name (or hash if you don't want to expose names in calibration logs). */
  subjectName: string;

  /** Total evidence items cited by all findings on this case. */
  evidenceCount: number;

  /** Distinct publishers across the evidence. E.g. if 4 evidence items are
   *  3 from Reuters + 1 from Bloomberg, independentSources = 2. */
  independentSources: number;

  /** Evidence kinds list. Same vocabulary as src/brain/evidence.ts:
   *  'sanctions_list' | 'court_filing' | 'regulatory_filing' | 'news_article'
   *  | 'corporate_registry' | 'training_data' | 'analyst_note' | etc.
   *  Used to apply the training-data penalty per Charter P8. */
  evidenceKinds: string[];

  /** What the brain returned at auto-disposition time, BEFORE any
   *  corroboration uplift would have been applied. If you don't track
   *  this distinctly, use the brain's actual auto-verdict (it currently
   *  has no corroboration uplift, so they're equivalent). */
  autoVerdictWithoutCorroboration: 'clear' | 'flag' | 'escalate' | 'block';

  /** What the MLRO actually decided after review. Ground truth. */
  mlroFinalVerdict: 'clear' | 'flag' | 'escalate' | 'block';

  /** Optional: was the auto-verdict 'confirmed' (MLRO agreed),
   *  'overridden' (MLRO changed it but case stayed open), or
   *  'reversed' (MLRO downgraded a hard verdict). */
  outcomeStatus?: 'confirmed' | 'overridden' | 'reversed';

  /** Optional: brain's confidence at auto-disposition (0..1). Used by
   *  the calibration ledger but not strictly required for lift sweep. */
  autoConfidence?: number;
}
```

## Minimum sample size

| Cases | Calibration quality |
|---|---|
| < 50 | ⚠️ Unreliable — script will warn |
| 50-100 | OK for an initial coefficient; revisit after 6 months |
| 100-500 | Good — coefficient should be stable |
| 500+ | Excellent — bootstrap CI will be tight |

## Running the script

```bash
node scripts/calibrate-corroboration.mjs path/to/cases.json
```

Outputs a JSON report with:
- per-corroboration-band agreement rates (B0 thin → B4 very strong)
- lift sweep across coefficients 0.00 → 0.30 in steps of 0.02
- recommended lift coefficient + rationale
- safety notes

## After you have a recommendation

Reply to Claude with the recommended lift number (e.g. `"calibrate to 0.18"`)
and Claude will write the follow-up PR that wires the coefficient into the
qualities map in `src/brain/fusion.ts`. That PR will be marked
"⚠️ NEEDS LOCAL TEST" because it changes verdict math — run
`npm run typecheck && npm run test && npm run brain:audit` before merging.
