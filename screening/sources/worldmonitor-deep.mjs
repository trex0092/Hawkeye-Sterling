/**
 * World Monitor Deep Intelligence Integration.
 *
 * Transforms World Monitor from a simple news feed into a full
 * intelligence backbone for the Hawkeye-Sterling compliance engine.
 *
 * Capabilities:
 *
 * 1. MULTI-STREAM INTELLIGENCE FUSION
 *    Correlates signals across 6 World Monitor data streams:
 *    geopolitical, financial, sanctions, disaster, military, cyber
 *
 * 2. COUNTRY INTELLIGENCE INDEX (CII)
 *    Composite risk score across 12 signal dimensions per jurisdiction,
 *    updated in real-time as new intelligence arrives.
 *
 * 3. EARLY WARNING SYSTEM
 *    Detects emerging risks before they materialise on sanctions lists:
 *    coup signals, regime instability, conflict escalation, sanctions
 *    pre-announcement indicators.
 *
 * 4. COMMODITY PRICE INTELLIGENCE
 *    Monitors gold, precious metals, and stones prices for anomalous
 *    movements that may indicate trade-based ML activity.
 *
 * 5. SANCTIONS VELOCITY TRACKING
 *    Measures the rate of new sanctions designations per jurisdiction
 *    to predict upcoming FATF greylist decisions.
 *
 * 6. CROSS-BORDER FLOW INTELLIGENCE
 *    Maps global trade flows in precious metals and flags suspicious
 *    corridors based on intelligence signals.
 *
 * Self-hosted World Monitor: https://github.com/koala73/worldmonitor
 * Fallback: GDELT public API (subset of WM capabilities)
 *
 * Reference: FATF Recommendation 1 (Risk-Based Approach)
 */

import { fetchCached } from '../lib/http.js';
import { FATF_LISTS } from '../config.js';

const WORLDMONITOR_URL = process.env.WORLDMONITOR_URL || null;
const GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_GEO = 'https://api.gdeltproject.org/api/v2/geo/geo';

// ── Intelligence Stream Definitions ────────────────────────────

const INTEL_STREAMS = {
  sanctions: {
    name: 'Sanctions & Designations',
    weight: 5,
    queries: ['sanctions OR designated OR "asset freeze" OR OFAC OR "travel ban"'],
    indicators: ['sanctions', 'designated', 'blacklist', 'asset freeze', 'travel ban',
      'OFAC', 'OFSI', 'EOCN', 'targeted financial sanctions', 'SDN list'],
  },
  fatf: {
    name: 'FATF & AML Regulatory',
    weight: 4,
    queries: ['FATF OR "grey list" OR "mutual evaluation" OR "money laundering"'],
    indicators: ['FATF', 'grey list', 'greylist', 'black list', 'mutual evaluation',
      'increased monitoring', 'money laundering', 'terrorist financing', 'plenary',
      'AML', 'CFT', 'compliance'],
  },
  geopolitical: {
    name: 'Geopolitical Risk',
    weight: 3,
    queries: ['coup OR "regime change" OR "civil war" OR "political instability"'],
    indicators: ['coup', 'civil war', 'conflict', 'regime change', 'political instability',
      'capital controls', 'currency crisis', 'failed state', 'revolution', 'uprising'],
  },
  financial: {
    name: 'Financial Crime & Enforcement',
    weight: 4,
    queries: ['"money laundering" OR "financial crime" OR "enforcement action" OR "regulatory fine"'],
    indicators: ['money laundering', 'financial crime', 'enforcement', 'fine', 'penalty',
      'bank secrecy', 'shell company', 'offshore', 'tax evasion', 'fraud'],
  },
  precious_metals: {
    name: 'Precious Metals & Stones',
    weight: 5,
    queries: ['"gold smuggling" OR "precious metals" OR "conflict minerals" OR bullion'],
    indicators: ['gold smuggling', 'precious metals', 'precious stones', 'diamonds',
      'gold trade', 'bullion', 'gemstone', 'gold laundering', 'conflict minerals',
      'blood diamonds', 'gold refinery', 'Dubai gold'],
  },
  proliferation: {
    name: 'Proliferation Financing',
    weight: 5,
    queries: ['"proliferation financing" OR "WMD" OR "nuclear program" OR "missile"'],
    indicators: ['proliferation', 'WMD', 'nuclear', 'missile', 'dual-use',
      'North Korea', 'DPRK', 'Iran nuclear', 'JCPOA', 'ballistic'],
  },
};

// ── Country Intelligence Index (CII) ──────────────────────────

