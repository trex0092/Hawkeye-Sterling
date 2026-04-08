#!/usr/bin/env node
/**
 * SessionEnd hook — runs when a Claude Code session ends.
 *
 * Responsibilities:
 *   1. Compress the session if observation count exceeds threshold.
 *   2. Generate and store a session summary.
 *   3. Close the database cleanly.
 */

import mem from '../index.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  // Check if there's an active session to close
  const recent = mem.recentSessions(1);
  if (recent.length === 0) {
    console.error('[claude-mem] No session to close.');
    process.exit(0);
  }

  const session = recent[0];
  if (session.ended_at) {
    console.error('[claude-mem] Session already ended.');
    process.exit(0);
  }

  // Read optional summary from stdin
  let summary = null;
  const chunks = [];
  try {
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500); // Don't hang waiting for stdin
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
    });
    const input = chunks.join('').trim();
    if (input) {
      try {
        const payload = JSON.parse(input);
        summary = payload.summary || payload.message || null;
      } catch {
        summary = input.length > 10 ? input : null;
      }
    }
  } catch {
    // stdin might not be available
  }

  // End session (triggers compression if above threshold)
  await mem.endSession(summary);

  const stats = mem.stats();
  console.error(
    `[claude-mem] Session ended. Total: ${stats.sessions} sessions, ` +
    `${stats.observations} observations, ${stats.summaries} summaries.`
  );
} catch (err) {
  console.error(`[claude-mem] session-end error: ${err.message}`);
  process.exit(0);
} finally {
  mem.close();
}
