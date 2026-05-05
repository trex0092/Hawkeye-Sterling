import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CaseVaultSyncer } from "@/components/CaseVaultSyncer";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

export const metadata: Metadata = {
  title: "Hawkeye Sterling",
  description: "Regulator-grade AML/CFT screening engine",
  applicationName: "Hawkeye Sterling",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hawkeye",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-512.svg" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1320",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        {/* Runs synchronously before paint — prevents flash of light theme on dark-mode reload */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hawkeye.theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Hawkeye" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col min-h-screen">
        <LocaleProvider>
          <CaseVaultSyncer />
          <ServiceWorkerRegistrar />
          <div className="flex-1">
            {children}
          </div>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
