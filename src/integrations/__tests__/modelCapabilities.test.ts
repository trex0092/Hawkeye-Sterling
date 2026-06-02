import { describe, expect, it } from 'vitest';
import { supportsAdaptiveThinking } from '../modelCapabilities.js';

describe('supportsAdaptiveThinking', () => {
  it('rejects Haiku model ids (Anthropic 400s the request)', () => {
    expect(supportsAdaptiveThinking('claude-haiku-4-5-20251001')).toBe(false);
    expect(supportsAdaptiveThinking('claude-haiku-4-5')).toBe(false);
    expect(supportsAdaptiveThinking('claude-3-5-haiku-20241022')).toBe(false);
    expect(supportsAdaptiveThinking('CLAUDE-HAIKU-4-5')).toBe(false);
  });

  it('accepts Sonnet and Opus model ids', () => {
    expect(supportsAdaptiveThinking('claude-sonnet-4-6')).toBe(true);
    expect(supportsAdaptiveThinking('claude-opus-4-7')).toBe(true);
    expect(supportsAdaptiveThinking('claude-opus-4-8')).toBe(true);
  });

  it('rejects empty / falsy model ids fail-closed', () => {
    expect(supportsAdaptiveThinking('')).toBe(false);
  });
});
