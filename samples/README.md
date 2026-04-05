# Compliance automation sample outputs

This folder contains fully worked example outputs of every artefact the
[Reporting Entity] compliance automation will produce. The files live in
the repository so the Money Laundering Reporting Officer,
and any reviewer can see the exact format, tone and structure of each
report before the automation runs against live Asana data.

## Important notice

Every name, identification number, transaction value, counterparty and
fact pattern in this folder is **fictitious**. These files are format
references only. Nothing in this folder has been filed with the Financial
Intelligence Unit, nothing has been presented to the Ministry of Economy,
and nothing constitutes a real customer record. No part of this folder
should ever be circulated to a regulator as evidence of an actual
compliance event. That would be a serious integrity failure.

The regulatory citations in the samples are limited to what the MLRO has
explicitly confirmed. Everything else is written in generic phrasing. No
article numbers are invented.

## Downloading a file

Click any file in the GitHub web interface and use the "Raw" button to
get the plain text, or use the "Download" option in the file view. If you
prefer a local copy of the whole folder, clone the repository and the
files will appear in `samples/`.

## Folder layout

```
samples/
  README.md                                    this file
  daily/
    01-compliance-priorities-per-entity.txt    sample of item 14, per-project top 10 with risk scoring
    02-portfolio-digest.txt                    sample of item 15, cross-entity top 5 for senior read
    03-investigation-note.txt                  sample of item 16, MLRO prep note for a single top task
    04-completion-retro.txt                    sample of item 17, end-of-day hit-rate review
    05-sanctions-screening-log.txt             sample of item 18, daily UNSC and Local List screening log
    06-pep-watch-log.txt                       sample of item 19, daily PEP customer tracker
  weekly/
    01-pattern-report.txt                      sample of item 22, internal analytical weekly
    02-mlro-report-to-senior-management.txt    sample of item 6, formal weekly from MLRO to Senior Management
  monthly/
    01-mlro-consolidation.txt                  sample of item 7, monthly MLRO consolidation for the Board
  annual/
    01-enterprise-wide-risk-assessment.txt     sample of item 10, annual risk assessment draft
    02-training-completion-report.txt          sample of item 12, annual training report
  filings/
    01-str-candidate-review.txt                sample of item 1, STR draft
    02-sar-candidate-review.txt                sample of item 2, SAR draft
    03-dpmsr-candidate-review.txt              sample of item 3, DPMSR draft
    04-pnmr-candidate-review.txt               sample of item 4, PNMR draft
    05-ffr-candidate-review.txt                sample of item 5, FFR draft
  registers/
    counterparties.csv                         sample of item 37, cross-entity counterparty register
  on-demand/
    01-dnfbp-self-assessment-questionnaire.txt sample of item 11, MOE SAQ draft
    02-board-meeting-aml-pack.txt              sample of item 38, board pack extract
    03-inspection-evidence-bundle-manifest.txt sample of item 36, on-demand inspection bundle index
```

## Legal framing used across the samples

All samples cite only the following, verbatim, as instructed by the MLRO:

- Primary AML/CFT statute: Federal Decree-Law No. 10 of 2025 on Anti-Money
  Laundering and Countering the Financing of Terrorism and Financing of
  Illegal Organisations.
- Supervisory authority for DNFBPs: the Ministry of Economy.
- Targeted financial sanctions framework: UN Security Council Consolidated
  List and the UAE Local Terrorist List, administered by the Executive
  Office for Control and Non-Proliferation.
- Reporting channel: the Financial Intelligence Unit through the goAML
  platform for Suspicious Transaction Reports, Suspicious Activity Reports,
  Dealers in Precious Metals and Stones Reports, Partial Name Match
  Reports and Funds Freeze Reports.
- Record retention obligation: 10 years minimum for customer due diligence
  records, transaction records, sanctions screening logs, training records,
  reporting files and supporting evidence.

Federal Decree-Law No. 20 of 2018 is not cited anywhere. It is not in
force for the purposes of this programme.
