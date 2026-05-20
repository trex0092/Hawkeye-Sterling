import { describe, it, expect } from 'vitest';
// Import from the pure llm-parse module to avoid pulling the Next.js runtime
// into the test graph. mlro-route-base re-exports these for backward compat
// with route-side imports.
import { stripJsonFences, parseLlmJson, firstTextBlock } from '../llm-parse';

interface Sample {
  decision: string;
  confidence: number;
}

describe('stripJsonFences', () => {
  it('removes ```json ... ``` fences and trims', () => {
    const text = '```json\n{"decision":"FILE_STR","confidence":0.92}\n```';
    expect(stripJsonFences(text)).toBe('{"decision":"FILE_STR","confidence":0.92}');
  });

  it('removes ``` (no language) fences', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('is a no-op when no fences are present', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });

  it('handles trailing whitespace', () => {
    expect(stripJsonFences('  {"a":1}  \n')).toBe('{"a":1}');
  });
});

describe('parseLlmJson — happy path', () => {
  it('parses a bare JSON object', () => {
    const r = parseLlmJson<Sample>('{"decision":"FILE_STR","confidence":0.92}');
    expect(r).toEqual({ decision: 'FILE_STR', confidence: 0.92 });
  });

  it('parses fence-wrapped JSON', () => {
    const r = parseLlmJson<Sample>('```json\n{"decision":"FILE_STR","confidence":0.92}\n```');
    expect(r).toEqual({ decision: 'FILE_STR', confidence: 0.92 });
  });

  it('parses fence-wrapped JSON with language tag missing', () => {
    const r = parseLlmJson<Sample>('```\n{"decision":"MONITOR","confidence":0.5}\n```');
    expect(r).toEqual({ decision: 'MONITOR', confidence: 0.5 });
  });
});

describe('parseLlmJson — prose-wrapped (the production-observed failure mode)', () => {
  it('extracts the JSON object when the model prepends prose', () => {
    const text = 'Based on the risk signals, here is the escalation decision:\n\n{"decision":"FILE_STR","confidence":0.92}\n\nThis decision is mandated by FDL Art.26.';
    const r = parseLlmJson<Sample>(text);
    expect(r).toEqual({ decision: 'FILE_STR', confidence: 0.92 });
  });

  it('extracts JSON when the model appends a closing remark', () => {
    const text = '{"decision":"ESCALATE_INTERNAL","confidence":0.78}\n\nReady for MLRO review.';
    const r = parseLlmJson<Sample>(text);
    expect(r).toEqual({ decision: 'ESCALATE_INTERNAL', confidence: 0.78 });
  });

  it('extracts JSON when wrapped in both fences AND prose', () => {
    const text = "Sure! Here's the JSON:\n\n```json\n{\"decision\":\"CLEAR\",\"confidence\":0.95}\n```\n\nLet me know if you need anything else.";
    const r = parseLlmJson<Sample>(text);
    expect(r).toEqual({ decision: 'CLEAR', confidence: 0.95 });
  });

  it('extracts the outermost balanced object even when nested objects exist', () => {
    const text = 'Here is the result:\n{"decision":"FILE_STR","meta":{"basis":"FDL Art.26"},"confidence":0.92}\nDone.';
    const r = parseLlmJson<{ decision: string; meta: { basis: string }; confidence: number }>(text);
    expect(r).toEqual({ decision: 'FILE_STR', meta: { basis: 'FDL Art.26' }, confidence: 0.92 });
  });
});

describe('parseLlmJson — defensive failure modes', () => {
  it('returns null when no JSON object is present', () => {
    expect(parseLlmJson<Sample>('I am not able to comply with that request.')).toBeNull();
  });

  it('returns null on truncated JSON (no closing brace)', () => {
    expect(parseLlmJson<Sample>('{"decision":"FILE_STR","confidence":')).toBeNull();
  });

  it('returns null on syntactically invalid JSON inside a balanced { ... }', () => {
    expect(parseLlmJson<Sample>('Here: {decision: FILE_STR confidence: 0.9}')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseLlmJson<Sample>('')).toBeNull();
  });

  it('returns null when only fences are present', () => {
    expect(parseLlmJson<Sample>('```json\n```')).toBeNull();
  });
});

describe('firstTextBlock', () => {
  it('returns the first text-block string from an Anthropic content array', () => {
    const content = [
      { type: 'text', text: '{"a":1}' },
      { type: 'text', text: 'second block' },
    ];
    expect(firstTextBlock(content)).toBe('{"a":1}');
  });

  it('skips non-text blocks (e.g., thinking)', () => {
    const content = [
      { type: 'thinking', thinking: 'pondering...' },
      { type: 'text', text: 'real-answer' },
    ];
    expect(firstTextBlock(content)).toBe('real-answer');
  });

  it('returns "{}" defensively when content is not an array', () => {
    expect(firstTextBlock(null)).toBe('{}');
    expect(firstTextBlock(undefined)).toBe('{}');
    expect(firstTextBlock('not-array')).toBe('{}');
  });

  it('returns "{}" when no text block exists', () => {
    expect(firstTextBlock([{ type: 'thinking', thinking: '...' }])).toBe('{}');
  });

  it('returns "{}" when content is an empty array', () => {
    expect(firstTextBlock([])).toBe('{}');
  });
});
