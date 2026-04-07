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
    07-ops-logs.txt                            daily operational logs: sanctions, PEP, cash, high-risk counterparty
    08-entity-report.txt                       daily per-entity compliance report with analytical commentary
  weekly/
    01-pattern-report.txt                      sample of item 22, internal analytical weekly
    02-mlro-report-to-senior-management.txt    sample of item 6, formal weekly from MLRO to Senior Management
    03-filings-summary.txt                     weekly goAML filing drafts summary for MLRO review
    04-ops-logs.txt                            weekly training summary, dormant file reminder, escalation log
  monthly/
    01-mlro-consolidation.txt                  sample of item 7, monthly MLRO consolidation for the Board
    02-incident-log.txt                        monthly incident log: refused transactions, declines, exceptions
    03-ops-logs.txt                            monthly CDD refresh reminder and EDD case tracker
  quarterly/
    01-mlro-report.txt                         quarterly MLRO report to Senior Management and the Board
    02-jurisdiction-heatmap.txt                quarterly jurisdiction exposure heatmap from counterparty register
    03-ops-logs.txt                            quarterly typology library update and beneficial ownership clarity
  annual/
    01-enterprise-wide-risk-assessment.txt     sample of item 10, annual risk assessment draft
    02-training-completion-report.txt          sample of item 12, annual training report
    03-mlro-report.txt                         annual MLRO report to Senior Management and the Board
    04-programme-effectiveness.txt             annual five-pillar programme effectiveness self-assessment
    05-customer-exit-report.txt                annual customer exit and escalation report
  filings/
    01-str-candidate-review.txt                sample of item 1, STR draft
    02-sar-candidate-review.txt                sample of item 2, SAR draft
    03-dpmsr-candidate-review.txt              sample of item 3, DPMSR draft
    04-pnmr-candidate-review.txt               sample of item 4, PNMR draft
    05-ffr-candidate-review.txt                sample of item 5, FFR draft
  registers/
    counterparties.csv                         sample of item 37, cross-entity counterparty register
    transaction-monitoring-report.txt          daily transaction monitoring alerts and flagged transactions
    adverse-media-report.txt                   daily adverse media monitoring for counterparties
    cdd-refresh-tracker.txt                    CDD refresh status tracker with overdue/critical/warning buckets
    deadline-calendar.txt                      regulatory and internal compliance deadline calendar
    regulatory-watcher.txt                     regulatory web page change detection report
    hash-manifest-report.txt                   archive integrity manifest with SHA256 fingerprinting
    str-quality-score.txt                      STR draft quality assessment against 12-point rubric
    task-pack.txt                              per-task compliance pack with 9-section structured review
    screening-result.txt                       unified sanctions and PEP screening result with audit chain
    dashboard-sample.html                      single-page HTML compliance dashboard (traffic-light format)
  on-demand/
    01-dnfbp-self-assessment-questionnaire.txt sample of item 11, MOE SAQ draft
    02-board-meeting-aml-pack.txt              sample of item 38, board pack extract
    03-inspection-evidence-bundle-manifest.txt sample of item 36, on-demand inspection bundle index
    04-customer-file-summary.txt               single-customer one-page file summary for MLRO review
    05-mlro-handover-report.txt                MLRO handover continuity snapshot for role transition
    06-trend-export.csv                        historical trend export CSV for external charting
  policies/
    01-aml-cft-policy.txt                      master AML/CFT policy document
    02-responsible-sourcing-policy.txt          responsible sourcing policy (LBMA RGG/OECD)
    03-cdd-procedures-manual.txt               CDD/EDD/SDD procedures manual
  training/
    01-aml-cft-legal-framework.txt             evaluation: UAE legal framework, law transition, FATF alignment
    02-customer-due-diligence.txt              evaluation: CDD, EDD, counterparty register, customer exits
    03-sanctions-screening.txt                 evaluation: sanctions, PEP, EOCN, adverse media, filing obligations
    04-transaction-monitoring-and-reporting.txt evaluation: transaction rules, STR/SAR, DPMSR, filing quality
    05-daily-compliance-operations.txt         evaluation: daily priorities, ops logs, retro, entity reports
    06-weekly-reporting.txt                    evaluation: pattern analysis, MLRO report, filings summary, ops logs
    07-monthly-quarterly-mlro-reporting.txt    evaluation: monthly/quarterly MLRO reports, incidents, heatmap
    08-annual-compliance-review.txt            evaluation: annual MLRO report, risk assessment, effectiveness
    09-on-demand-compliance-functions.txt      evaluation: inspection bundle, board pack, SAQ, handover
    10-record-keeping-and-archive-integrity.txt evaluation: retention, hash manifest, dashboard, regulatory watcher
    11-automated-task-creation.txt             evaluation: automated alert-to-task conversion, priority management
    12-comment-cleanup-and-data-hygiene.txt    evaluation: comment cleanup, record-keeping, archive vs display
  registers/
    ...
    auto-create-tasks-log.txt                  automated task creation log from daily monitoring alerts
    cleanup-old-comments-log.txt               comment cleanup log with archive confirmation
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
- International standards: the Financial Action Task Force (FATF), in
  particular Recommendation 22 (DNFBPs: customer due diligence),
  Recommendation 23 (DNFBPs: other measures), Recommendation 28
  (regulation and supervision of DNFBPs), Recommendation 20 (suspicious
  transaction reporting), and Recommendation 11 (record-keeping). The firm
  monitors the FATF list of jurisdictions under increased monitoring and
  the FATF list of high-risk jurisdictions subject to a call for action.

Federal Decree-Law No. 20 of 2018 is not cited anywhere. It is not in
force for the purposes of this programme.
