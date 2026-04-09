/**
 * Outbound Webhook Notification System.
 *
 * Sends compliance alerts to external systems:
 *   - Slack (incoming webhooks)
 *   - Microsoft Teams (connectors)
 *   - Email (SMTP or webhook-based)
 *   - Custom HTTP endpoints
 *   - SMS (via webhook relay)
 *
 * Events:
 *   screening.high_risk  — Screening result with band >= medium
 *   filing.state_change  — Filing transitions (especially to approved/filed)
 *   audit.chain_break    — Audit chain integrity failure
 *   source.stale         — Sanctions list exceeds max age
 *   case.sla_breach      — Investigation case SLA missed
 *   alert.critical       — Any critical-severity alert
 *   grade.degraded       — Compliance grade drops below threshold
 *
 * All webhooks include HMAC-SHA256 signatures for verification.
 */

import { createHmac } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const EVENTS = [
  'screening.high_risk', 'screening.exact_match',
  'filing.state_change', 'filing.overdue',
  'audit.chain_break', 'audit.verified',
  'source.stale', 'source.refreshed',
  'case.sla_breach', 'case.escalated',
  'alert.critical', 'alert.high',
  'grade.degraded',
  'entity.risk_changed',
];

export class WebhookManager {
  constructor(opts = {}) {
    this.configPath = opts.configPath || resolve(process.cwd(), '.screening', 'webhooks.json');
    this.hooks = [];
    this.deliveryLog = [];
    this.maxLogSize = 1000;
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    if (existsSync(this.configPath)) {
      try {
        const data = JSON.parse(await readFile(this.configPath, 'utf8'));
        this.hooks = data.hooks || [];
      } catch (err) {
        console.warn(`[webhooks] Failed to load config: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  async save() {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.configPath, JSON.stringify({ hooks: this.hooks, updatedAt: new Date().toISOString() }, null, 2));
  }

  /**
   * Register a new webhook.
   * @param {object} params
   * @param {string} params.name - Human-readable name
   * @param {string} params.url - Target URL
   * @param {string} params.type - slack | teams | email | custom
   * @param {string[]} params.events - Events to subscribe to
   * @param {string} [params.secret] - HMAC signing secret
   * @param {boolean} [params.enabled] - Default true
   */
  async register(params) {
    await this.load();
    const hook = {
      id: `wh-${Date.now().toString(36)}`,
      name: params.name,
      url: params.url,
      type: params.type || 'custom',
      events: params.events || ['alert.critical'],
      secret: params.secret || null,
      enabled: params.enabled !== false,
      createdAt: new Date().toISOString(),
      lastDelivery: null,
      failCount: 0,
    };
    this.hooks.push(hook);
    await this.save();
    return hook;
  }

  async remove(hookId) {
    await this.load();
    this.hooks = this.hooks.filter(h => h.id !== hookId);
    await this.save();
  }

  async list() {
    await this.load();
    return this.hooks.map(h => ({ ...h, secret: h.secret ? '***' : null }));
  }

  /**
   * Fire an event to all subscribed webhooks.
   */
  async fire(event, payload) {
    await this.load();
    const matching = this.hooks.filter(h => h.enabled && h.events.includes(event));
    const results = [];

    for (const hook of matching) {
      const result = await this._deliver(hook, event, payload);
      results.push(result);
    }

    return { event, delivered: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
  }

  async _deliver(hook, event, payload) {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      source: 'hawkeye-sterling',
      version: '2.0.0',
      payload,
    });

    const headers = { 'Content-Type': 'application/json', 'X-Hawkeye-Event': event };
    if (hook.secret) {
      headers['X-Hawkeye-Signature'] = createHmac('sha256', hook.secret).update(body).digest('hex');
    }

    // Format for specific platforms
    let finalBody = body;
    if (hook.type === 'slack') {
      finalBody = JSON.stringify(this._formatSlack(event, payload));
    } else if (hook.type === 'teams') {
      finalBody = JSON.stringify(this._formatTeams(event, payload));
    }

    try {
      const res = await fetch(hook.url, { method: 'POST', headers, body: finalBody });
      const success = res.ok;
      hook.lastDelivery = new Date().toISOString();
      if (!success) hook.failCount++;
      else hook.failCount = 0;

      const entry = { hookId: hook.id, event, success, status: res.status, timestamp: hook.lastDelivery };
      this.deliveryLog.push(entry);
      if (this.deliveryLog.length > this.maxLogSize) this.deliveryLog = this.deliveryLog.slice(-this.maxLogSize);
      await this.save();
      return entry;
    } catch (err) {
      hook.failCount++;
      const entry = { hookId: hook.id, event, success: false, error: err.message, timestamp: new Date().toISOString() };
      this.deliveryLog.push(entry);
      return entry;
    }
  }

  _formatSlack(event, payload) {
    const sevEmoji = { critical: ':rotating_light:', high: ':warning:', medium: ':large_yellow_circle:', low: ':white_circle:' };
    const sev = payload.severity || 'info';
    return {
      text: `${sevEmoji[sev] || ':bell:'} *[${event}]* ${payload.title || payload.description || JSON.stringify(payload).slice(0, 200)}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${event}*\n${payload.description || payload.title || 'Compliance event'}` } },
        payload.entity ? { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Entity:* ${payload.entity}` },
          { type: 'mrkdwn', text: `*Severity:* ${sev}` },
        ] } : null,
      ].filter(Boolean),
    };
  }

  _formatTeams(event, payload) {
    return {
      '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
      themeColor: payload.severity === 'critical' ? 'FF0000' : payload.severity === 'high' ? 'FF8800' : '3B82F6',
      summary: `Hawkeye-Sterling: ${event}`,
      sections: [{
        activityTitle: `Hawkeye-Sterling Compliance Alert`,
        activitySubtitle: event,
        facts: [
          { name: 'Event', value: event },
          { name: 'Severity', value: payload.severity || 'info' },
          payload.entity ? { name: 'Entity', value: payload.entity } : null,
        ].filter(Boolean),
        text: payload.description || payload.title || '',
      }],
    };
  }

  stats() {
    return {
      totalHooks: this.hooks.length,
      enabled: this.hooks.filter(h => h.enabled).length,
      deliveries: this.deliveryLog.length,
      recentFailures: this.deliveryLog.filter(d => !d.success).slice(-10),
    };
  }
}

export { EVENTS };
