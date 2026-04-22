"use client";

import type { ReactNode } from "react";

export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <aside className="bg-white border-r border-hair-2 px-4 py-5 overflow-y-auto">
      {children}
    </aside>
  );
}

export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

export interface SidebarFilterItem<K extends string> {
  key: K;
  label: string;
  count: string;
}

interface SidebarFilterListProps<K extends string> {
  items: SidebarFilterItem<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
}

export function SidebarFilterList<K extends string>({
  items,
  activeKey,
  onSelect,
}: SidebarFilterListProps<K>) {
  return (
    <ul className="list-none p-0 m-0">
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <li
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`flex justify-between items-center px-2 py-1.5 rounded text-12.5 cursor-pointer mb-0.5 ${
              isActive
                ? "bg-brand-dim text-brand-deep font-medium"
                : "hover:bg-bg-2"
            }`}
          >
            <span>{item.label}</span>
            <span
              className={`font-mono text-11 px-1.5 py-px rounded-sm ${
                isActive ? "bg-brand text-white" : "bg-bg-2 text-ink-3"
              }`}
            >
              {item.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarMLROCard() {
  return (
    <div className="bg-brand text-white p-3 rounded-lg">
      <div className="text-13 font-semibold mb-0.5">Noor Al-Mansouri</div>
      <div className="text-11 opacity-85">MLRO, PRECISION SCREENING UAE</div>
      <div className="grid gap-1.5 mt-3 pt-3 border-t border-white/20">
        <MLRORow label="Caseload" value="42 open" />
        <MLRORow label="Region" value="90 / AE" />
        <MLRORow label="Retention" value="FDL Art.24" />
        <MLRORow label="Policy" value="v4.1 · 134/25" />
      </div>
    </div>
  );
}

function MLRORow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-10.5">
      <span className="text-white/70 uppercase tracking-wide-3 font-medium">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
