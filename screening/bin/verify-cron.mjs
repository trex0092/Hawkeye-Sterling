#!/usr/bin/env node
/**
 * Scheduled audit chain verification.
 *
 * Verifies the integrity of the hash-chained audit log and reports results.
 * Designed to run as a daily cron job (via GitHub Actions or system cron).
 *
 * Exit codes:
 *   0 — chain is valid
 *   1 — chain is broken (tampering detected or corruption)
 *   2 — verification could not run (missing files, config errors)
 *
 * If SLACK_WEBHOOK_URL is set, posts an alert on chain break.
 * If ALERT_EMAIL is set, logs the alert for email pickup.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

async function main() {
  console.log('[verify-cron] Starting audit chain verification...');
  const startTime = Date.now();

  try {
    // Import and init screening module
    const screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();

    // Run verification
    const result = await screening.verify();
    const elapsed = Date.now() - startTime;

    if (result.ok) {
      console.log(`[verify-cron] PASS: ${result.entries} entries verified in ${elapsed}ms`);
      await writeReport('PASS', result, elapsed);
      process.exit(0);
    } else {
      console.error(`[verify-cron] FAIL: Chain broken at seq ${result.break.seq} — ${result.break.reason}`);
      console.error(`[verify-cron] Verified ${result.entries} entries before break`);
      await writeReport('FAIL', result, elapsed);
      await sendAlert(result);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[verify-cron] ERROR: ${err.message}`);
    await writeReport('ERROR', { error: err.message }, Date.now() - startTime);
    process.exit(2);
  }
}

async function writeReport(status, result, elapsed) {
  const reportDir = resolve(PROJECT_ROOT, 'history', 'registers', 'audit-verification');
  if (!existsSync(reportDir)) await mkdir(reportDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const report = {
    date: today,
    timestamp: new Date().toISOString(),
    status,
    entries: result.entries || 0,
    break: result.break || null,
    error: result.error || null,
    elapsedMs: elapsed,
  };

  await writeFile(
    resolve(reportDir, `${today}.json`),
    JSON.stringify(report, null, 2),
    'utf8'
  );
}

async function sendAlert(result) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[verify-cron] No SLACK_WEBHOOK_URL set — alert not sent');
    return;
  }

  const payload = {
    text: `:rotating_light: *AUDIT CHAIN INTEGRITY FAILURE*\n` +
          `Chain broken at sequence ${result.break.seq}\n` +
          `Reason: ${result.break.reason}\n` +
          `Entries verified before break: ${result.entries}\n` +
          `Immediate investigation required by MLRO.`,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[verify-cron] Slack alert failed: HTTP ${res.status}`);
    else console.log('[verify-cron] Slack alert sent');
  } catch (err) {
    console.error(`[verify-cron] Slack alert failed: ${err.message}`);
  }
}

main();
