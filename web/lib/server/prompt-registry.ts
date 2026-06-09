// Hawkeye Sterling — prompt registry.
//
// Centralises prompt identity tracking required by Federal Decree-Law No. 10 of 2025 Art.18 (every
// AI-generated compliance decision must be reproducible to the exact prompt
// version that produced it). The registry:
//   1. Stores each registered prompt's declared hash alongside its current
//      runtime hash so drift is detected immediately at module load.
//   2. Exposes getRegistrySnapshot() for the /api/ai-governance/prompts route.
//   3. validate() returns a list of drift violations; any caller may reject
//      requests when drift is present.
//
// Usage:
//   import { promptRegistry } from '@/lib/server/prompt-registry';
//   promptRegistry.register('SANCTIONS_SCREEN', { version: '1.0.0', text: PROMPT_TEXT });
//   const snapshot = promptRegistry.getRegistrySnapshot();

import { createHash } from 'node:crypto';

export interface PromptEntry {
  id: string;
  version: string;
  /** SHA-256 of the prompt text at registration time (first 16 hex chars). */
  hash: string;
  deployedAt: string;
  /** Route or module that owns this prompt. */
  owner?: string;
}

interface RegisterOpts {
  version: string;
  /** Actual prompt text — used to compute runtime hash. */
  text: string;
  deployedAt?: string;
  owner?: string;
  /** Pre-computed hash for prompts registered without the full text in this
   *  module (e.g. large system prompts kept in separate const files).
   *  When provided, hash is taken as-is and drift detection is skipped. */
  declaredHash?: string;
}

export interface RegistryEntry extends PromptEntry {
  /** Runtime hash computed from the text passed at register() time. */
  runtimeHash: string;
  /** True when declaredHash !== runtimeHash — indicates the prompt text
   *  changed without a corresponding version bump. */
  drifted: boolean;
}

function sha256slice(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

class PromptRegistry {
  private readonly _entries = new Map<string, RegistryEntry>();

  register(id: string, opts: RegisterOpts): void {
    const runtimeHash = sha256slice(opts.text);
    const declaredHash = opts.declaredHash ?? runtimeHash;
    const drifted = declaredHash !== runtimeHash;
    if (drifted) {
      console.warn(
        `[prompt-registry] DRIFT DETECTED id=${id} declared=${declaredHash} runtime=${runtimeHash} — ` +
        'bump the version and update the declared hash.',
      );
    }
    this._entries.set(id, {
      id,
      version: opts.version,
      hash: runtimeHash,
      deployedAt: opts.deployedAt ?? new Date().toISOString().slice(0, 10),
      owner: opts.owner,
      runtimeHash,
      drifted,
    });
  }

  get(id: string): RegistryEntry | undefined {
    return this._entries.get(id);
  }

  getHash(id: string): string | undefined {
    return this._entries.get(id)?.hash;
  }

  /** Returns all drift violations (prompt text changed without version bump). */
  validate(): Array<{ id: string; declaredHash: string; runtimeHash: string }> {
    const violations: Array<{ id: string; declaredHash: string; runtimeHash: string }> = [];
    for (const entry of this._entries.values()) {
      if (entry.drifted) {
        violations.push({ id: entry.id, declaredHash: entry.hash, runtimeHash: entry.runtimeHash });
      }
    }
    return violations;
  }

  getRegistrySnapshot(): RegistryEntry[] {
    return [...this._entries.values()];
  }

  get size(): number {
    return this._entries.size;
  }
}

// Module-level singleton — survives HMR in the same way as other singletons.
// eslint-disable-next-line no-var
declare global { var __hs_prompt_registry: PromptRegistry | undefined; }
export const promptRegistry: PromptRegistry =
  globalThis.__hs_prompt_registry ??
  (globalThis.__hs_prompt_registry = new PromptRegistry());
