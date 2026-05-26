#!/usr/bin/env node
// Governance gate: fail the production build if any reasoning mode lacks an
// explicit version pin. Called by CI and by scripts/build.sh.
//
// Exit 0 — all modes have explicit version entries in _MODE_VERSION_ENTRIES.
// Exit 1 — one or more modes are still on '0.0.0-pending' (requires MLRO/CO
//           sign-off to add a real entry to reasoning-modes.ts).
//
// This check is intentionally skipped in non-production environments so that
// engineers can run tests locally without having to pin every experimental mode.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function main() {
  // Dynamic import from the compiled dist/ output. If tsc hasn't run yet,
  // this will throw a useful module-not-found error.
  const distPath = path.resolve(__dirname, '../dist/src/brain/reasoning-modes.js');

  let getMissingVersionPins;
  try {
    const mod = await import(distPath);
    getMissingVersionPins = mod.getMissingVersionPins;
  } catch (err) {
    console.error('[check-mode-versions] Failed to load dist/src/brain/reasoning-modes.js');
    console.error('  Run `npm run build` first to compile TypeScript.');
    console.error('  Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (typeof getMissingVersionPins !== 'function') {
    console.error('[check-mode-versions] getMissingVersionPins not exported from reasoning-modes.js');
    process.exit(1);
  }

  const missing = getMissingVersionPins();

  if (missing.length === 0) {
    console.log('[check-mode-versions] PASS — all reasoning modes have explicit version pins.');
    process.exit(0);
  }

  // In non-production environments, warn but do not fail the build.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[check-mode-versions] WARN — ${missing.length} mode(s) missing version pins (non-production, not blocking):`);
    for (const id of missing) {
      console.warn(`  - ${id}`);
    }
    process.exit(0);
  }

  // Production: fail hard. Every deployed mode must have MLRO/CO sign-off.
  console.error(`[check-mode-versions] FAIL — ${missing.length} mode(s) missing version pins.`);
  console.error('Each entry requires a real version/deployedDate/contentHash/author/approvedBy');
  console.error('in _MODE_VERSION_ENTRIES (src/brain/reasoning-modes.ts). MLRO/CO sign-off required.');
  console.error('');
  console.error('Pending modes:');
  for (const id of missing) {
    console.error(`  - ${id}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[check-mode-versions] Unexpected error:', err);
  process.exit(1);
});
