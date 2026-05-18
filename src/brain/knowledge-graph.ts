// Hawkeye Sterling — cross-reference knowledge graph.
//
// Given any starting node (topic / doctrine / FATF Recommendation /
// playbook / typology / red flag / jurisdiction), returns the connected
// network of related nodes — so the advisor / Brain UI can surface the
// "what else applies to this question" panel without rerunning the
// classifier.
//
// The graph is built lazily from the existing maps (no separate registry
// of edges to maintain) so every classifier-side update propagates here.

import { TYPOLOGIES } from './typologies.js';
import { DOCTRINES } from './doctrines.js';
import { FATF_RECOMMENDATIONS } from './fatf-recommendations.js';
import { COMMON_SENSE_RULES } from './mlro-common-sense.js';
import { classifyMlroQuestion, type MlroTopic } from './mlro-question-classifier.js';

export type KgNodeKind =
  | 'topic'
  | 'doctrine'
  | 'fatf'
  | 'playbook'
  | 'typology'
  | 'red_flag'
  | 'jurisdiction'
  | 'regime'
  | 'common_sense_rule';

export interface KgNode {
  kind: KgNodeKind;
  id: string;
  label: string;
  detail?: string;
}

export interface KgEdge {
  from: string;        // `${kind}:${id}`
  to: string;          // `${kind}:${id}`
  weight: number;      // 0..1
}

export interface KgGraph {
  nodes: KgNode[];
  edges: KgEdge[];
  centralNode: string; // `${kind}:${id}` of the queried node
}

const nk = (kind: KgNodeKind, id: string): string => `${kind}:${id}`;

/**
 * Build the connected sub-graph centered on a topic. Walks one hop into the
 * topic's doctrines, FATF Recs, playbooks, typologies, red flags, then a
 * second hop FATF→pillar siblings (top 3) and doctrine→authority siblings
 * (top 3) so the operator sees breadth without flooding the UI.
 */
export function buildTopicGraph(topic: MlroTopic): KgGraph {
  // Use the classifier on a synthetic prompt to get hint sets without
  // duplicating maps. The empty-narrative path still returns hints.
  const probe = classifyMlroQuestion(`topic ${topic.replace(/_/g, ' ')}`);
  const center = nk('topic', topic);

  const nodes = new Map<string, KgNode>();
  const edges: KgEdge[] = [];

  nodes.set(center, {
    kind: 'topic',
    id: topic,
    label: topic.replace(/_/g, ' '),
  });

  for (const d of probe.doctrineHints) {
    const doc = DOCTRINES.find((x) => x.id === d);
    nodes.set(nk('doctrine', d), {
      kind: 'doctrine',
      id: d,
      label: doc?.title ?? d,
      ...(doc?.authority !== undefined ? { detail: doc.authority } : {}),
    });
    edges.push({ from: center, to: nk('doctrine', d), weight: 0.9 });
  }

  for (const fid of probe.fatfRecHints) {
    const f = FATF_RECOMMENDATIONS.find((r) => r.id === fid);
    nodes.set(nk('fatf', fid), {
      kind: 'fatf',
      id: fid,
      label: f ? `R.${f.num} ${f.title}` : fid,
      ...(f?.citation !== undefined ? { detail: f.citation } : {}),
    });
    edges.push({ from: center, to: nk('fatf', fid), weight: 0.9 });
  }

  for (const p of probe.playbookHints) {
    nodes.set(nk('playbook', p), { kind: 'playbook', id: p, label: p.replace(/^pb_/, '').replace(/_/g, ' ') });
    edges.push({ from: center, to: nk('playbook', p), weight: 0.7 });
  }

  for (const rf of probe.redFlagHints) {
    nodes.set(nk('red_flag', rf), { kind: 'red_flag', id: rf, label: rf.replace(/^rf_/, '').replace(/_/g, ' ') });
    edges.push({ from: center, to: nk('red_flag', rf), weight: 0.6 });
  }

  for (const t of probe.typologies) {
    const ty = TYPOLOGIES.find((x) => x.id === t);
    nodes.set(nk('typology', t), {
      kind: 'typology',
      id: t,
      label: ty?.displayName ?? t,
      ...(ty?.describes !== undefined ? { detail: ty.describes } : {}),
    });
    edges.push({ from: center, to: nk('typology', t), weight: 0.8 });
  }

  // Second-hop: FATF → pillar siblings (top 3 unique).
  const pillarsCovered = new Set<string>();
  for (const fid of probe.fatfRecHints) {
    const f = FATF_RECOMMENDATIONS.find((r) => r.id === fid);
    if (!f || pillarsCovered.has(f.pillar)) continue;
    pillarsCovered.add(f.pillar);
    const siblings = FATF_RECOMMENDATIONS
      .filter((r) => r.pillar === f.pillar && r.id !== fid)
      .slice(0, 2);
    for (const s of siblings) {
      const key = nk('fatf', s.id);
      if (!nodes.has(key)) {
        nodes.set(key, { kind: 'fatf', id: s.id, label: `R.${s.num} ${s.title}`, detail: s.citation });
        edges.push({ from: nk('fatf', fid), to: key, weight: 0.4 });
      }
    }
  }

  // Second-hop: doctrine → authority siblings (top 2 per authority). Lets the
  // operator see "what other doctrines from the same regulator/standard apply",
  // e.g. surfacing all UAE FDL doctrines once one is hit.
  const authoritiesCovered = new Set<string>();
  for (const d of probe.doctrineHints) {
    const doc = DOCTRINES.find((x) => x.id === d);
    if (!doc?.authority || authoritiesCovered.has(doc.authority)) continue;
    authoritiesCovered.add(doc.authority);
    const siblings = DOCTRINES
      .filter((x) => x.authority === doc.authority && x.id !== d)
      .slice(0, 2);
    for (const s of siblings) {
      const key = nk('doctrine', s.id);
      if (!nodes.has(key)) {
        nodes.set(key, {
          kind: 'doctrine',
          id: s.id,
          label: s.title,
          ...(s.authority !== undefined ? { detail: s.authority } : {}),
        });
        edges.push({ from: nk('doctrine', d), to: key, weight: 0.4 });
      }
    }
  }

  // Common-sense rules (5 max for the centre topic).
  const rules = COMMON_SENSE_RULES.filter((r) => r.topic === topic).slice(0, 5);
  for (const r of rules) {
    nodes.set(nk('common_sense_rule', r.id), {
      kind: 'common_sense_rule',
      id: r.id,
      label: r.rule.length > 80 ? `${r.rule.slice(0, 80)}…` : r.rule,
      detail: r.doctrineAnchor,
    });
    edges.push({ from: center, to: nk('common_sense_rule', r.id), weight: 0.5 });
  }

  return {
    nodes: [...nodes.values()],
    edges,
    centralNode: center,
  };
}

/**
 * For a free-form question, build the union of topic graphs for the top-3
 * topics — gives the operator the "everything the brain saw" view in one
 * payload, useful for the after-answer panel.
 */
export function buildQuestionGraph(question: string): KgGraph {
  const a = classifyMlroQuestion(question);
  const top = a.topics.slice(0, 3);

  const merged: KgGraph = {
    nodes: [],
    edges: [],
    centralNode: nk('topic', a.primaryTopic),
  };
  const seen = new Set<string>();
  for (const t of top) {
    const g = buildTopicGraph(t);
    for (const n of g.nodes) {
      const key = nk(n.kind, n.id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.nodes.push(n);
    }
    merged.edges.push(...g.edges);
  }
  return merged;
}
