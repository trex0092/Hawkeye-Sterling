"use client";

interface ChartEntry {
  name: string;
  value: number;
  fill: string;
}

export default function BatchSeverityChart({ data }: { data: ChartEntry[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-3 h-[120px] w-full">
      {data.map((entry) => (
        <div key={entry.name} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
          <span className="text-10 font-mono" style={{ color: entry.fill }}>{entry.value}</span>
          <div
            className="w-full rounded-t-sm transition-all duration-300"
            style={{
              height: `${Math.max(4, (entry.value / max) * 80)}px`,
              background: entry.fill,
              opacity: 0.85,
            }}
          />
          <span className="text-10 text-ink-3 whitespace-nowrap">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
