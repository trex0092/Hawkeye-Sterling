/**
 * Hawkeye-Sterling Product Suite.
 *
 * Four product modules from a single codebase:
 *
 *   HAWKEYE SCREEN  — Sanctions/PEP screening API
 *   HAWKEYE INTEL   — World Monitor intelligence platform
 *   HAWKEYE WATCH   — Transaction monitoring + typology detection
 *   HAWKEYE FILE    — Filing workflow + goAML export
 *
 * Each module can be licensed independently or as a bundle.
 * This file exports clean entry points for each product.
 */

export { HawkeyeScreen } from './hawkeye-screen.mjs';
export { HawkeyeIntel } from './hawkeye-intel.mjs';
export { HawkeyeWatch } from './hawkeye-watch.mjs';
export { HawkeyeFile } from './hawkeye-file.mjs';
