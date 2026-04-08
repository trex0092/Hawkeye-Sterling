#!/usr/bin/env node
/**
 * SessionStart hook — runs when a Claude Code session begins.
 *
 * Responsibilities:
 *   1. Create a new session record in the memory DB.
 *   2. Load tiered context (L0/L1/L2) and print it so Claude Code
 *      sees it as part of the session context.
 *   3. Promote old L1 summaries to L2 archive.
 *
 * Registered in .claude/settings.json as a PreToolUse or session hook.
 */

import mem from '../index.mjs';
import { promoteToArchive } from '../context/compressor.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  // Start session
  mem.startSession(sessionId);

  // Promote old summaries to archive tier
  try {
    promoteToArchive(5);
  } catch {
    // Non-critical
  }

  // Load and inject context
  const ctx = mem.loadContext({ sessionId });

  // Output to stdout — Claude Code will see this as session context
  console.log(ctx.combined);

  if (ctx.tokens > 0) {
    console.error(`[claude-mem] Session ${sessionId.slice(0, 8)} started. Injected ${ctx.tokens} tokens of context.`);
  } else {
    console.error(`[claude-mem] Session ${sessionId.slice(0, 8)} started. No prior context available.`);
  }
} catch (err) {
  console.error(`[claude-mem] session-start error: ${err.message}`);
  process.exit(0); // Don't block the session on memory errors
} finally {
  mem.close();
}