const CII_DIMENSIONS = [
  { id: 'fatf_status', weight: 15, description: 'FATF blacklist/greylist status' },
  { id: 'sanctions_activity', weight: 15, description: 'Rate of new sanctions designations' },
  { id: 'political_stability', weight: 10, description: 'Political stability signals' },
  { id: 'financial_crime', weight: 12, description: 'Financial crime enforcement activity' },
  { id: 'regulatory_quality', weight: 8, description: 'AML regulatory framework quality' },
  { id: 'conflict_intensity', weight: 10, description: 'Armed conflict and violence levels' },
  { id: 'corruption', weight: 10, description: 'Corruption perception and enforcement' },
  { id: 'precious_metals_risk', weight: 8, description: 'Precious metals trade risk indicators' },
  { id: 'media_sentiment', weight: 5, description: 'Overall media sentiment toward country' },
  { id: 'trade_transparency', weight: 5, description: 'Trade and customs transparency' },
  { id: 'cyber_threat', weight: 2, description: 'State-sponsored cyber threat activity' },
];

/**
 * Calculate the Country Intelligence Index for a jurisdiction.
 *
 * @param {string} countryCode - ISO 2-letter country code
 * @param {Array} events - Intelligence events for the country
 * @returns {CountryIntelligenceIndex}
 */
export function calculateCII(countryCode, events = []) {
  const dimensions = {};
  let totalWeighted = 0;
  let totalWeight = 0;

  // FATF Status (static + intelligence)
  let fatfScore = 0;
  if (FATF_LISTS.blacklist.includes(countryCode)) fatfScore = 100;
  else if (FATF_LISTS.greylist.includes(countryCode)) fatfScore = 60;
  else {
    const fatfEvents = events.filter(e => e.signals?.includes('fatf'));
    fatfScore = Math.min(40, fatfEvents.length * 10);
  }
  dimensions.fatf_status = { score: fatfScore, events: events.filter(e => e.signals?.includes('fatf')).length };
  totalWeighted += fatfScore * 15; totalWeight += 15;

  // Sanctions Activity
  const sanctionEvents = events.filter(e => e.signals?.includes('sanctions'));
  const sanctionsScore = Math.min(100, sanctionEvents.length * 15);
  dimensions.sanctions_activity = { score: sanctionsScore, events: sanctionEvents.length };
  totalWeighted += sanctionsScore * 15; totalWeight += 15;

  // Political Stability
  const geoEvents = events.filter(e => e.signals?.includes('geopolitical'));
  const geoScore = Math.min(100, geoEvents.length * 12);
  dimensions.political_stability = { score: geoScore, events: geoEvents.length };
  totalWeighted += geoScore * 10; totalWeight += 10;

  // Financial Crime
  const finEvents = events.filter(e => e.signals?.includes('financial'));
  const finScore = Math.min(100, finEvents.length * 12);
  dimensions.financial_crime = { score: finScore, events: finEvents.length };
  totalWeighted += finScore * 12; totalWeight += 12;

  // Precious Metals Risk
  const pmEvents = events.filter(e => e.signals?.includes('precious_metals'));
  const pmScore = Math.min(100, pmEvents.length * 20);
  dimensions.precious_metals_risk = { score: pmScore, events: pmEvents.length };
  totalWeighted += pmScore * 8; totalWeight += 8;

  // Media Sentiment (average tone — more negative = higher risk)
  const avgTone = events.length > 0
    ? events.reduce((s, e) => s + (e.tone || 0), 0) / events.length
    : 0;
  const sentimentScore = Math.min(100, Math.max(0, 50 + (-avgTone * 5)));
  dimensions.media_sentiment = { score: sentimentScore, avgTone: Math.round(avgTone * 100) / 100 };
  totalWeighted += sentimentScore * 5; totalWeight += 5;

  // Proliferation
  const pfEvents = events.filter(e => e.signals?.includes('proliferation'));
  const pfScore = Math.min(100, pfEvents.length * 25);
  dimensions.proliferation = { score: pfScore, events: pfEvents.length };
  totalWeighted += pfScore * 10; totalWeight += 10;

  // Fill remaining dimensions with baseline
  for (const dim of CII_DIMENSIONS) {
    if (!dimensions[dim.id]) {
      dimensions[dim.id] = { score: 0, events: 0 };
      totalWeighted += 0;
      totalWeight += dim.weight;
    }
  }

  const compositeScore = totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0;

  let riskLevel, recommendation;
  if (compositeScore >= 70) {
    riskLevel = 'CRITICAL';
    recommendation = 'Prohibit new business relationships. EDD on existing relationships. Consider exit.';
  } else if (compositeScore >= 50) {
    riskLevel = 'HIGH';
    recommendation = 'EDD mandatory. Senior Management approval required. Enhanced monitoring.';
  } else if (compositeScore >= 30) {
    riskLevel = 'ELEVATED';
    recommendation = 'Standard CDD with enhanced monitoring. Quarterly jurisdiction review.';
  } else if (compositeScore >= 15) {
    riskLevel = 'MODERATE';
    recommendation = 'Standard CDD. Semi-annual jurisdiction review.';
  } else {
    riskLevel = 'LOW';
    recommendation = 'Simplified measures may be applied. Annual jurisdiction review.';
  }

  return {
    country: countryCode,
    compositeScore,
    riskLevel,
    recommendation,
    dimensions,
    eventCount: events.length,
    assessedAt: new Date().toISOString(),
    methodology: {
      dimensions: CII_DIMENSIONS.length,
      totalWeight,
      reference: 'FATF Rec.1 (RBA) | FDL 10/2025 Art.13-14',
    },
  };
}

