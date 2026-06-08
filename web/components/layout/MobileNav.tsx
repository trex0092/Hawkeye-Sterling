"use client";

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav-groups";

function isActive(pathname: string, search: string, href: string): boolean {
  const [base, query] = href.split("?");
  if (base === "/") return pathname === "/";
  if (query) {
    return pathname === base && search === `?${query}`;
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function MobileNavInner({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";

  // Prevent background scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Drawer */}
      <nav
        className="fixed inset-y-0 left-0 z-50 w-[280px] bg-bg-panel border-r border-hair-2 overflow-y-auto flex flex-col"
        aria-label="Mobile navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-2 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 text-ink-0 no-underline" onClick={onClose}>
            <span className="w-[22px] h-[22px] border border-ink-0 flex items-center justify-center font-display text-[14px] font-semibold text-ink-0 leading-none">
              H
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-ink-0">Hawkeye Sterling</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex items-center justify-center w-9 h-9 rounded border border-hair-2 text-ink-2 hover:text-ink-0 hover:bg-bg-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-3">
              <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3 font-semibold">
                {group.title}
              </div>
              <ul className="list-none p-0 m-0 space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, search, item.href);
                  const spaceIdx = item.label.indexOf(" ");
                  const emoji = item.label.slice(0, spaceIdx);
                  const text = item.label.slice(spaceIdx + 1);
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        title={item.hint}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-12 no-underline transition-colors ${
                          active
                            ? "bg-brand-dim text-brand-deep font-medium"
                            : "text-ink-1 hover:bg-bg-2 hover:text-ink-0"
                        }`}
                      >
                        <span className="shrink-0 text-13">{emoji}</span>
                        <span className="truncate">{text}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function MobileNav({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <MobileNavInner isOpen={isOpen} onClose={onClose} />
    </Suspense>
  );
}
