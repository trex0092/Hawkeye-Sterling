/**
 * HAWKEYE SCREEN — Sanctions/PEP Screening API.
 *
 * The core screening product. Multi-source sanctions screening with
 * fuzzy matching, phonetic encoding, CJK transliteration, and
 * hash-chained audit trail.
 *
 * Capabilities:
 *   - Screen against OFAC, UN, UK OFSI, EU, OpenSanctions
 *   - Fuzzy name matching (Jaro-Winkler, Levenshtein, token-set)
 *   - Phonetic matching (Soundex, Double Metaphone)
 *   - Arabic, Cyrillic, CJK transliteration
 *   - DOB and country corroboration
 *   - Adverse media enrichment via GDELT
 *   - Tamper-evident audit log (SHA256 hash chain)
 *   - Staleness circuit-breaker (blocks screening with stale lists)
 *   - Batch screening for portfolio re-screening
 *   - REST API with auth + rate limiting
 *
 * License tier: SCREEN (base)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export class HawkeyeScreen {
  constructor(opts = {}) {
    this.opts = opts;
    this._screening = null;
  }

  async init() {
    if (this._screening) return this;
    this._screening = await import(resolve(ROOT, 'screening', 'index.js'));
    await this._screening.init(this.opts);
    return this;
  }

  /** Screen a single subject. */
  async screen(query, opts = {}) {
    await this.init();
    return this._screening.screen(query, { ...this.opts, ...opts });
  }

  /** Batch screen multiple subjects. */
  async batch(queries, opts = {}) {
    await this.init();
    return this._screening.batch(queries, { ...this.opts, ...opts });
  }

  /** Record a reviewer decision. */
  async decision(caseId, outcome, reason, actor) {
    await this.init();
    return this._screening.decision(caseId, outcome, reason, actor);
  }

  /** Override (whitelist/unwhitelist). */
  async override(entityId, action, reason, actor) {
    await this.init();
    return this._screening.override(entityId, action, reason, actor);
  }

  /** Refresh all enabled sanctions sources. */
  async refresh(opts = {}) {
    await this.init();
    return this._screening.refreshAll({ ...this.opts, ...opts });
  }

  /** Verify audit chain integrity. */
  async verify() {
    await this.init();
    return this._screening.verify();
  }

  /** Check sanctions list freshness. */
  async checkFreshness() {
    const { checkFreshness } = await import(resolve(ROOT, 'screening', 'lib', 'staleness.mjs'));
    return checkFreshness(this.opts);
  }

  /** Get store/audit statistics. */
  stats() {
    return this._screening?.stats() || { initialized: false };
  }

  static get product() {
    return {
      id: 'hawkeye-screen',
      name: 'Hawkeye Screen',
      tagline: 'Multi-source sanctions & PEP screening with AI-powered matching',
      version: '2.0.0',
      tier: 'base',
    };
  }
}