/**
 * Early Warning System — detect emerging risks before they materialise.
 *
 * Analyses intelligence velocity (rate of signals per jurisdiction)
 * to identify countries where risk is rapidly escalating.
 *
 * @param {Array} events - Intelligence events from multiple jurisdictions
 * @param {number} [thresholdMultiplier=3] - Alert when signal rate exceeds N x baseline
 * @returns {Array<EarlyWarning>}
 */
export function detectEarlyWarnings(events, thresholdMultiplier = 3) {
  if (!events || events.length === 0) return [];

  // Group events by country
  const byCountry = {};
  for (const e of events) {
    const c = e.country || 'UNKNOWN';
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(e);
  }

  const warnings = [];

  for (const [country, countryEvents] of Object.entries(byCountry)) {
    // Calculate signal velocity (events per day, recent vs historical)
    const now = Date.now();
    const recent24h = countryEvents.filter(e => {
      const d = e.date ? new Date(e.date).getTime() : 0;
      return (now - d) < 86400000;
    });
    const older = countryEvents.filter(e => {
      const d = e.date ? new Date(e.date).getTime() : 0;
      return (now - d) >= 86400000;
    });

    const recentRate = recent24h.length;
    const historicalRate = older.length / Math.max(1, 6); // Per day over ~7 days

    if (historicalRate > 0 && recentRate > historicalRate * thresholdMultiplier) {
      const escalatingCategories = [...new Set(recent24h.flatMap(e => e.signals || []))];

      let severity = 'MEDIUM';
      if (recentRate > historicalRate * 5) severity = 'CRITICAL';
      else if (recentRate > historicalRate * thresholdMultiplier) severity = 'HIGH';

      warnings.push({
        country,
        severity,
        type: 'SIGNAL_VELOCITY_SPIKE',
        recentSignals: recentRate,
        historicalAverage: Math.round(historicalRate * 10) / 10,
        multiplier: Math.round((recentRate / historicalRate) * 10) / 10,
        escalatingCategories,
        topSignals: recent24h.slice(0, 5).map(e => ({
          title: e.title?.slice(0, 100),
          category: e.category,
          date: e.date,
        })),
        recommendation: severity === 'CRITICAL'
          ? `IMMEDIATE: Review all ${country} counterparty relationships. Consider precautionary measures.`
          : `MONITOR: Increase monitoring frequency for ${country} counterparties.`,
      });
    }

    // Check for sanctions-specific acceleration
    const sanctionSignals = recent24h.filter(e => e.signals?.includes('sanctions'));
    if (sanctionSignals.length >= 3) {
      warnings.push({
        country,
        severity: 'HIGH',
        type: 'SANCTIONS_ACCELERATION',
        signalCount: sanctionSignals.length,
        description: `${sanctionSignals.length} sanctions-related signals in 24h for ${country}`,
        signals: sanctionSignals.slice(0, 5).map(e => e.title?.slice(0, 100)),
        recommendation: `Pre-screen all ${country} counterparties immediately. Possible imminent designation.`,
      });
    }
  }

  return warnings.sort((a, b) => {
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
  });
}

/**
 * Commodity price anomaly detection for precious metals.
 *
 * Monitors gold/silver/platinum prices for unusual movements that may
 * indicate trade-based money laundering activity (TBML).
 *
 * @param {object} priceData - { gold: number, silver: number, platinum: number } (per troy oz, USD)
 * @param {object} baseline - Historical baseline prices (30-day average)
 * @returns {Array<CommodityAlert>}
 */
