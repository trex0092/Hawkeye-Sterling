"use client";

interface CasesToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function CasesToolbar({ query, onQueryChange }: CasesToolbarProps) {
  return (
    <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white border border-hair-2 rounded-lg">
      <div className="flex-1 relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search cases — case ID, subject name, goAML reference"
          className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-white"
        />
      </div>

      <div className="flex gap-2">
        <button className="inline-flex items-center gap-1.5 rounded bg-white border border-hair-2 px-2.5 py-[5px] text-11.5 font-medium text-ink-0 hover:border-hair-3 hover:bg-bg-2">
          <span>Filter:</span>
          <span className="font-semibold">Active</span>
        </button>
        <button className="inline-flex items-center gap-1.5 rounded bg-white border border-hair-2 px-2.5 py-[5px] text-11.5 font-medium text-ink-0 hover:border-hair-3 hover:bg-bg-2">
          <span>Export:</span>
          <span className="font-semibold">goAML</span>
        </button>
      </div>
    </div>
  );
}
