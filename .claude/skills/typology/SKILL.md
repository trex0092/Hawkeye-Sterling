# /typology — ML/TF Typology Screening

Screen a transaction or entity context against all FATF precious metals typologies.

## Usage
`/typology <context_description>`

## Procedure

1. Import `screenTypologies`, `getTypologyDefinitions` from `screening/analysis/typology-engine.mjs`
2. Parse the user's description into a typology context object with relevant fields
3. Run `screenTypologies(context)` against all 6 built-in typologies:
   - TBML-001: Trade-Based ML via Gold
   - TBML-002: Carousel Trading in Precious Stones
   - TF-001: Terrorist Financing via Cash-Intensive Gold Trade
   - PF-001: Proliferation Financing via Precious Metals
   - ML-001: Layered Cash Conversion
   - ML-002: Gold-for-Drugs Exchange
4. Present each match with: typology name, confidence, severity, triggered indicators, regulation
5. Show recommended actions per match
6. Record observation via `claude-mem/index.mjs` with category `risk_assessment`

## Output Format
- Matches sorted by confidence (highest first)
- Per-match: indicator breakdown showing which fired and which didn't
- Summary: typologies checked, matches found, critical count
- End with "For review by the MLRO."
