# Ten-year compliance evidence archive

This folder is the ten-year retention archive of the compliance automation
for [Reporting Entity], a UAE-licensed Dealer in Precious Metals and Stones
and Designated Non-Financial Business and Profession.

The retention obligation is set by the applicable provision of Federal
Decree-Law No. 10 of 2025 on Anti-Money Laundering and Countering the
Financing of Terrorism and Financing of Illegal Organisations. The Ministry
of Economy is the supervisory authority for the firm in its capacity as a
DNFBP. The Money Laundering Reporting Officer, is
responsible for every file below.

## What lives here

```
history/
├── daily/
│   └── YYYY-MM-DD/
│       ├── per-project/
│       │   └── <programme-slug>.txt        Daily compliance priorities per entity
│       ├── portfolio-digest.txt             Daily cross-entity portfolio digest
│       └── investigation-notes/
│           └── <slug>.txt                    Daily investigation preparation notes
├── retro/
│   └── YYYY-MM-DD.txt                       Daily completion retro at 17:00
├── weekly/
│   └── YYYY-Www.txt                         Weekly pattern report (Fridays 16:00)
├── mlro-weekly/
│   └── YYYY-Www.txt                         Weekly MLRO Report to Senior Management
├── filings/
│   └── YYYY-MM-DD/
│       └── HSV2-<TYPE>-YYYYMMDD-NNNN.txt    goAML filing candidate reviews
│                                            (STR, SAR, DPMSR, PNMR, FFR)
├── registers/
│   └── counterparties.csv                   Cross-entity counterparty register
└── inspections/
    └── YYYY-MM-DD/
        └── manifest.txt                     On-demand inspection evidence bundle manifest
```

## Integrity rules

1. **Nothing is ever pruned.** Files in this folder are append-only. The
   ten-year retention requirement is satisfied by the git history of this
   repository.

2. **Nothing is edited after creation, except by the MLRO.** The only file
   in this folder that the MLRO may edit manually is
   `registers/counterparties.csv`, which she uses to maintain counterparty
   status, risk rating, alias mappings and her own notes. Every other file
   is written once by the automation and is never modified.

3. **Every file is plain text.** Artefacts are UTF-8 text files so they diff
   cleanly in git, are readable by any inspector without special tooling,
   and are suitable for immediate presentation during a supervisory visit
   by the Ministry of Economy, the Executive Office for Control and
   Non-Proliferation or the Financial Intelligence Unit.

4. **Git history is the audit trail.** Every change to this folder is
   visible in `git log history/` with timestamp and author. The automation
   commits under the identity `hawkeye-sterling-automation`. Human edits
   commit under the committer's GitHub identity. The combination gives a
   complete attributable record.

5. **Filings are drafts, never final.** Files under `filings/` are draft
   candidate reviews produced for the MLRO's personal consideration. No
   file in this folder has ever been submitted to the goAML platform by
   the automation. The MLRO files every report manually.

6. **Samples are not evidence.** The folder `samples/` at the top of the
   repository contains format references with fictitious data. Nothing
   under `samples/` is evidence and nothing under `samples/` should ever
   be produced to a regulator as a real filing or a real customer record.
   Files under `history/` are real evidence.

## How to use during an inspection

If an inspector from the Ministry of Economy, the Executive Office for
Control and Non-Proliferation or the Financial Intelligence Unit arrives
on site, the MLRO should:

1. Run the on-demand Inspection Evidence Bundle workflow from the
   Actions tab, choosing a window that matches the inspection scope.
2. Open the generated `history/inspections/<date>/manifest.txt` and hand
   the inspector the relative paths the manifest lists.
3. Produce the files one by one from the repository's web interface,
   using the GitHub **Raw** button to download plain text, or by cloning
   the repository to a laptop prepared for the visit.
4. Refer the inspector to the most recent Weekly MLRO Report to Senior
   Management first, then to the annual enterprise-wide risk assessment,
   and then to any file of interest the inspector names.

## Backup and disaster recovery

The canonical copy of this archive lives in the GitHub repository. The
repository is mirrored by GitHub's standard backup mechanisms and any
commit is retrievable for the full ten-year retention window. The MLRO
may additionally export the archive to an encrypted portable storage
device at any time by cloning the repository.

If the repository is lost, the last cloned copy held by the MLRO is the
recovery point. The MLRO should hold at least one such copy off the
company network.

## Contact

All questions about this folder are directed to the Money Laundering
Reporting Officer, the MLRO.
