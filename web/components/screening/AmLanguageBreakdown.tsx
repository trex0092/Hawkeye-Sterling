"use client";

interface Article {
  lang?: string;
  severity?: "clear" | "low" | "medium" | "high" | "critical";
}

interface Props {
  articles: Article[];
}

const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, clear: 0 };
const SEV_TONE: Record<string, string> = {
  critical: "bg-red text-white",
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-amber-dim text-amber",
  clear: "bg-green-dim text-green",
};

// Per-language severity counter. The dossier panel already shows
// "Languages: ar, ru, fr" but doesn't tell the analyst whether the
// CRITICAL severity came from a non-English source — which is often the
// regulator-relevant signal. This breakdown surfaces the worst severity
// per language and the count of articles in that bucket.
export function AmLanguageBreakdown({ articles }: Props) {
  if (articles.length === 0) return null;

  const byLang: Record<string, { lang: string; counts: Record<string, number>; worst: string }> = {};
  for (const a of articles) {
    const lang = (a.lang ?? "??").toLowerCase().slice(0, 4) || "??";
    const sev = a.severity ?? "low";
    if (!byLang[lang]) byLang[lang] = { lang, counts: {}, worst: "clear" };
    byLang[lang].counts[sev] = (byLang[lang].counts[sev] ?? 0) + 1;
    if ((SEV_ORDER[sev] ?? 0) > (SEV_ORDER[byLang[lang].worst] ?? 0)) {
      byLang[lang].worst = sev;
    }
  }
  const rows = Object.values(byLang).sort(
    (a, b) => (SEV_ORDER[b.worst] ?? 0) - (SEV_ORDER[a.worst] ?? 0),
  );
  if (rows.length <= 1) return null; // nothing to compare

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 mb-3">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
        Severity by language
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const total = Object.values(r.counts).reduce((s, n) => s + n, 0);
          return (
            <div key={r.lang} className="flex items-center gap-2 text-11">
              <span className="font-mono text-violet uppercase font-semibold w-10 shrink-0">{r.lang}</span>
              <span
                className={`text-10 px-1.5 py-px rounded font-semibold uppercase shrink-0 ${SEV_TONE[r.worst] ?? "bg-bg-2 text-ink-2"}`}
                title="Worst severity in this language"
              >
                {r.worst}
              </span>
              <div className="flex-1 flex flex-wrap gap-1 text-10 font-mono text-ink-3">
                {Object.entries(r.counts).map(([sev, n]) => (
                  <span key={sev}>{sev}: <span className="text-ink-1">{n}</span></span>
                ))}
              </div>
              <span className="text-10 text-ink-3 font-mono">{total} item{total === 1 ? "" : "s"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
