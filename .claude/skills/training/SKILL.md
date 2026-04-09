# /training — Staff Training Compliance Check

Check staff AML/CFT training compliance and identify gaps.

## Usage
- `/training status` — Overall training compliance report
- `/training gaps` — Show who needs what training
- `/training matrix` — Full staff x courses cross-reference

## Procedure

1. Import `TrainingTracker` from `screening/lib/training-tracker.mjs`
2. Initialize with register path `.screening/training-register.json`
3. Based on command:
   - **status**: Call `statistics()` and `generateReport()` for overall compliance rate
   - **gaps**: Call `gapAnalysis()` to identify overdue and pending training per staff member
   - **matrix**: Call `trainingMatrix()` for full cross-reference
4. Flag all overdue training prominently
5. Show regulatory basis for each training requirement (FDL Art.21)
6. Calculate days until next deadline for each staff member

## Output Format
- Summary: total staff, compliant count, compliance rate
- Gap list: staff name, role, missing training, due date, regulation
- Training matrix table (if requested)
- Recommendations for immediate action
- End with "For review by the MLRO."
