# Hawkeye Sterling — Web (v5)

Next.js 14 + TypeScript + Tailwind front-end for the Hawkeye Sterling AML/CFT
platform. Deployed to Netlify via [`@netlify/plugin-nextjs`](https://github.com/netlify/next-runtime); the
root `netlify.toml` builds the backend engine first (`dist/`) then this app.

## Getting started

```bash
# From the repo root — build the brain once so the API route can import it:
npm ci
npm run build

# Then run the Next.js dev server:
cd web
npm install
npm run dev
```

Open http://localhost:3000 — root redirects to `/screening` (Module 01). The
Screening detail panel performs live `quickScreen` calls against the compiled
brain via `POST /api/quick-screen`.

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
| 02 | Cases & Evidence Trail | `/cases` | ✔ implemented |
| 03 | Deep Reasoning Workbench | `/workbench` | ✔ implemented |
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
- **Layout components** (`components/layout/*`): `Header`, `Sidebar` primitives (`SidebarParts.tsx`).
- **Module components** (`components/screening|cases|workbench/*`).
- **API layer**:
  - `app/api/quick-screen/route.ts` — Next.js route handler that imports the
    compiled backend (`dist/src/brain/quick-screen.js`) and serves
    `POST /api/quick-screen`.
  - `lib/api/quickScreen.ts` — typed client with `QuickScreenError`.
  - `lib/api/quickScreen.types.ts` — wire-format types mirroring the brain.
  - `lib/hooks/useQuickScreen.ts` — subject-keyed screening hook with
    abort-on-change semantics.
- **Seed data** in `lib/data/` — subjects, cases, modes, and the candidate
  corpus the live screening runs against. Swap `candidates.ts` for a real
  watchlist feed when `src/brain/watchlist-adapters.ts` is wired.
- **Types** in `lib/types.ts`.

## Notes

- Module 01 implements filter queue, debounced search (via `useDeferredValue`), row selection → detail panel swap, and panel tabs.
- Pixel targets from `design_handoff/README.md` are encoded as custom Tailwind font sizes (`text-13.5`, `text-11`, etc.) and tracking scales (`tracking-wide-3`, `tracking-wide-8`).
- Fonts (Inter, IBM Plex Mono, Cormorant Garamond) are loaded via Google Fonts `<link>` in `app/layout.tsx`.
