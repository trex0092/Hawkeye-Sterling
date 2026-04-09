/**
 * Real-time WebSocket Alert System.
 *
 * Provides live push notifications for:
 *   - New sanctions list updates (entities added/removed)
 *   - High-risk screening results (medium/high/exact bands)
 *   - Audit chain events (decisions, overrides)
 *   - Filing state transitions
 *   - Staleness warnings
 *   - Threshold breach detections
 *
 * Uses native Node.js WebSocket (no ws dependency) over HTTP upgrade.
 * Clients connect to ws://host:port/ws and receive JSON messages.
 *
 * Message format:
 *   { type: "alert", channel: "screening|filing|audit|refresh|staleness",
 *     severity: "info|warning|critical", payload: {...}, timestamp: "ISO" }
 */

import { createHash } from 'node:crypto';

const CHANNELS = ['screening', 'filing', 'audit', 'refresh', 'staleness', 'threshold'];

class AlertHub {
  constructor() {
    this.clients = new Map(); // connectionId -> { socket, channels, apiKey, role }
    this.eventLog = []; // Last 1000 events for replay
    this.maxLogSize = 1000;
  }

  /**
   * Register a new WebSocket client.
   */
  addClient(id, socket, opts = {}) {
    this.clients.set(id, {
      socket,
      channels: new Set(opts.channels || CHANNELS),
      apiKey: opts.apiKey || null,
      role: opts.role || 'viewer',
      connectedAt: new Date().toISOString(),
    });
    this.broadcast('system', 'info', { message: `Client connected (${this.clients.size} total)` });
  }

  /**
   * Remove a client.
   */
  removeClient(id) {
    this.clients.delete(id);
  }

  /**
   * Subscribe a client to specific channels.
   */
  subscribe(id, channels) {
    const client = this.clients.get(id);
    if (!client) return;
    for (const ch of channels) {
      if (CHANNELS.includes(ch)) client.channels.add(ch);
    }
  }

  /**
   * Broadcast an alert to all subscribed clients.
   */
  broadcast(channel, severity, payload) {
    const event = {
      type: 'alert',
      channel,
      severity,
      payload,
      timestamp: new Date().toISOString(),
      id: createHash('sha256').update(`${Date.now()}:${channel}:${JSON.stringify(payload)}`).digest('hex').slice(0, 12),
    };

    // Store in event log
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Send to subscribed clients
    const msg = JSON.stringify(event);
    let sent = 0;
    for (const [id, client] of this.clients) {
      if (client.channels.has(channel) || channel === 'system') {
        try {
          sendWebSocketFrame(client.socket, msg);
          sent++;
        } catch {
          this.clients.delete(id);
        }
      }
    }
    return { sent, total: this.clients.size };
  }

  /**
   * Get recent events for a channel (for late-joining clients).
   */
  replay(channel, limit = 50) {
    return this.eventLog
      .filter(e => !channel || e.channel === channel)
      .slice(-limit);
  }

  /**
   * Emit a screening alert.
   */
  screeningAlert(result) {
    const severity = (result.topBand === 'high' || result.topBand === 'exact')
      ? 'critical'
      : result.topBand === 'medium' ? 'warning' : 'info';

    return this.broadcast('screening', severity, {
      caseId: result.caseId,
      subject: result.query?.name,
      decision: result.decision,
      topBand: result.topBand,
      hitCount: result.hits?.length || 0,
      topScore: result.hits?.[0]?.score || 0,
    });
  }

  /**
   * Emit a filing state change alert.
   */
  filingAlert(filing, transition) {
    const severity = transition.to === 'approved' ? 'info'
      : transition.to === 'rejected' ? 'warning'
      : transition.to === 'filed' ? 'info'
      : 'info';

    return this.broadcast('filing', severity, {
      filingId: filing.id,
      type: filing.type,
      subject: filing.subjectName,
      from: transition.from,
      to: transition.to,
      actor: transition.actor,
    });
  }

  /**
   * Emit a staleness warning.
   */
  stalenessAlert(freshnessResult) {
    if (!freshnessResult.ok) {
      return this.broadcast('staleness', 'critical', {
        staleCount: freshnessResult.staleCount,
        totalSources: freshnessResult.totalSources,
        oldestAgeHours: freshnessResult.oldestAgeHours,
        staleSources: freshnessResult.sources.filter(s => s.stale).map(s => s.id),
      });
    }
  }

  /**
   * Emit a refresh completion alert.
   */
  refreshAlert(results) {
    const added = Object.values(results).reduce((s, r) => s + (r.added?.length || 0), 0);
    const removed = Object.values(results).reduce((s, r) => s + (r.removed?.length || 0), 0);
    const errors = Object.entries(results).filter(([, r]) => r.error).map(([id]) => id);

    return this.broadcast('refresh', errors.length ? 'warning' : 'info', {
      sourcesRefreshed: Object.keys(results).length,
      entitiesAdded: added,
      entitiesRemoved: removed,
      errors,
    });
  }

  /**
   * Emit a threshold breach alert.
   */
  thresholdAlert(breachResult) {
    return this.broadcast('threshold', 'critical', {
      amount: breachResult.amount_aed,
      entity: breachResult.entity_name,
      breaches: breachResult.breaches,
      actions: breachResult.actions,
    });
  }

  /**
   * Get hub stats.
   */
  stats() {
    return {
      clients: this.clients.size,
      eventLogSize: this.eventLog.length,
      channels: CHANNELS,
    };
  }
}

// Minimal WebSocket frame encoder (RFC 6455)
function sendWebSocketFrame(socket, data) {
  const payload = Buffer.from(data, 'utf8');
  let header;

  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

// WebSocket handshake handler
function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return null;
  }

  const acceptKey = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC85B7B2')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );

  return socket;
}

// Parse WebSocket frame (for receiving client messages)
function parseWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLength = buffer[1] & 0x7F;
  let offset = 2;

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let mask = null;
  if (masked) {
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  const payload = buffer.slice(offset, offset + payloadLength);
  if (mask) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return payload.toString('utf8');
}

// Singleton hub
const alertHub = new AlertHub();

export { alertHub, AlertHub, handleUpgrade, parseWebSocketFrame, CHANNELS };
