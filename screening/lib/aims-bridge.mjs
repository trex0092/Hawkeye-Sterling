/**
 * AIMS Bridge — AI Agent Messaging for Compliance Bots.
 *
 * Integrates with the AIMS (AI Instant Messaging System) platform
 * to enable bot-to-bot compliance intelligence sharing.
 *
 * Use cases:
 *   - Automated screening alerts broadcast to compliance feed
 *   - Bot-to-bot intelligence sharing between DNFBP institutions
 *   - Public audit trail of all AI compliance actions
 *   - MLRO notification of critical events
 *   - Cross-institution case coordination
 *
 * The AIMS platform provides:
 *   - Transparent public feed (all bot actions visible to humans)
 *   - Direct messaging between compliance bots
 *   - Token economics to prevent spam
 *   - Optional blockchain immutability (Solana)
 *   - Claude-mem memory bridge
 *
 * Reference: https://github.com/thedotmack/aims
 *
 * Configuration:
 *   AIMS_API_URL     — AIMS instance URL (default: https://aims.bot)
 *   AIMS_API_KEY     — Bot API key (register at AIMS instance)
 *   AIMS_BOT_NAME    — Bot username (e.g., "hawkeye-compliance")
 */

import { createHash, createHmac } from 'node:crypto';

const AIMS_API_URL = process.env.AIMS_API_URL || 'https://aims.bot';
const AIMS_API_KEY = process.env.AIMS_API_KEY || '';
const AIMS_BOT_NAME = process.env.AIMS_BOT_NAME || 'hawkeye-compliance';

const MESSAGE_TYPES = {
  SCREENING_ALERT: 'screening_alert',
  FILING_UPDATE: 'filing_update',
  INTELLIGENCE_SIGNAL: 'intelligence_signal',
  SANCTIONS_UPDATE: 'sanctions_update',
  AUDIT_EVENT: 'audit_event',
  CASE_ESCALATION: 'case_escalation',
  COMPLIANCE_GRADE: 'compliance_grade',
};

/**
 * AIMS compliance bot bridge.
 */
export class AIMSBridge {
  constructor(opts = {}) {
    this.apiUrl = opts.apiUrl || AIMS_API_URL;
    this.apiKey = opts.apiKey || AIMS_API_KEY;
    this.botName = opts.botName || AIMS_BOT_NAME;
    this.enabled = !!this.apiKey;
    this.messageLog = [];
    this.maxLogSize = 500;
  }

  /**
   * Post a screening alert to the public compliance feed.
   */
  async postScreeningAlert(result) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    const content = [
      `[SCREENING] ${result.decision?.toUpperCase() || 'UNKNOWN'}`,
      `Subject: ${result.query?.name || 'N/A'}`,
      `Band: ${result.topBand || 'N/A'}`,
      `Hits: ${result.hits?.length || 0}`,
      `Case: ${result.caseId || 'N/A'}`,
    ].join(' | ');

    return this._postToFeed(MESSAGE_TYPES.SCREENING_ALERT, content, {
      caseId: result.caseId,
      decision: result.decision,
      topBand: result.topBand,
      hitCount: result.hits?.length || 0,
    });
  }

  /**
   * Post a filing state change to the feed.
   */
  async postFilingUpdate(filing, transition) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    const content = [
      `[FILING] ${filing.type} ${transition.to.toUpperCase()}`,
      `Subject: ${filing.subjectName}`,
      `Actor: ${transition.actor}`,
      `Reason: ${transition.reason?.slice(0, 100) || 'N/A'}`,
    ].join(' | ');

    return this._postToFeed(MESSAGE_TYPES.FILING_UPDATE, content, {
      filingId: filing.id,
      type: filing.type,
      state: transition.to,
    });
  }

  /**
   * Post an intelligence signal to the feed.
   */
  async postIntelligenceSignal(signal) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    const content = [
      `[INTEL] ${signal.severity || 'INFO'}`,
      `Country: ${signal.country || 'N/A'}`,
      `Type: ${signal.type || 'N/A'}`,
      signal.description?.slice(0, 150) || '',
    ].join(' | ');

    return this._postToFeed(MESSAGE_TYPES.INTELLIGENCE_SIGNAL, content, {
      country: signal.country,
      severity: signal.severity,
    });
  }

  /**
   * Send a direct message to another compliance bot.
   */
  async sendDM(recipientBot, messageType, content, metadata = {}) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    const payload = {
      to: recipientBot,
      content: `[${messageType}] ${content}`,
      metadata: {
        type: messageType,
        from: this.botName,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    return this._apiCall('POST', '/api/v1/messages', payload);
  }

  /**
   * Subscribe to another compliance bot's feed.
   */
  async follow(botName) {
    return this._apiCall('POST', `/api/v1/bots/${botName}/follow`);
  }

  /**
   * Get the public compliance feed.
   */
  async getFeed(opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.since) params.set('since', opts.since);
    return this._apiCall('GET', `/api/v1/feed?${params}`);
  }

  /**
   * Bridge a compliance observation to claude-mem via AIMS webhook.
   */
  async bridgeToMemory(observation) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    return this._apiCall('POST', '/api/v1/webhook/claude-mem', {
      category: observation.category,
      content: observation.content,
      entity: observation.entityName,
      importance: observation.importance || 5,
      source: 'hawkeye-sterling',
    });
  }

  /**
   * Post compliance grade to feed (periodic broadcast).
   */
  async postComplianceGrade(scorecard) {
    if (!this.enabled) return { sent: false, reason: 'AIMS not configured' };

    const content = [
      `[GRADE] ${scorecard.grade} (${scorecard.overallScore}%)`,
      `Label: ${scorecard.label}`,
      `Findings: ${scorecard.findings?.length || 0}`,
      `Assessed: ${scorecard.assessedAt?.slice(0, 10) || 'N/A'}`,
    ].join(' | ');

    return this._postToFeed(MESSAGE_TYPES.COMPLIANCE_GRADE, content, {
      grade: scorecard.grade,
      score: scorecard.overallScore,
    });
  }

  // ── Internal Methods ───────────────────────────────────────

  async _postToFeed(type, content, metadata = {}) {
    const message = {
      content,
      metadata: {
        type,
        source: 'hawkeye-sterling',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    this._log('post', type, content);
    return this._apiCall('POST', '/api/v1/feed', message);
  }

  async _apiCall(method, path, body = null) {
    try {
      const url = `${this.apiUrl}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Bot-Name': this.botName,
      };

      const opts = { method, headers };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);

      if (!res.ok) {
        const err = await res.text();
        return { sent: false, status: res.status, error: err };
      }

      const data = await res.json();
      return { sent: true, data };
    } catch (err) {
      return { sent: false, error: err.message };
    }
  }

  _log(action, type, content) {
    this.messageLog.push({
      action,
      type,
      content: content.slice(0, 200),
      timestamp: new Date().toISOString(),
    });
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxLogSize);
    }
  }

  /** Get message statistics. */
  stats() {
    const typeCounts = {};
    for (const m of this.messageLog) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }
    return {
      enabled: this.enabled,
      botName: this.botName,
      apiUrl: this.apiUrl,
      totalMessages: this.messageLog.length,
      byType: typeCounts,
    };
  }
}

export { MESSAGE_TYPES };
