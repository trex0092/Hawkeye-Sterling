// Hawkeye Sterling — adverse-media topic clustering.
//
// Instead of presenting 200+ articles as a single mass, group them by
// AML topic family (sanctions / fraud / corruption / money-laundering /
// terrorism / cyber / regulatory / etc.) so the operator sees the
// shape of risk at a glance. Same FATF predicate-offence taxonomy as
// amlKeywords.ts, applied as a classifier.

export interface ClusterArticle {
  title?: string;
  snippet?: string;
  url?: string;
  outlet?: string;
  publishedAt?: string;
}

export interface TopicCluster {
  topic: string;                  // sanctions / fraud / corruption / etc.
  count: number;
  articles: ClusterArticle[];
  outlets: string[];               // distinct outlets reporting this topic
  earliest?: string;
  latest?: string;
}

export interface TopicClusterResult {
  totalArticles: number;
  clusters: TopicCluster[];
  dominantTopic: string | null;
  topicDiversity: number;          // 0..1 — Shannon entropy normalised
  signal: string;
}

const TOPIC_PATTERNS: Array<{ topic: string; rx: RegExp }> = [
  { topic: "sanctions",        rx: /sanction|ofac|sdn|designat|blocked/i },
  { topic: "money-laundering", rx: /money.?launder|aml\b|kara para|lavagem|lavado|blanchi|geldwäsch|riciclag|отмыван/i },
  { topic: "fraud",            rx: /fraud|scam|ponzi|embezz|forgery|misrepresentation|deceit/i },
  { topic: "corruption",       rx: /corrupt|brib|kickback|kleptocra|sleaze|graft|rüşvet|взятка/i },
  { topic: "terrorism",        rx: /terror|militan|extremis|isis|al.?qaeda|haqqani|fto/i },
  { topic: "law-enforcement",  rx: /arrest|indict|convict|guilty|jailed|imprison|prosecut|tutuklan|preso|detenido|arrêté|verhaftet|اعتقال|arrestat|арест/i },
  { topic: "regulatory",       rx: /regulator|enforcement|fine|sanction.?against|consent.?order|cease.?and.?desist|debar|disgorge|attorney.?general/i },
  { topic: "drug-trafficking", rx: /narcotic|drug.?traffic|cartel|cocaine|heroin|opioid/i },
  { topic: "human-trafficking",rx: /human.?traffic|forced.?labour|forced.?labor|modern.?slavery|smuggl/i },
  { topic: "cyber",            rx: /cybercrime|ransomware|darknet|hack|breach|phish|malware/i },
  { topic: "tax-evasion",      rx: /tax.?evas|tax.?fraud|vat.?fraud|undeclared|undisclosed.?income|panama.?papers|paradise.?papers|pandora.?papers/i },
  { topic: "market-manip",     rx: /insider.?trading|market.?manipulation|short.?seller|accounting.?fraud|securities.?fraud|wirecard|enron/i },
  { topic: "pep",              rx: /politically.?exposed|head.?of.?state|minister|parliament|ambassador|state.?owned/i },
  { topic: "investigation",    rx: /investigation|probe|inquiry|raid|searched|seized|confiscat|dawn.?raid/i },
  { topic: "lawsuit",          rx: /lawsuit|class.?action|sued|filed.?suit|litigation|complaint/i },
  { topic: "weapons",          rx: /weapons|arms.?traffic|smuggl.?weapon|nuclear|wmd|dual.?use|proliferat/i },
];

function classify(text: string): string[] {
  const matches: string[] = [];
  for (const p of TOPIC_PATTERNS) {
    if (p.rx.test(text)) matches.push(p.topic);
  }
  return matches.length > 0 ? matches : ["adverse-media"];
}

export function clusterAdverseMedia(articles: ClusterArticle[]): TopicClusterResult {
  if (articles.length === 0) {
    return { totalArticles: 0, clusters: [], dominantTopic: null, topicDiversity: 0,
      signal: "No adverse-media articles to cluster." };
  }
  const buckets = new Map<string, TopicCluster>();
  for (const a of articles) {
    const text = `${a.title ?? ""} ${a.snippet ?? ""}`;
    const topics = classify(text);
    for (const topic of topics) {
      const b = buckets.get(topic) ?? { topic, count: 0, articles: [], outlets: [], earliest: undefined, latest: undefined };
      b.count += 1;
      b.articles.push(a);
      if (a.outlet && !b.outlets.includes(a.outlet)) b.outlets.push(a.outlet);
      if (a.publishedAt) {
        if (!b.earliest || a.publishedAt < b.earliest) b.earliest = a.publishedAt;
        if (!b.latest || a.publishedAt > b.latest) b.latest = a.publishedAt;
      }
      buckets.set(topic, b);
    }
  }
  const clusters = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const dominantTopic = clusters[0]?.topic ?? null;

  // Shannon entropy on topic distribution → 0=single topic, 1=evenly distributed
  const total = clusters.reduce((s, c) => s + c.count, 0);
  let entropy = 0;
  for (const c of clusters) {
    const p = c.count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(Math.max(1, clusters.length));
  const topicDiversity = maxEntropy > 0 ? entropy / maxEntropy : 0;

  let signal: string;
  if (clusters.length === 1) {
    signal = `Single risk theme: ${dominantTopic} (${clusters[0]!.count} articles across ${clusters[0]!.outlets.length} outlets).`;
  } else if (topicDiversity > 0.7) {
    signal = `Highly diverse risk profile: ${clusters.length} themes, no dominant pattern. Manual review of each cluster recommended.`;
  } else {
    signal = `Risk concentrates on ${dominantTopic} (${clusters[0]!.count}/${total} articles); secondary themes: ${clusters.slice(1, 3).map((c) => c.topic).join(", ")}.`;
  }

  return {
    totalArticles: total,
    clusters: clusters.map((c) => ({ ...c, articles: c.articles.slice(0, 5) })),  // cap per cluster for response size
    dominantTopic,
    topicDiversity: Math.round(topicDiversity * 100) / 100,
    signal,
  };
}
