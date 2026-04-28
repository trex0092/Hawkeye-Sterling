import { describe, it, expect } from 'vitest';
import { buildTopicGraph, buildQuestionGraph } from '../knowledge-graph.js';
import { ALL_MLRO_TOPICS } from '../mlro-question-classifier.js';

describe('knowledge-graph — buildTopicGraph', () => {
  it('returns a non-empty graph centered on the topic for every MlroTopic', () => {
    for (const topic of ALL_MLRO_TOPICS) {
      const g = buildTopicGraph(topic);
      expect(g.centralNode).toBe(`topic:${topic}`);
      expect(g.nodes.length).toBeGreaterThan(1);
      expect(g.nodes.some((n) => n.kind === 'topic' && n.id === topic)).toBe(true);
    }
  });

  it('emits second-hop FATF pillar siblings disjoint from primary FATF hits', () => {
    const g = buildTopicGraph('cdd');
    const fatfNodes = g.nodes.filter((n) => n.kind === 'fatf');
    expect(fatfNodes.length).toBeGreaterThan(0);
    // At least one fatf-to-fatf edge proves the second-hop fired.
    const f2fEdges = g.edges.filter((e) => e.from.startsWith('fatf:') && e.to.startsWith('fatf:'));
    expect(f2fEdges.length).toBeGreaterThan(0);
  });

  it('emits second-hop doctrine authority siblings (the docstring promise)', () => {
    // CDD pulls multiple UAE FDL doctrines — at least one authority must
    // surface a sibling doctrine via the second-hop walk.
    const g = buildTopicGraph('cdd');
    const d2dEdges = g.edges.filter(
      (e) => e.from.startsWith('doctrine:') && e.to.startsWith('doctrine:'),
    );
    expect(d2dEdges.length).toBeGreaterThan(0);
  });

  it('deduplicates nodes (no two nodes share the same kind+id)', () => {
    const g = buildTopicGraph('sanctions_screening');
    const keys = g.nodes.map((n) => `${n.kind}:${n.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('typology nodes carry displayName as label and describes as detail', () => {
    const g = buildTopicGraph('vasp_crypto');
    const typo = g.nodes.find((n) => n.kind === 'typology');
    if (typo) {
      // label is the typology displayName, not the bare id (no underscores).
      expect(typo.label).not.toBe(typo.id);
      expect(typeof typo.label).toBe('string');
    }
  });
});

describe('knowledge-graph — buildQuestionGraph', () => {
  it('union-merges the top-3 topic graphs and keeps centralNode on primary', () => {
    const g = buildQuestionGraph('CDD for a UAE gold trader (DPMS) — ongoing monitoring cadence?');
    expect(g.centralNode).toMatch(/^topic:/);
    expect(g.nodes.length).toBeGreaterThan(3);
    // Every node key is unique after the merge dedup pass.
    const keys = g.nodes.map((n) => `${n.kind}:${n.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns a usable graph for a vague question (general_compliance fallback)', () => {
    const g = buildQuestionGraph('what is compliance?');
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.centralNode).toMatch(/^topic:/);
  });
});
