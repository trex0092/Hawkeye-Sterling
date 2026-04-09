# /export-evidence — Generate Regulator Evidence Pack

Generate an inspection-ready evidence bundle for supervisory review.

## Usage
- `/export-evidence inspection` — Supervisory inspection pack
- `/export-evidence annual` — Annual review pack
- `/export-evidence incident <entity>` — Incident response pack
- `/export-evidence exit <entity>` — Customer exit pack

## Procedure

1. Import evidence pack functions from `screening/export/evidence-pack.mjs`
2. Based on pack type, use the appropriate factory function
3. Compile sections from:
   - Screening results (history/registers/sanctions-screening/)
   - Filing history (history/filings/)
   - Audit trail excerpts (screening audit log)
   - Risk assessments (history/annual/)
   - Training records
   - Policy documents (samples/policies/)
4. Generate table of contents
5. Calculate SHA256 hash manifest for integrity verification
6. Check pack completeness against required sections
7. Output the pack as plain text

## Output Format
- Table of contents
- Metadata block (entity, MLRO, date, pack type)
- Each section with header and content
- Summary statistics
- File manifest with SHA256 hashes
- End with "For review by the MLRO."
