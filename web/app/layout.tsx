import type { Metadata } from "next";
import "./globals.css";
import { CaseVaultSyncer } from "@/components/CaseVaultSyncer";

export const metadata: Metadata = {
  title: "Hawkeye Sterling",
  description: "Regulator-grade AML/CFT screening engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runs synchronously before paint — prevents flash of light theme on dark-mode reload */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hawkeye.theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CaseVaultSyncer />
        {children}
      </body>
    </html>
  );
}
