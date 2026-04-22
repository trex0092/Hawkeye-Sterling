const NAV_TABS = [
  { label: "Workbench", href: "/workbench", active: false },
  { label: "Screening", href: "/screening", active: true },
  { label: "Cases", href: "/cases", active: false },
  { label: "Evidence trail", href: "/audit-trail", active: false },
  { label: "Audit", href: "/audit-trail", active: false },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-hair-2 shadow-header">
      <nav className="flex items-center gap-4 h-[54px] px-6">
        <a href="/" className="inline-flex items-center gap-2 text-ink-0 no-underline text-13 font-semibold">
          <span className="w-[18px] h-[18px] bg-ink-0 rounded-sm flex items-center justify-center text-white font-mono text-[10px] font-bold">
            H
          </span>
          <span>Hawkeye Sterling</span>
          <span className="text-11 text-ink-3 font-normal ml-1">v5.2</span>
        </a>

        <div className="flex gap-0.5 ml-8">
          {NAV_TABS.map((tab) => (
            <a
              key={tab.label}
              href={tab.href}
              className={`px-3.5 py-1.5 text-12.5 rounded no-underline font-medium transition-colors ${
                tab.active
                  ? "bg-bg-2 text-ink-0"
                  : "text-ink-2 hover:bg-bg-2 hover:text-ink-0"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-5 font-mono text-10.5 text-ink-2">
          <span className="flex items-center gap-1">
            <span className="font-semibold">14:27:23</span>
            <span className="text-ink-3">GST</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-ink-3">sess_</span>
            <span className="font-mono font-semibold">a7f1b3c6</span>
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
