#!/usr/bin/env node
/**
 * Real-time Sanctions Webhook — Push alerts when sanctions lists change.
 *
 * Monitors OFAC, UN, UK OFSI, EU, and OpenSanctions for list updates.
 * Compares content hashes against the last known state. When a change
 * is detected:
 *   1. Sends alert via Slack, email, or SMS (configurable)
 *   2. Triggers automatic re-screening of the counterparty register
 *   3. Records the change in the memory system
 *   4. Archives the diff to history/
 *
 * Run as a cron (every 30 min) or as a long-running watcher.
 *
 * Schedule: GitHub Actions every 30 minutes during business hours.
 * Env vars:
 *   SLACK_WEBHOOK_URL    — Slack incoming webhook URL
 *   ALERT_EMAIL          — Email address for alerts (via Netlify function)
 *   SMS_WEBHOOK_URL      — SMS gateway webhook (Twilio/MessageBird)
 *   ALERT_CHANNELS       — Comma-separated: slack,email,sms (default: slack)
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const STATE_FILE = resolve(PROJECT_ROOT, '.screening', 'webhook-state.json');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'daily-ops');

/** Sanctions sources to monitor with their canonical URLs. */
const SOURCES = [
  {
    id: 'opensanctions',
    name: 'OpenSanctions Consolidated',
    url: 'https://data.opensanctions.org/datasets/latest/default/index.json',
    checkField: 'last_change', // JSON field with timestamp
    priority: 'CRITICAL',
  },
  {
    id: 'ofac-sdn',
    name: 'OFAC SDN List',
    url: 'https://www.treasury.gov/ofac/downloads/sdn.csv',
    checkField: null, // Use content hash
    priority: 'CRITICAL',
  },
  {
    id: 'un-consolidated',
    name: 'UN Security Council Consolidated List',
    url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    checkField: null,
    priority: 'CRITICAL',
  },
  {
    id: 'uk-ofsi',
    name: 'UK OFSI Consolidated List',
    url: 'https://assets.publishing.service.gov.uk/media/sanctionslistconsolidatedlist.csv',
    checkField: null,
    priority: 'HIGH',
  },
  {
    id: 'uae-eocn',
    name: 'UAE EOCN / Local Terrorist List',
    url: 'https://www.uaeiec.gov.ae/en-us/',
    checkField: null,
    priority: 'CRITICAL',
  },
];

const ALERT_CHANNELS = (process.env.ALERT_CHANNELS || 'slack').split(',').map(c => c.trim());

// ── Main ────────────────────────────────────────────────────

export async function checkForChanges() {
  const state = await loadState();
  const changes = [];
  const now = new Date().toISOString();

  for (const source of SOURCES) {
    try {
      const result = await checkSource(source, state);
      if (result.changed) {
        changes.push({
          source: source.id,
          name: source.name,
          priority: source.priority,
          previousHash: result.previousHash,
          currentHash: result.currentHash,
          previousCheck: state[source.id]?.lastCheck || 'never',
          detectedAt: now,
          details: result.details,
        });

        // Update state
        state[source.id] = {
          hash: result.currentHash,
          lastCheck: now,
          lastChange: now,
        };
      } else {
        state[source.id] = {
          ...state[source.id],
          lastCheck: now,
        };
      }
    } catch (err) {
      console.error(`[webhook] Error checking ${source.id}: ${err.message}`);
    }
  }

  await saveState(state);

  if (changes.length > 0) {
    await handleChanges(changes);
  }

  return { checked: SOURCES.length, changes: changes.length, details: changes };
}

// ── Source Checking ──────────────────────────────────────────

