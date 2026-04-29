"use client";

interface WorkbenchToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  selectedCount: number;
  categoryLabel: string;
  onRun: () => void;
  running?: boolean;
  subjectRequired?: boolean;
}

export function WorkbenchToolbar({
  query,
  onQueryChange,
  selectedCount,
  categoryLabel,
  onRun,
  running = false,
  subjectRequired = false,
}: WorkbenchToolbarProps) {
  const disabled = selectedCount === 0 || running || subjectRequired;

  return (
    <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
      <div className="flex-1 relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search modes — e.g. 'bayesian', 'causal graph', 'ubo bearer'"
          className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel"
        />
      </div>

      <div className="flex gap-2">
        <button className="inline-flex items-center gap-1.5 rounded bg-bg-panel border border-hair-2 px-2.5 py-[5px] text-11.5 font-medium text-ink-0 hover:border-hair-3 hover:bg-bg-2">
          <span>Category:</span>
          <span className="font-semibold">{categoryLabel}</span>
        </button>
        <button className="inline-flex items-center gap-1.5 rounded bg-bg-panel border border-hair-2 px-2.5 py-[5px] text-11.5 font-medium text-ink-0 hover:border-hair-3 hover:bg-bg-2">
          <span>Selected:</span>
          <span className="font-semibold">{selectedCount}</span>
        </button>
        <button
          onClick={onRun}
          disabled={disabled}
          title={subjectRequired ? "Enter a subject name above" : running ? "Running…" : "Run pipeline"}
          className="inline-flex items-center gap-1.5 rounded bg-brand border border-brand text-white px-2.5 py-[5px] text-11.5 font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] justify-center"
        >
          {running ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running…
            </>
          ) : (
            "Run pipeline"
          )}
        </button>
      </div>
    </div>
  );
}