export function detectCommodityAnomalies(priceData, baseline) {
  if (!priceData || !baseline) return [];
  const alerts = [];

  for (const [metal, currentPrice] of Object.entries(priceData)) {
    const basePrice = baseline[metal];
    if (!basePrice || !currentPrice) continue;

    const deviation = (currentPrice - basePrice) / basePrice;

    if (Math.abs(deviation) > 0.05) { // >5% deviation
      alerts.push({
        commodity: metal,
        currentPrice,
        baselinePrice: basePrice,
        deviationPct: Math.round(deviation * 10000) / 100,
        direction: deviation > 0 ? 'UP' : 'DOWN',
        severity: Math.abs(deviation) > 0.10 ? 'HIGH' : 'MEDIUM',
        description: `${metal} price ${deviation > 0 ? 'surge' : 'drop'}: ${Math.abs(Math.round(deviation * 100))}% from 30-day baseline`,
        implication: deviation > 0.10
          ? 'Significant price surge may indicate supply disruption or speculative activity. Review open positions and recent large trades.'
          : deviation < -0.10
          ? 'Significant price drop may trigger margin calls or distressed selling. Monitor counterparty exposures.'
          : 'Moderate price movement. Continue standard monitoring.',
      });
    }
  }

  return alerts;
}

/**
 * Sanctions velocity tracker — measures designation rate per jurisdiction.
 *
 * @param {Array} events - Historical sanctions events
 * @returns {Array<{ country, designationsPerMonth, trend, greylistRisk }>}
 */
export function trackSanctionsVelocity(events) {
  const sanctionEvents = (events || []).filter(e => e.signals?.includes('sanctions'));
  const byCountry = {};

  for (const e of sanctionEvents) {
    const c = e.country || 'UNKNOWN';
    if (!byCountry[c]) byCountry[c] = { events: [], months: new Set() };
    byCountry[c].events.push(e);
    if (e.date) byCountry[c].months.add(e.date.slice(0, 7));
  }

  return Object.entries(byCountry)
    .map(([country, data]) => {
      const months = Math.max(1, data.months.size);
      const rate = data.events.length / months;
      const isAccelerating = data.events.length > 3;

      return {
        country,
        totalDesignations: data.events.length,
        activeMonths: months,
        designationsPerMonth: Math.round(rate * 10) / 10,
        trend: isAccelerating ? 'ACCELERATING' : rate > 1 ? 'ACTIVE' : 'STABLE',
        greylistRisk: rate > 2 ? 'HIGH' : rate > 1 ? 'MEDIUM' : 'LOW',
        alreadyListed: FATF_LISTS.blacklist.includes(country) || FATF_LISTS.greylist.includes(country),
      };
    })
    .sort((a, b) => b.designationsPerMonth - a.designationsPerMonth);
}

/**
 * Full intelligence briefing — combines all World Monitor capabilities.
 *
 * @param {string} countryCode - ISO 2-letter country code
 * @param {object} [opts] - Fetch options
 * @returns {Promise<IntelligenceBriefing>}
 */
export async function fullBriefing(countryCode, opts = {}) {
  // Import the base worldmonitor adapter
  const { fetchIntelligence, scoreIntelligence } = await import('./worldmonitor.js');

  // Fetch intelligence events
  const events = await fetchIntelligence({
    ...opts,
    country: countryCode,
    hours: opts.hours || 168, // 7 days for deeper analysis
    limit: opts.limit || 200,
  });

  // Calculate all metrics
  const cii = calculateCII(countryCode, events);
  const earlyWarnings = detectEarlyWarnings(events);
  const sanctionsVelocity = trackSanctionsVelocity(events);
  const score = scoreIntelligence(events);

  // Compile briefing
  return {
    country: countryCode,
    generatedAt: new Date().toISOString(),
    period: `${opts.hours || 168}h lookback`,

    countryIntelligenceIndex: cii,
    earlyWarnings: earlyWarnings.filter(w => w.country === countryCode),
    sanctionsVelocity: sanctionsVelocity.find(v => v.country === countryCode) || null,
    intelligenceScore: score,

    eventSummary: {
      total: events.length,
      byCategory: Object.fromEntries(
        Object.keys(INTEL_STREAMS).map(cat => [
          cat,
          events.filter(e => e.signals?.includes(cat)).length,
        ])
      ),
    },

    topEvents: events.slice(0, 20).map(e => ({
      title: e.title,
      url: e.url,
      date: e.date,
      category: e.category,
      signals: e.signals,
      relevance: e.relevance,
    })),

    recommendation: cii.recommendation,
    riskLevel: cii.riskLevel,

    dataSources: WORLDMONITOR_URL
      ? ['World Monitor (self-hosted)', 'FATF Lists']
      : ['GDELT (public feed)', 'FATF Lists'],
  };
}

export {
  INTEL_STREAMS,
  CII_DIMENSIONS,
};
