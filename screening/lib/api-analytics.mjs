/**
 * API Usage Analytics Engine.
 *
 * Tracks and reports on API usage patterns per tenant, key, and endpoint.
 * Enables usage-based billing, abuse detection, and capacity planning.
 *
 * Metrics:
 *   - Request count per endpoint, tenant, key, time period
 *   - Response latency percentiles (p50, p95, p99)
 *   - Error rates per endpoint
 *   - Screening volume and band distribution
 *   - Rate limit hits
 *   - Geographic distribution of requests (by IP country)
 *   - Peak usage hours
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export class ApiAnalytics {
  constructor(opts = {}) {
    this.storagePath = opts.storagePath || resolve(process.cwd(), '.screening', 'analytics.json');
    this.buckets = new Map(); // "YYYY-MM-DD:HH" -> HourBucket
    this.currentDay = '';
    this.maxBuckets = 720; // 30 days of hourly buckets
  }

  /**
   * Record an API request.
   */
  record(event) {
    const now = new Date();
    const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const day = now.toISOString().slice(0, 10);

    if (!this.buckets.has(hour)) {
      this.buckets.set(hour, createBucket(hour));
      this._prune();
    }

    const bucket = this.buckets.get(hour);
    bucket.totalRequests++;

    // Endpoint tracking
    const ep = event.endpoint || 'unknown';
    if (!bucket.endpoints[ep]) bucket.endpoints[ep] = { count: 0, errors: 0, latencies: [] };
    bucket.endpoints[ep].count++;
    if (event.statusCode >= 400) bucket.endpoints[ep].errors++;
    if (event.latencyMs !== undefined) bucket.endpoints[ep].latencies.push(event.latencyMs);

    // Tenant tracking
    if (event.tenantId) {
      if (!bucket.tenants[event.tenantId]) bucket.tenants[event.tenantId] = 0;
      bucket.tenants[event.tenantId]++;
    }

    // Key tracking
    if (event.keyId) {
      if (!bucket.keys[event.keyId]) bucket.keys[event.keyId] = 0;
      bucket.keys[event.keyId]++;
    }

    // Screening band distribution
    if (event.screeningBand) {
      bucket.screeningBands[event.screeningBand] = (bucket.screeningBands[event.screeningBand] || 0) + 1;
    }

    // Rate limit hits
    if (event.rateLimited) bucket.rateLimitHits++;

    // Status codes
    if (event.statusCode) {
      const group = `${Math.floor(event.statusCode / 100)}xx`;
      bucket.statusCodes[group] = (bucket.statusCodes[group] || 0) + 1;
    }
  }

  /**
   * Get analytics for a time period.
   *
   * @param {object} [filter]
   * @param {string} [filter.from] - Start date (ISO)
   * @param {string} [filter.to] - End date (ISO)
   * @param {string} [filter.tenantId] - Filter by tenant
   * @param {string} [filter.endpoint] - Filter by endpoint
   * @returns {AnalyticsReport}
   */
  report(filter = {}) {
    const from = filter.from || '2000-01-01';
    const to = filter.to || '2099-12-31';

    const matchingBuckets = [...this.buckets.values()].filter(b =>
      b.hour >= from && b.hour <= to + 'T24'
    );

    if (matchingBuckets.length === 0) {
      return { period: { from, to }, totalRequests: 0, endpoints: {}, tenants: {}, screeningBands: {} };
    }

    // Aggregate
    let totalRequests = 0;
    let rateLimitHits = 0;
    const endpoints = {};
    const tenants = {};
    const screeningBands = {};
    const statusCodes = {};
    const allLatencies = [];
    const hourlyVolume = [];

    for (const b of matchingBuckets) {
      totalRequests += b.totalRequests;
      rateLimitHits += b.rateLimitHits;
      hourlyVolume.push({ hour: b.hour, requests: b.totalRequests });

      for (const [ep, data] of Object.entries(b.endpoints)) {
        if (filter.endpoint && ep !== filter.endpoint) continue;
        if (!endpoints[ep]) endpoints[ep] = { count: 0, errors: 0, latencies: [] };
        endpoints[ep].count += data.count;
        endpoints[ep].errors += data.errors;
        endpoints[ep].latencies.push(...data.latencies);
        allLatencies.push(...data.latencies);
      }

      for (const [t, count] of Object.entries(b.tenants)) {
        if (filter.tenantId && t !== filter.tenantId) continue;
        tenants[t] = (tenants[t] || 0) + count;
      }

      for (const [band, count] of Object.entries(b.screeningBands)) {
        screeningBands[band] = (screeningBands[band] || 0) + count;
      }

      for (const [code, count] of Object.entries(b.statusCodes)) {
        statusCodes[code] = (statusCodes[code] || 0) + count;
      }
    }

    // Compute latency percentiles
    allLatencies.sort((a, b) => a - b);
    const latencyStats = allLatencies.length > 0 ? {
      p50: allLatencies[Math.floor(allLatencies.length * 0.5)],
      p95: allLatencies[Math.floor(allLatencies.length * 0.95)],
      p99: allLatencies[Math.floor(allLatencies.length * 0.99)],
      mean: Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length),
    } : null;

    // Per-endpoint latency
    for (const [ep, data] of Object.entries(endpoints)) {
      data.latencies.sort((a, b) => a - b);
      data.latencyP50 = data.latencies.length > 0 ? data.latencies[Math.floor(data.latencies.length * 0.5)] : null;
      data.latencyP95 = data.latencies.length > 0 ? data.latencies[Math.floor(data.latencies.length * 0.95)] : null;
      data.errorRate = data.count > 0 ? Math.round((data.errors / data.count) * 10000) / 100 : 0;
      delete data.latencies; // Don't include raw latencies in report
    }

    // Peak hour
    const peakHour = hourlyVolume.sort((a, b) => b.requests - a.requests)[0] || null;

    return {
      period: { from, to },
      totalRequests,
      rateLimitHits,
      endpoints,
      tenants,
      screeningBands,
      statusCodes,
      latency: latencyStats,
      peakHour: peakHour ? { hour: peakHour.hour, requests: peakHour.requests } : null,
      bucketsAnalyzed: matchingBuckets.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Save analytics to disk. */
  async persist() {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const data = Object.fromEntries(this.buckets);
    await writeFile(this.storagePath, JSON.stringify(data), 'utf8');
  }

  /** Load analytics from disk. */
  async load() {
    if (!existsSync(this.storagePath)) return;
    try {
      const data = JSON.parse(await readFile(this.storagePath, 'utf8'));
      for (const [k, v] of Object.entries(data)) this.buckets.set(k, v);
    } catch { /* ignore corrupt files */ }
  }

  _prune() {
    if (this.buckets.size <= this.maxBuckets) return;
    const keys = [...this.buckets.keys()].sort();
    while (this.buckets.size > this.maxBuckets) {
      this.buckets.delete(keys.shift());
    }
  }
}

function createBucket(hour) {
  return {
    hour,
    totalRequests: 0,
    endpoints: {},
    tenants: {},
    keys: {},
    screeningBands: {},
    statusCodes: {},
    rateLimitHits: 0,
  };
}
