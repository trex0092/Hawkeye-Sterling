"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SidebarShell, SidebarSection } from "./SidebarParts";
import { NAV_GROUPS } from "@/lib/nav-groups";

function isActive(pathname: string, search: string, href: string): boolean {
  const [base, query] = href.split("?");
  if (base === "/") return pathname === "/";
  if (query) {
    // Require exact path + tab match so /intelligence-hub?tab=workbench only
    // highlights that one item, not all items sharing the same base path.
    return pathname === base && search === `?${query}`;
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function SidebarInner({ children }: { children?: ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";

  return (
    <SidebarShell>
      {NAV_GROUPS.map((group) => (
        <SidebarSection key={group.title} title={group.title} collapsible>
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
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-12 no-underline transition-colors ${
                      active
                        ? "bg-brand-dim text-brand-deep font-medium"
                        : "text-ink-1 hover:bg-bg-2 hover:text-ink-0"
                    }`}
                  >
                    <span className="shrink-0 text-11">{emoji}</span>
                    <span className="truncate">{text}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </SidebarSection>
      ))}
      {children}
    </SidebarShell>
  );
}

export function Sidebar({ children }: { children?: ReactNode } = {}) {
  return (
    <Suspense fallback={null}>
      <SidebarInner>{children}</SidebarInner>
    </Suspense>
  );
}
