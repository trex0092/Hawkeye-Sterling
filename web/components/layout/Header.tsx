"use client";

import { usePathname } from "next/navigation";

const NAV_TABS = [
  { label: "Workbench", href: "/" },
  { label: "Screening", href: "/screening" },
  { label: "Cases", href: "/cases" },
  { label: "Deep reasoning", href: "/workbench" },
  { label: "Audit", href: "/audit-trail" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-hair-2 shadow-header">
      <nav className="flex items-center gap-4 h-[54px] px-6">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-ink-0 no-underline text-13 font-semibold"
        >
          <span className="w-[18px] h-[18px] bg-ink-0 rounded-sm flex items-center justify-center text-white font-mono text-[10px] font-bold">
            H
          </span>
          <span>Hawkeye Sterling</span>
        </a>

        <div className="flex gap-0.5 ml-8">
          {NAV_TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <a
                key={tab.label}
                href={tab.href}
                className={`px-3.5 py-1.5 text-12.5 rounded no-underline font-medium transition-colors ${
                  active
                    ? "bg-bg-2 text-ink-0"
                    : "text-ink-2 hover:bg-bg-2 hover:text-ink-0"
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-5 font-mono text-10.5 text-ink-2">
          <span className="flex items-center gap-1">
            <span className="font-semibold">14:27:23</span>
            <span className="text-ink-3">GST</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            <span className="font-medium">live</span>
          </span>
          <span className="flex items-center gap-1 text-ink-3">◐ night</span>
          <span className="flex items-center gap-1 text-ink-3">☾ tweaks</span>
        </div>
      </nav>
    </header>
  );
}
