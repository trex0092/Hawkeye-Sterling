# Open Banking Tracker dataset — attribution + license notice

The three JSON files in this directory (`providers.json`, `aggregators.json`,
`third-party-providers.json`) are derived from the
[Open Banking Tracker Data](https://github.com/not-a-bank/open-banking-tracker-data)
repository maintained by the **not-a-bank** organisation.

The original dataset is published under
**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0)**.

## What we vendored

- **57,231** account-providers (banks + financial institutions). Original ~57k
  per-record JSON files were consolidated into a single `providers.json` with
  only the AML-relevant fields retained: id, name, legalName, countryHQ,
  countries, BIC, websiteUrl, verified, stateOwned, status, bankType,
  compliance[], apiAggregators[], ownership[], ipoStatus, stockSymbol.
- **70** API aggregators (Open Banking fintechs), normalized to id, name,
  websiteUrl, countryHQ, marketCoverage, countries, verified,
  bankConnectionsCount, compliance[].
- **3** third-party providers, same shape as account-providers.

Cosmetic fields (icons, app store URLs, partnerships, financial reports,
mobile-app metadata, debit/credit card details, etc.) were dropped to keep
bundle size manageable for serverless Functions (~11 MB total vs. ~280 MB
of raw per-record files).

## How to refresh

Run `scripts/refresh-open-banking.cjs` to re-pull and re-consolidate from
upstream. The script clones the repo, runs the same field-extraction pass,
and overwrites the three JSON files in this directory.

## Commercial use disclaimer

CC BY-NC-SA 4.0 prohibits commercial use without a separate license from
the maintainers. If Hawkeye Sterling is used commercially, contact the
not-a-bank maintainers for a commercial license:
<https://github.com/not-a-bank/open-banking-tracker-data>

This NOTICE file satisfies the **BY** (attribution) clause. The **SA**
(ShareAlike) clause means downstream consumers of this directory's contents
must release their derived work under the same license — but the rest of
the Hawkeye Sterling repo is not affected; only this `web/lib/data/open-banking/`
subtree carries the upstream license.
