"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface FamilyModule {
  label: string;
  href: string;
  icon?: string;
}

interface Props {
  suiteName: string;
  modules: FamilyModule[];
}

// Renders a compact navigation bar at the top of a merged module page,
// showing all modules that have been consolidated into a single suite entry.
// Active module is highlighted; others are clickable links.
export function ModuleFamilyBar({ suiteName, modules }: Props) {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex items-center gap-2 flex-wrap px-3.5 py-2.5 rounded-lg border border-brand/20 bg-brand/5">
      <span className="font-mono text-10 uppercase tracking-wide-4 text-brand shrink-0 pr-1 border-r border-brand/30">
        {suiteName}
      </span>
      {modules.map((mod) => {
        const isActive = pathname !== null && (pathname === mod.href || pathname.startsWith(`${mod.href}/`));
        return (
          <Link
            key={mod.href}
            href={mod.href}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded text-12 font-medium transition-colors border no-underline ${
              isActive
                ? "bg-brand text-white border-brand"
                : "bg-bg-1 text-ink-1 border-hair hover:border-brand/40 hover:text-ink-0"
            }`}
          >
            {mod.icon && <span>{mod.icon}</span>}
            {mod.label}
          </Link>
        );
      })}
    </div>
  );
}
