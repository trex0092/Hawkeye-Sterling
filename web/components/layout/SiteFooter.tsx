"use client";

// SiteFooter — persistent brand bar rendered at the bottom of every page.
// Matches the pattern seen on institutional compliance platforms (e.g. LSEG
// World-Check): a thin solid-colour strip with legal utility links.

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full bg-brand border-t border-brand/60 print:hidden">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-8 h-9 flex items-center justify-between gap-4">
        {/* Left: copyright */}
        <span className="text-10 font-mono text-white/70 tracking-wide-2 select-none whitespace-nowrap">
          © {year} Hawkeye Sterling · AML/CFT Compliance Intelligence
        </span>

        {/* Right: utility links */}
        <div className="flex items-center gap-1">
          <FooterLink href="/contact">Contact Us</FooterLink>
          <span className="text-white/30 text-10 select-none">·</span>
          <FooterLink href="/privacy">Privacy</FooterLink>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-10 font-medium text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors duration-100"
    >
      {children}
      {external && (
        <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 8.5l7-7M4 1.5h4.5V6" />
        </svg>
      )}
    </a>
  );
}
