"use client";

import type { ReasoningPreset } from "@/lib/types";

interface PresetsCardProps {
  presets: ReasoningPreset[];
  onSelect: (preset: ReasoningPreset) => void;
  activePresetId: string | null;
}

export function PresetsCard({ presets, onSelect, activePresetId }: PresetsCardProps) {
  return (
    <div className="bg-white border border-hair-2 rounded-xl p-5 mb-5">
      <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-3">
        Curated presets
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-[5px] text-11.5 font-medium cursor-pointer transition-colors ${
                active
                  ? "bg-brand-dim border-brand text-brand-deep"
                  : "bg-white border-hair-2 text-ink-0 hover:border-hair-3 hover:bg-bg-2"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
