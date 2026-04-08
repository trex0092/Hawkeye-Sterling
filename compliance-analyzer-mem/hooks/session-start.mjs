#!/usr/bin/env node
/**
 * SessionStart hook for Compliance Analyzer.
 */

import mem from '../index.mjs';
import { promoteToArchive } from '../context/compressor.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  mem.startSession(sessionId);
  try { promoteToArchive(5); } catch { /* non-critical */ }

  const ctx = mem.loadContext({ sessionId });
  console.log(ctx.combined);

  if (ctx.tokens > 0) {
    console.error(`[claude-mem] Session ${sessionId.slice(0, 8)} started. Injected ${ctx.tokens} tokens.`);
  } else {
    console.error(`[claude-mem] Session ${sessionId.slice(0, 8)} started. No prior context.`);
  }
} catch (err) {
  console.error(`[claude-mem] session-start error: ${err.message}`);
  process.exit(0);
} finally {
  mem.close();
}
