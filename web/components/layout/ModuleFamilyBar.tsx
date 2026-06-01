"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export interface FamilyModule {
  label: string;
  href: string;
  icon?: string;
}

interface Props {
  suiteName: string;
  modules: FamilyModule[];
  /** When provided, clicking a module calls onSelect instead of navigating. */
  onSelect?: (mod: FamilyModule) => void;
  /** Highlights the button whose href matches this value (inline tab mode). */
  activeHref?: string;
}

function ModuleFamilyBarInner({ suiteName, modules, onSelect, activeHref }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function isActive(mod: FamilyModule): boolean {
    // Inline-tab mode: highlight by activeHref
    if (onSelect) return mod.href === activeHref;
    if (pathname === null) return false;
    const [modPath, modQuery] = mod.href.split("?");
    const pathMatch = pathname === modPath || pathname.startsWith(`${modPath}/`);
    if (!pathMatch) return false;
    if (!modQuery) return true;
    const modParams = new URLSearchParams(modQuery);
    for (const [key, val] of modParams.entries()) {
      if (searchParams?.get(key) !== val) return false;
    }
    return true;
  }

  const btnCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-3 py-1 rounded text-12 font-medium transition-colors border no-underline ${
      active
        ? "bg-brand text-white border-brand"
        : "bg-bg-1 text-ink-1 border-hair hover:border-brand/40 hover:text-ink-0"
    }`;

  return (
    <div className="mb-5 flex items-center gap-2 flex-wrap px-3.5 py-2.5 rounded-lg border border-brand/20 bg-brand/5">
      <span className="font-mono text-10 uppercase tracking-wide-4 text-brand shrink-0 pr-1 border-r border-brand/30">
        {suiteName}
      </span>
      {modules.map((mod) => {
        const active = isActive(mod);
        if (onSelect) {
          return (
            <button
              key={mod.href}
              type="button"
              onClick={() => onSelect(mod)}
              className={btnCls(active)}
            >
              {mod.icon && <span>{mod.icon}</span>}
              {mod.label}
            </button>
          );
        }
        return (
          <Link
            key={mod.href}
            href={mod.href}
            className={btnCls(active)}
          >
            {mod.icon && <span>{mod.icon}</span>}
            {mod.label}
          </Link>
        );
      })}
    </div>
  );
}

// Renders a compact navigation bar at the top of a merged module page,
// showing all modules that have been consolidated into a single suite entry.
// Active module is highlighted; in inline-tab mode (onSelect provided) buttons
// do not navigate — they call onSelect and the parent renders content below.
export function ModuleFamilyBar(props: Props) {
  return (
    <Suspense fallback={null}>
      <ModuleFamilyBarInner {...props} />
    </Suspense>
  );
}
