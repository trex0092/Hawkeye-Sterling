"use client";

interface ScreeningToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function ScreeningToolbar({ query, onQueryChange }: ScreeningToolbarProps) {
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
          placeholder="Search subjects — HS-24891"
          className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-white"
        />
      </div>

      <div className="flex gap-2">
        <ToolbarButton small>
          <span>Sort:</span>
          <span className="font-semibold">Severity</span>
          <span className="text-ink-3">↓</span>
        </ToolbarButton>
        <ToolbarButton small>
          <span>Group</span>
          <span className="text-ink-3">None</span>
        </ToolbarButton>
        <ToolbarButton small primary>
          <span>+ New</span>
          <span className="font-semibold">screening</span>
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  small,
  primary,
}: {
  children: React.ReactNode;
  small?: boolean;
  primary?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded font-sans border transition-colors cursor-pointer";
  const size = small ? "px-2.5 py-[5px] text-11.5 font-medium" : "px-3.5 py-[7px] text-12.5 font-medium";
  const variant = primary
    ? "bg-ink-0 text-white border-ink-0 font-semibold hover:bg-ink-1 hover:border-ink-1"
    : "bg-white text-ink-0 border-hair-2 hover:border-hair-3 hover:bg-bg-2";
  return <button className={`${base} ${size} ${variant}`}>{children}</button>;
}
