"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  ANALYSIS,
  REASONING,
  SKILLS,
  type TaxonomyCategory,
  type TaxonomyEntry,
} from "@/lib/data/taxonomy";

interface CategoryTab {
  key: TaxonomyCategory;
  label: string;
  data: readonly TaxonomyEntry[];
}

const CATEGORIES: CategoryTab[] = [
  { key: "skills", label: "Skills", data: SKILLS },
  { key: "reasoning", label: "Reasoning", data: REASONING },
  { key: "analysis", label: "Deep Analysis", data: ANALYSIS },
];

const CATEGORY_STYLE: Record<TaxonomyCategory, string> = {
  skills:
    "bg-bg-1 border-hair-2 text-ink-0 hover:bg-brand-dim hover:border-brand hover:text-brand-deep",
  reasoning:
    "bg-bg-1 border-hair-2 text-ink-0 hover:bg-violet-dim hover:border-violet hover:text-violet",
  analysis:
    "bg-bg-1 border-hair-2 text-ink-0 hover:bg-amber-dim hover:border-amber hover:text-amber",
};

export function TaxonomyLibrary() {
  const [active, setActive] = useState<TaxonomyCategory>("skills");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const deferredQuery = useDeferredValue(query);

  const activeTab = CATEGORIES.find((c) => c.key === active) ?? CATEGORIES[0]!;

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return activeTab.data;
    return activeTab.data.filter((e) => e.name.toLowerCase().includes(q));
  }, [activeTab, deferredQuery]);

  const total = SKILLS.length + REASONING.length + ANALYSIS.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mt-5">
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2">
          Competency &amp; reasoning library
        </div>
        <div className="text-11 text-ink-3 font-mono">
          {selected.size} selected · {total} total
        </div>
      </div>
      <div className="text-12 text-ink-2 mb-4">
        Regulator-grade vocabulary across skills, reasoning forms, and deep-analysis
        surfaces. Click any chip to pin it to your mental model.
      </div>

      <div className="flex gap-1 mb-3 border-b border-hair">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActive(cat.key)}
            className={`px-3 py-2 text-12 font-medium bg-transparent border-none border-b-2 cursor-pointer flex items-center gap-1.5 ${
              active === cat.key
                ? "text-ink-0 border-brand"
                : "text-ink-2 border-transparent hover:text-ink-0"
            }`}
          >
            {cat.label}
            <span
              className={`font-mono text-10.5 px-1.5 py-px rounded-sm ${
                active === cat.key ? "bg-brand text-white" : "bg-bg-2 text-ink-3"
              }`}
            >
              {cat.data.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeTab.label.toLowerCase()}…`}
            className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel"
          />
        </div>
        <div className="text-11 text-ink-2 font-mono">
          {filtered.length} / {activeTab.data.length}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 max-h-[420px] overflow-y-auto py-1">
        {filtered.map((entry) => {
          const isSelected = selected.has(entry.id);
          const baseTone = CATEGORY_STYLE[entry.category];
          return (
            <button
              key={entry.id}
              onClick={() => toggle(entry.id)}
              className={`inline-block px-2.5 py-[5px] border rounded text-11.5 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-brand border-brand text-white font-medium"
                  : baseTone
              }`}
            >
              {entry.name}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-11 text-ink-2 py-4">
            No {activeTab.label.toLowerCase()} entries match "{query}".
          </div>
        )}
      </div>
    </div>
  );
}
