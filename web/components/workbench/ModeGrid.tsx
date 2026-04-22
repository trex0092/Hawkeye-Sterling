"use client";

import type { ReasoningMode } from "@/lib/types";
import { TOTAL_MODES } from "@/lib/data/modes";

interface ModeGridProps {
  modes: ReasoningMode[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalInFaculty: number;
}

export function ModeGrid({ modes, selectedIds, onToggle, totalInFaculty }: ModeGridProps) {
  return (
    <div className="bg-white border border-hair-2 rounded-xl p-5">
      <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-1">
        Reasoning modes catalogue
      </div>
      <div className="text-12 text-ink-2 mb-4">
        {TOTAL_MODES} modes across 15 faculties · Click to select
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {modes.map((mode) => {
          const selected = selectedIds.has(mode.id);
          return (
            <button
              key={mode.id}
              onClick={() => onToggle(mode.id)}
              className={`text-left px-3 py-2.5 rounded border transition-all duration-100 cursor-pointer ${
                selected
                  ? "bg-brand border-brand text-white"
                  : "bg-white border-hair-2 hover:border-brand hover:bg-brand-dim"
              }`}
            >
              <div
                className={`font-mono text-10 font-semibold mb-1 tracking-wide-8 ${
                  selected ? "text-white/80" : "text-brand"
                }`}
              >
                {mode.id}
              </div>
              <div
                className={`text-12 font-medium ${
                  selected ? "text-white" : "text-ink-0"
                }`}
              >
                {mode.name}
              </div>
            </button>
          );
        })}
      </div>

      {modes.length === 0 ? (
        <div className="pt-4 mt-5 text-11 text-ink-2 border-t border-hair">
          No modes match your filters.
        </div>
      ) : (
        <div className="pt-4 mt-5 border-t border-hair">
          <div className="text-11 text-ink-2">
            Showing {modes.length} of {totalInFaculty} modes ·{" "}
            <a
              href="#"
              className="text-brand no-underline font-medium hover:underline"
              onClick={(e) => e.preventDefault()}
            >
              Load more
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