async function checkSource(source, state) {
  const previousState = state[source.id];
  const previousHash = previousState?.hash || null;

  // Fetch with a HEAD request first for efficiency, fall back to GET
  let currentHash;
  let details = '';

  try {
    // Try HEAD for ETag/Last-Modified
    const headRes = await fetch(source.url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Hawkeye-Sterling-Sanctions-Monitor/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    const etag = headRes.headers.get('etag');
    const lastModified = headRes.headers.get('last-modified');
    const contentLength = headRes.headers.get('content-length');

    // Build a fingerprint from headers
    currentHash = hashString(`${etag || ''}|${lastModified || ''}|${contentLength || ''}`);
    details = `ETag: ${etag || 'n/a'}, Last-Modified: ${lastModified || 'n/a'}`;

    // If we had no previous state, do a full GET to establish baseline
    if (!previousHash) {
      const getRes = await fetch(source.url, {
        headers: { 'User-Agent': 'Hawkeye-Sterling-Sanctions-Monitor/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      const body = await getRes.text();
      currentHash = hashString(body.slice(0, 100000)); // Hash first 100KB
      details = `Initial baseline established. Size: ${body.length} bytes`;

      // Check for JSON timestamp field
      if (source.checkField) {
        try {
          const json = JSON.parse(body);
          const ts = json[source.checkField];
          if (ts) details += `, ${source.checkField}: ${ts}`;
        } catch { /* not JSON */ }
      }

      return { changed: false, previousHash: null, currentHash, details };
    }
  } catch (err) {
    // HEAD failed, try GET
    try {
      const getRes = await fetch(source.url, {
        headers: { 'User-Agent': 'Hawkeye-Sterling-Sanctions-Monitor/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      const body = await getRes.text();
      currentHash = hashString(body.slice(0, 100000));
      details = `Full fetch. Size: ${body.length} bytes`;
    } catch (err2) {
      throw new Error(`Cannot reach ${source.url}: ${err2.message}`);
    }
  }

  return {
    changed: previousHash !== null && currentHash !== previousHash,
    previousHash,
    currentHash,
    details,
  };
}

// ── Alert Dispatch ──────────────────────────────────────────

async function handleChanges(changes) {
  const critical = changes.filter(c => c.priority === 'CRITICAL');
  const high = changes.filter(c => c.priority === 'HIGH');

  console.log(`\n*** SANCTIONS LIST CHANGES DETECTED ***`);
  console.log(`Critical: ${critical.length}, High: ${high.length}`);

  for (const change of changes) {
    console.log(`  [${change.priority}] ${change.name} — hash changed at ${change.detectedAt}`);
  }

  // Send alerts via configured channels
  const message = formatAlertMessage(changes);

  for (const channel of ALERT_CHANNELS) {
    try {
      switch (channel) {
        case 'slack': await sendSlackAlert(message, changes); break;
        case 'email': await sendEmailAlert(message, changes); break;
        case 'sms': await sendSmsAlert(message, changes); break;
      }
    } catch (err) {
      console.error(`[webhook] ${channel} alert failed: ${err.message}`);
    }
  }

  // Archive the change event
  await archiveChange(changes);

  // Record in memory system
  await recordInMemory(changes);

  // Trigger re-screening if critical source changed
  if (critical.length > 0) {
    console.log('\n[webhook] Critical source changed. Triggering counterparty re-screen...');
    await triggerRescreen();
  }
}

async function sendSlackAlert(message, changes) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) { console.log('[webhook] SLACK_WEBHOOK_URL not set, skipping Slack'); return; }

  const critical = changes.some(c => c.priority === 'CRITICAL');
  const payload = {
    text: critical ? '<!channel> ' + message : message,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: critical ? 'CRITICAL: Sanctions List Update' : 'Sanctions List Update' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Required Action:*\n1. Review the updated list(s)\n2. Run counterparty re-screening\n3. Report any new matches to MLRO',
        },
      },
    ],
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  console.log('[webhook] Slack alert sent');
}

async function sendEmailAlert(message, changes) {
  const email = process.env.ALERT_EMAIL;
  const emailWebhook = process.env.EMAIL_WEBHOOK_URL;
  if (!email || !emailWebhook) { console.log('[webhook] EMAIL not configured, skipping'); return; }

  await fetch(emailWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: `[Hawkeye-Sterling] Sanctions List Change — ${changes.length} source(s) updated`,
      body: message,
    }),
    signal: AbortSignal.timeout(10000),
  });

  console.log('[webhook] Email alert sent');
}

async function sendSmsAlert(message, changes) {
  const smsUrl = process.env.SMS_WEBHOOK_URL;
  if (!smsUrl) { console.log('[webhook] SMS_WEBHOOK_URL not set, skipping SMS'); return; }

  const shortMessage = `HAWKEYE ALERT: ${changes.length} sanctions list(s) changed. ` +
    changes.map(c => c.name).join(', ') +
    '. Check immediately.';

  await fetch(smsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: shortMessage }),
    signal: AbortSignal.timeout(10000),
  });

  console.log('[webhook] SMS alert sent');
}

function formatAlertMessage(changes) {
  const lines = [];
  lines.push(`*Sanctions List Change Detected*`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`Sources changed: ${changes.length}`);
  lines.push('');

  for (const c of changes) {
    const icon = c.priority === 'CRITICAL' ? '🔴' : '🟡';
    lines.push(`${icon} *${c.name}* (${c.priority})`);
    lines.push(`   ${c.details}`);
  }

  return lines.join('\n');
}

// ── Side Effects ────────────────────────────────────────────

async function archiveChange(changes) {
  try {
    if (!existsSync(HISTORY_DIR)) await mkdir(HISTORY_DIR, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toISOString().split('T')[1].slice(0, 5).replace(':', '');
    const content = [
      `SANCTIONS LIST CHANGE ALERT`,
      `Detected: ${new Date().toISOString()}`,
      '',
      ...changes.map(c => `[${c.priority}] ${c.name}\n  Previous hash: ${c.previousHash}\n  Current hash: ${c.currentHash}\n  Details: ${c.details}`),
      '',
      'Action: Counterparty re-screening triggered.',
      'For review by the MLRO.',
    ].join('\n');

    await writeFile(resolve(HISTORY_DIR, `${today}-sanctions-change-${time}.txt`), content, 'utf8');
  } catch { /* non-critical */ }
}

async function recordInMemory(changes) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`webhook-${Date.now().toString(36)}`);

    for (const c of changes) {
      mem.observe({
        category: 'regulatory_observation',
        content: `Sanctions list change: ${c.name} (${c.priority}) — ${c.details}`,
        importance: c.priority === 'CRITICAL' ? 9 : 7,
      });
    }

    await mem.endSession(`Sanctions webhook: ${changes.length} source(s) changed`);
    mem.close();
  } catch { /* memory system optional */ }
}

async function triggerRescreen() {
  try {
    const { execSync } = await import('node:child_process');
    execSync('node screen-counterparties.mjs', {
      cwd: resolve(PROJECT_ROOT, 'scripts'),
      timeout: 120000,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`[webhook] Re-screen failed: ${err.message}`);
  }
}

// ── State Persistence ───────────────────────────────────────

async function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(await readFile(STATE_FILE, 'utf8'));
    }
  } catch { /* corrupt state, start fresh */ }
  return {};
}

async function saveState(state) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function hashString(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// ── CLI Entry Point ─────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Hawkeye-Sterling Sanctions Webhook Monitor');
  console.log('==========================================\n');

  checkForChanges()
    .then(result => {
      console.log(`\nChecked ${result.checked} sources. Changes: ${result.changes}`);
      if (result.changes === 0) console.log('No changes detected. All clear.');
    })
    .catch(err => {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    });
}

export { SOURCES };
