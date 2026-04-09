/**
 * HAWKEYE INTEL — World Monitor Intelligence Platform.
 *
 * Real-time geopolitical intelligence for compliance teams. Powered
 * by World Monitor (65+ data sources, 435+ news feeds).
 *
 * Capabilities:
 *   - Country Intelligence Index (CII): 12-dimension risk scoring
 *   - Early warning system: signal velocity spike detection
 *   - Sanctions velocity tracking: predict FATF greylist changes
 *   - Commodity anomaly detection: gold/silver/platinum TBML indicators
 *   - Multi-stream intelligence fusion (6 streams)
 *   - Jurisdiction risk briefings for MLRO
 *   - Cross-border flow intelligence
 *   - Compliance-relevant signal classification
 *
 * Data sources: World Monitor self-hosted or GDELT public API fallback.
 *
 * License tier: INTEL (add-on)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export class HawkeyeIntel {
  constructor(opts = {}) {
    this.opts = opts;
    this._wm = null;
    this._wmDeep = null;
  }

  async _load() {
    if (!this._wm) {
      this._wm = await import(resolve(ROOT, 'screening', 'sources', 'worldmonitor.js'));
      this._wmDeep = await import(resolve(ROOT, 'screening', 'sources', 'worldmonitor-deep.mjs'));
    }
  }

  /** Fetch raw intelligence events for a jurisdiction. */
  async fetchIntelligence(opts = {}) {
    await this._load();
    return this._wm.fetchIntelligence(opts);
  }

  /** Full jurisdiction briefing (events + CII + warnings). */
  async briefing(countryCode, opts = {}) {
    await this._load();
    return this._wmDeep.fullBriefing(countryCode, { ...this.opts, ...opts });
  }

  /** Calculate Country Intelligence Index. */
  async countryIndex(countryCode, opts = {}) {
    await this._load();
    const events = await this._wm.fetchIntelligence({
      ...this.opts, ...opts, country: countryCode, hours: opts.hours || 168,
    });
    return this._wmDeep.calculateCII(countryCode, events);
  }

  /** Detect early warnings across all monitored jurisdictions. */
  async earlyWarnings(opts = {}) {
    await this._load();
    const events = await this._wm.fetchIntelligence({
      ...this.opts, ...opts, hours: opts.hours || 168, limit: 500,
    });
    return this._wmDeep.detectEarlyWarnings(events);
  }

  /** Track sanctions designation velocity. */
  async sanctionsVelocity(opts = {}) {
    await this._load();
    const events = await this._wm.fetchIntelligence({
      ...this.opts, ...opts, hours: opts.hours || 720, limit: 1000,
    });
    return this._wmDeep.trackSanctionsVelocity(events);
  }

  /** Detect commodity price anomalies. */
  async commodityAnomalies(currentPrices, baselinePrices) {
    await this._load();
    return this._wmDeep.detectCommodityAnomalies(currentPrices, baselinePrices);
  }

  static get product() {
    return {
      id: 'hawkeye-intel',
      name: 'Hawkeye Intel',
      tagline: 'Real-time geopolitical intelligence powered by World Monitor',
      version: '2.0.0',
      tier: 'addon',
      requires: ['hawkeye-screen'],
    };
  }
}
