"use client";

import type { FilterKey, QueueFilter } from "@/lib/types";

interface SidebarProps {
  filters: QueueFilter[];
  activeFilter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
}

export function Sidebar({ filters, activeFilter, onFilterChange }: SidebarProps) {
  return (
    <aside className="bg-white border-r border-hair-2 px-4 py-5 overflow-y-auto">
      <div className="mb-6">
        <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
          Regulatory
        </div>
        <div className="bg-brand text-white p-3 rounded-lg">
          <div className="text-13 font-semibold mb-0.5">Noor Al-Mansouri</div>
          <div className="text-11 opacity-85">MLRO, PRECISION SCREENING UAE</div>
          <div className="grid gap-1.5 mt-3 pt-3 border-t border-white/20">
            <SidebarMetaRow label="Caseload" value="42 open" />
            <SidebarMetaRow label="Region" value="90 / AE" />
            <SidebarMetaRow label="Retention" value="FDL Art.24" />
            <SidebarMetaRow label="Policy" value="v4.1 · 134/25" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
          Shift
        </div>
        <div className="text-12 text-ink-1 px-2">08:00–16:00</div>
      </div>

      <div className="mb-6">
        <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
          Queue filters
        </div>
        <ul className="list-none p-0 m-0">
          {filters.map((filter) => {
            const isActive = filter.key === activeFilter;
            return (
              <li
                key={filter.key}
                onClick={() => onFilterChange(filter.key)}
                className={`flex justify-between items-center px-2 py-1.5 rounded text-12.5 cursor-pointer mb-0.5 ${
                  isActive
                    ? "bg-brand-dim text-brand-deep font-medium"
                    : "hover:bg-bg-2"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`font-mono text-11 px-1.5 py-px rounded-sm ${
                    isActive ? "bg-brand text-white" : "bg-bg-2 text-ink-3"
                  }`}
                >
                  {filter.count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function SidebarMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-10.5">
      <span className="text-white/70 uppercase tracking-wide-3 font-medium">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
