# Troubleshooting

## Common issues

### "ASANA_TOKEN is not set" or "ANTHROPIC_API_KEY is not set"

The script requires environment variables to be set. For local execution:

```bash
export ASANA_TOKEN=1/...
export ANTHROPIC_API_KEY=sk-ant-...
export ASANA_WORKSPACE_ID=...
```

For GitHub Actions, these must be configured as repository secrets.

### "No history/ folder found"

The inspection-bundle script expects prior automation runs to have
populated the history/ directory. Run the daily and weekly scripts at
least once before preparing an inspection bundle.

### Claude validation fails ("validateOutput rejected the response")

The `validateOutput()` function in regulatory-context.mjs rejects
output that contains forbidden phrases or references. Common causes:

- Output cites "Federal Decree-Law No. 20 of 2018" (forbidden)
- Output contains invented article numbers
- Output uses AI-tell language ("as an AI", "I hope this helps")
- Output contains em-dashes or markdown hash headings

The script will retry up to 3 times. If all retries fail, a warning is
logged and the artefact is still archived with a validation warning header.

### "TARGET_YEAR is empty" or NaN values in annual reports

Annual scripts require `TARGET_YEAR` to be set. If not provided, the
script defaults to the current year. Ensure the workflow passes this
variable or set it explicitly:

```bash
export TARGET_YEAR=2025
node annual-risk-assessment.mjs
```

### Asana post truncated at 60K characters

Asana has a comment length limit. When a document exceeds 60,000
characters, it is truncated for the Asana comment but the full version
is archived under history/. Check the archive for the complete document.

### DPMSR drafts not being generated

Filing mode is set to `manual` by default. The automation only generates
drafts when the MLRO adds the `hsv2:draft-now` tag to the task in Asana.
To change this behaviour, edit `scripts/filing-mode.json`.

### Git push fails in workflow ("git push origin main" error)

This was fixed in PR #3. Workflows now use
`${GITHUB_REF#refs/heads/}` for dynamic branch reference. If you see
hardcoded `git push origin main`, the workflow needs updating.

### Screening engine returns no results

Check that the sanctions list sources are reachable. Run:

```bash
cd screening
node test/smoke.mjs
```

If sources are unavailable, the screening engine uses cached data from
the last successful refresh.

## Log locations

- **GitHub Actions logs:** Available in the Actions tab of the repository
- **Local execution:** Standard output and standard error in the terminal
- **Archive integrity:** Run `node scripts/hash-manifest.mjs` to verify
- **Screening audit trail:** `screening/data/audit.jsonl` (append-only)

## Getting help

All questions go to the Money Laundering Reporting Officer.
