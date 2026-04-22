# Hawkeye Sterling — Web (v5)

Next.js 14 + TypeScript + Tailwind front-end for the Hawkeye Sterling AML/CFT platform.

## Getting started

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 — root redirects to `/screening` (Module 01).

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — Next.js lint

## Status

| # | Module | Route | State |
|---|--------|-------|-------|
| 01 | Subject Screening | `/screening` | ✔ implemented |
| 02 | Cases & Evidence Trail | `/cases` | pending |
| 03 | Deep Reasoning Workbench | `/workbench` | pending |
| 04 | Sanction Delta Monitor | `/sanctions-delta` | pending |
| 05 | Smurfing Detector | `/smurfing` | pending |
| 06 | KRI Registry | `/kri-registry` | pending |
| 07 | Calibration Ledger | `/calibration` | pending |
| 08 | Peer Benchmark | `/peer-benchmark` | pending |
| 09 | Sector Rubric Picker | `/rubric-picker` | pending |
| 10 | Playbook Viewer | `/playbook` | pending |
| 11 | Audit Trail & Export | `/audit-trail` | pending |

## Architecture

- **Design tokens** live in `app/globals.css` as CSS custom properties and are re-exported through Tailwind via `tailwind.config.ts` (`bg-brand`, `text-ink-0`, `font-display`, etc.).
- **Layout components** (`components/layout/*`): `Header`, `Sidebar` — shared across modules.
- **Module components** (`components/screening/*`): `ScreeningHero`, `ScreeningToolbar`, `ScreeningTable`, `SubjectDetailPanel`.
- **Mock data** in `lib/data/` — swap for real API calls when the engine exposes HTTP endpoints.
- **Types** in `lib/types.ts`.

## Notes

- Module 01 implements filter queue, debounced search (via `useDeferredValue`), row selection → detail panel swap, and panel tabs.
- Pixel targets from `design_handoff/README.md` are encoded as custom Tailwind font sizes (`text-13.5`, `text-11`, etc.) and tracking scales (`tracking-wide-3`, `tracking-wide-8`).
- Fonts (Inter, IBM Plex Mono, Cormorant Garamond) are loaded via Google Fonts `<link>` in `app/layout.tsx`.
