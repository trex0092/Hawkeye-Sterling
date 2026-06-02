// Hawkeye Sterling — Story Engine (Taranis story_bot.py analog).
// Within each ArticleGroup, detects articles that describe the same developing
// news event and fuses them into a Story with a headline, article timeline,
// deduplicated entity list, and confidence score.
//
// Distinct from deduplication (which removes identical copies): StoryEngine
// groups articles with unique content that cover the same underlying event.
//
// Algorithm (union-find):
//   Two articles are "same story" if, within MAX_STORY_WINDOW_DAYS:
//     · they share ≥ MIN_SHARED_ENTITIES named persons or organisations, OR
//     · their titles share ≥ 35% of non-trivial tokens (title similarity)
//   Transitively connected articles form one Story.
//
// Headline = title of the article with the most extracted entities (richest coverage).

import type { OsintItem } from '../integrations/osint-pipeline.js';
import type { NLPExtractionResult } from './AdverseMediaNLP.js';
import type { ArticleGroup } from './ArticleGroupingEngine.js';

export interface StoryArticle {
  id: string;
  title: string;
  source: string;
  publishedAt?: string | undefined;
  url?: string | undefined;
}

export interface Story {
  storyId: string;
  headline: string;
  groupId: string;
  articles: StoryArticle[];         // sorted oldest → newest
  entities: string[];               // deduplicated across all articles
  firstSeen: string;                // ISO 8601
  lastUpdated: string;              // ISO 8601
  confidence: number;               // 0..1
}

const MIN_SHARED_ENTITIES = 1;
// AML investigations routinely span 12-18 months (arrest → charge → conviction);
// 365 days lets StoryEngine track the full lifecycle of one case as one story.
const MAX_STORY_WINDOW_DAYS = 365;
const TITLE_SIM_THRESHOLD = 0.35;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him',
  'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two',
  'who', 'did', 'let', 'put', 'say', 'she', 'too', 'use',
]);

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3 && !STOP_WORDS.has(t)),
  );
}

function titleSimilarity(a: string, b: string): number {
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) { if (tb.has(t)) shared++; }
  return shared / Math.max(ta.size, tb.size);
}

function entityOverlap(
  aNlp: NLPExtractionResult | undefined,
  bNlp: NLPExtractionResult | undefined,
): number {
  if (!aNlp || !bNlp) return 0;
  const aNames = new Set([
    ...aNlp.persons.map(p => p.name.toLowerCase()),
    ...aNlp.entities.map(e => e.name.toLowerCase()),
  ]);
  const bNames = new Set([
    ...bNlp.persons.map(p => p.name.toLowerCase()),
    ...bNlp.entities.map(e => e.name.toLowerCase()),
  ]);
  let overlap = 0;
  for (const n of aNames) { if (bNames.has(n)) overlap++; }
  return overlap;
}

function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

// ── Union-Find ───────────────────────────────────────────────────────────────

function makeUF(ids: string[]): Map<string, string> {
  return new Map(ids.map(id => [id, id]));
}

function find(parent: Map<string, string>, x: string): string {
  if (parent.get(x) !== x) parent.set(x, find(parent, parent.get(x)!));
  return parent.get(x)!;
}

function union(parent: Map<string, string>, x: string, y: string): void {
  const rx = find(parent, x), ry = find(parent, y);
  if (rx !== ry) parent.set(rx, ry);
}

// ── Story building ────────────────────────────────────────────────────────────

function buildStoriesForGroup(
  group: ArticleGroup,
  itemMap: Map<string, OsintItem>,
  nlpMap: Map<string, NLPExtractionResult>,
): Story[] {
  const ids = group.articleIds;
  if (ids.length === 0) return [];

  const parent = makeUF(ids);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = itemMap.get(ids[i]!);
      const b = itemMap.get(ids[j]!);
      if (!a || !b) continue;

      const days = daysBetween(a.publishedAt, b.publishedAt);
      if (days > MAX_STORY_WINDOW_DAYS) continue;

      const aNlp = nlpMap.get(ids[i]!);
      const bNlp = nlpMap.get(ids[j]!);
      const sameStory =
        entityOverlap(aNlp, bNlp) >= MIN_SHARED_ENTITIES ||
        titleSimilarity(a.title, b.title) >= TITLE_SIM_THRESHOLD;

      if (sameStory) union(parent, ids[i]!, ids[j]!);
    }
  }

  // Collect clusters
  const clusters = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(parent, id);
    const bucket = clusters.get(root) ?? [];
    bucket.push(id);
    clusters.set(root, bucket);
  }

  const stories: Story[] = [];
  let idx = 0;

  for (const cluster of clusters.values()) {
    const arts: StoryArticle[] = cluster
      .flatMap(id => {
        const item = itemMap.get(id);
        if (!item) return [];
        return [{ id, title: item.title, source: item.source, publishedAt: item.publishedAt, url: item.url } satisfies StoryArticle];
      })
      .sort((a, b) => {
        if (!a.publishedAt || !b.publishedAt) return 0;
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      });

    if (arts.length === 0) continue;

    // Headline from article with most extracted entities
    const richest = cluster
      .map(id => {
        const nlp = nlpMap.get(id);
        return { id, count: (nlp?.persons.length ?? 0) + (nlp?.entities.length ?? 0) };
      })
      .sort((a, b) => b.count - a.count)[0];
    const headline = richest ? (itemMap.get(richest.id)?.title ?? arts[0]!.title) : arts[0]!.title;

    // Aggregate entity names across cluster
    const allEntities = new Set<string>();
    for (const id of cluster) {
      const nlp = nlpMap.get(id);
      if (!nlp) continue;
      for (const p of nlp.persons)  allEntities.add(p.name);
      for (const e of nlp.entities) allEntities.add(e.name);
    }

    const dates = arts.map(a => a.publishedAt).filter((d): d is string => Boolean(d));
    const now = new Date().toISOString();
    const firstSeen   = dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : now;
    const lastUpdated = dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : now;

    stories.push({
      storyId: `story_${group.groupId}_${idx++}`,
      headline,
      groupId: group.groupId,
      articles: arts,
      entities: Array.from(allEntities),
      firstSeen,
      lastUpdated,
      confidence: cluster.length === 1 ? 0.5 : Math.min(1, 0.4 + cluster.length * 0.12),
    });
  }

  return stories;
}

/** Build all stories across all article groups.
 *  Never throws — returns [] on any internal error. */
export function buildStories(
  groups: ArticleGroup[],
  items: OsintItem[],
  nlpResults: Map<string, NLPExtractionResult>,
): Story[] {
  try {
    const itemMap = new Map(items.map(i => [i.id, i]));
    return groups.flatMap(g => buildStoriesForGroup(g, itemMap, nlpResults));
  } catch {
    return [];
  }
}
