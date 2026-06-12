import { describe, expect, it } from 'vitest';
import { supportsAdaptiveThinking, supportsEffort } from '../modelCapabilities.js';

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

describe('supportsEffort', () => {
  it('rejects Haiku model ids (Anthropic 400s the effort parameter)', () => {
    expect(supportsEffort('claude-haiku-4-5-20251001')).toBe(false);
    expect(supportsEffort('claude-haiku-4-5')).toBe(false);
    expect(supportsEffort('CLAUDE-HAIKU-4-5')).toBe(false);
  });

  it('rejects Sonnet 4.5 and older / Opus 4.1 and older', () => {
    expect(supportsEffort('claude-sonnet-4-5-20250929')).toBe(false);
    expect(supportsEffort('claude-sonnet-4-0')).toBe(false);
    expect(supportsEffort('claude-opus-4-1')).toBe(false);
    expect(supportsEffort('claude-opus-4-0')).toBe(false);
    expect(supportsEffort('claude-3-5-sonnet-20241022')).toBe(false);
  });

  it('accepts Opus 4.5+, Sonnet 4.6+, and Fable/Mythos ids', () => {
    expect(supportsEffort('claude-opus-4-5-20251101')).toBe(true);
    expect(supportsEffort('claude-opus-4-6')).toBe(true);
    expect(supportsEffort('claude-opus-4-7')).toBe(true);
    expect(supportsEffort('claude-opus-4-8')).toBe(true);
    expect(supportsEffort('claude-sonnet-4-6')).toBe(true);
    expect(supportsEffort('claude-fable-5')).toBe(true);
    expect(supportsEffort('claude-mythos-5')).toBe(true);
  });

  it('rejects non-Anthropic and empty ids fail-closed', () => {
    expect(supportsEffort('llama-3.1-8b-instant')).toBe(false);
    expect(supportsEffort('')).toBe(false);
  });
});
