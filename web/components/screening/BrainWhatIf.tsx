"use client";

import { useState } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// What-if simulator. Client-side toggles to mutate brain inputs and
// recalculate the composite score in real-time. Helps operators
// understand which signals drove the verdict and lets them sanity-
// check that removing a given signal doesn't accidentally clear a
// subject that should stay flagged.

interface Mutations {
  dropPep: boolean;
  dropSanctions: boolean;
  dropAdverseMedia: boolean;
  dropRedlines: boolean;
  flipJurisdiction: "keep" | "GB" | "US" | "CH"; // low-risk alternatives
}

export function BrainWhatIf({ result }: { result: SuperBrainResult }) {
  const [m, setM] = useState<Mutations>({
    dropPep: false,
    dropSanctions: false,
    dropAdverseMedia: false,
    dropRedlines: false,
    flipJurisdiction: "keep",
  });

  const b = result.composite.breakdown;
  const actualComposite = result.composite.score;

  // Recompute the composite with mutations applied.
  const simulated =
    (b.quickScreen ?? 0) * (m.dropSanctions ? 0 : 1) +
    (b.jurisdictionPenalty ?? 0) * (m.flipJurisdiction !== "keep" ? 0 : 1) +
    (b.regimesPenalty ?? 0) * (m.flipJurisdiction !== "keep" ? 0 : 1) +
    (b.redlinesPenalty ?? 0) * (m.dropRedlines ? 0 : 1) +
    (b.adverseMediaPenalty ?? 0) * (m.dropAdverseMedia ? 0 : 1) +
    (b.adverseKeywordPenalty ?? 0) * (m.dropAdverseMedia ? 0 : 1) +
    (b.pepPenalty ?? 0) * (m.dropPep ? 0 : 1);

  const delta = simulated - actualComposite;
  const noChange =
    !m.dropPep &&
    !m.dropSanctions &&
    !m.dropAdverseMedia &&
    !m.dropRedlines &&
    m.flipJurisdiction === "keep";

  const toggle = (key: keyof Mutations, value?: string) => {
    setM((prev) => {
      if (key === "flipJurisdiction") {
        return { ...prev, flipJurisdiction: (value ?? "keep") as Mutations["flipJurisdiction"] };
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  const Toggle = ({ k, label }: { k: keyof Mutations; label: string }) => (
    <label className="flex items-center gap-2 text-11 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(m[k])}
        onChange={() => toggle(k)}
        className="accent-brand"
      />
      <span className="text-ink-1">{label}</span>
    </label>
  );

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
          What-if simulator
        </span>
        <span className="font-mono text-11 text-ink-3">
          actual {actualComposite} · simulated{" "}
          <span
            className={
              noChange ? "text-ink-0" : delta < 0 ? "text-green" : "text-red"
            }
          >
            {Math.max(0, Math.min(100, Math.round(simulated)))}
          </span>
          {!noChange && (
            <span className={delta < 0 ? "text-green" : "text-red"}>
              {" "}
              ({delta > 0 ? "+" : ""}
              {Math.round(delta)})
            </span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Toggle k="dropSanctions" label="Drop sanctions hits" />
        <Toggle k="dropPep" label="Drop PEP classification" />
        <Toggle k="dropAdverseMedia" label="Drop adverse-media" />
        <Toggle k="dropRedlines" label="Drop redlines" />
        <div className="col-span-2 mt-1">
          <span className="text-10 uppercase tracking-wide-3 text-ink-3 mr-2">
            Flip jurisdiction:
          </span>
          {(["keep", "GB", "US", "CH"] as const).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => toggle("flipJurisdiction", j)}
              className={`mr-1 px-2 py-0.5 rounded-sm font-mono text-10 ${
                m.flipJurisdiction === j
                  ? "bg-brand text-white"
                  : "bg-bg-2 text-ink-2 hover:bg-bg-1"
              }`}
            >
              {j === "keep" ? "actual" : j}
            </button>
          ))}
        </div>
      </div>
      {!noChange && (
        <p className="text-10 text-ink-3 mt-2 leading-relaxed">
          Simulation only — the subject's stored posture and audit chain
          are unchanged. Useful for sanity-checking how much each signal
          drove the verdict before raising a four-eyes objection.
        </p>
      )}
    </div>
  );
}
