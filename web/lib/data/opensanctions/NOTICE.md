# OpenSanctions consolidated dataset — attribution + license notice

The `sanctions.json` file in this directory is derived from the
[OpenSanctions](https://www.opensanctions.org) `sanctions/targets.simple.csv`
bulk export (~63 MB raw → ~47 MB after AML-relevant pruning).

OpenSanctions is published under
**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.
Same license posture as the Open Banking Tracker dataset already vendored
in this repo (`web/lib/data/open-banking/`).

## What we vendored

Snapshot taken: see `lastChange` field on each record (most recent dataset
update from upstream as of vendor time).

**67,213** sanctioned entities consolidated across ~200 sanctions sources
including UN, US OFAC SDN/CSL, EU consolidated, UK HM Treasury OFSI,
Canada OSFI/SEMA, Australia DFAT, Switzerland SECO, Japan METI, UAE EOCN,
plus dozens of other national sanctions regimes. Breakdown by entity type:

- **36,346** Persons
- **15,608** Organizations
- **1,862** Vessels
- **13,397** other (Securities, Companies-extended, Trusts, etc.)

Per-record fields retained: `id`, `schema`, `name`, `aliases[]`,
`birthDate`, `countries[]` (ISO-2), `identifiers[]` (passport / company
registration / vessel IMO), `sanctions[]` (program description),
`programIds[]` (e.g. `US-GLOMAG`, `EU-FSF-RUS`), `datasets[]` (originating
sources), `lastChange`.

Cosmetic / privacy-sensitive fields dropped: full address strings, phone
numbers, email addresses, `first_seen`, `last_seen`. Names and aliases
are preserved verbatim — they're the matching primitives.

## How to refresh

The vendored snapshot can be re-pulled at any time via:

```bash
curl -o /tmp/os.csv https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv
node scripts/refresh-opensanctions.cjs
```

OpenSanctions typically refreshes the bulk file daily.

## Commercial use disclaimer

CC BY-NC 4.0 prohibits commercial use without a separate license from
OpenSanctions. Hawkeye Sterling is a commercial AML/CFT product —
operator should obtain a commercial license before live regulatory use.
Quote / contact: <https://www.opensanctions.org/licensing/>

This NOTICE file satisfies the **BY** (attribution) clause. Only the
contents of `web/lib/data/opensanctions/` carry the upstream license;
the rest of the Hawkeye Sterling repo is unaffected.

## Coverage relative to the original audit gaps

The 2026-05-15 audit flagged Canada OSFI and Australia DFAT as missing
sanctions adapters. Both are included in OpenSanctions' aggregation, so
once an operator wires this dataset into the screening pipeline, those
gaps close automatically.
