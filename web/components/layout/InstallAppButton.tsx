"use client";

// Install-as-app button.
//   · Chrome/Edge/Android: captures the beforeinstallprompt event and triggers
//     the native install dialog when the user clicks.
//   · iOS Safari: no install prompt API — shows a small modal explaining the
//     Share → Add-to-Home-Screen flow instead.
// Hides itself once the app is already installed (display-mode: standalone).

import { useEffect, useState } from "react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "hawkeye.install.dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function InstallAppButton(): JSX.Element | null {
  const [bipEvent, setBipEvent] = useState<BIPEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") setHidden(true);
    } catch { /* storage refused */ }

    const handler = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BIPEvent);
    };
    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (installed || hidden) return null;
  // Show on iOS even without a captured event (manual flow).
  if (!bipEvent && !isIOS()) return null;

  const onClick = async () => {
    if (bipEvent) {
      await bipEvent.prompt();
      const choice = await bipEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setBipEvent(null);
    } else {
      setShowIosHint(true);
    }
  };

  const dismissForever = () => {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* storage refused */ }
    setHidden(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title="Install Hawkeye as an app"
        className="border border-brand/40 bg-brand/10 text-brand rounded px-2 py-0.5 text-10.5 font-semibold hover:bg-brand/20 transition-colors no-underline"
      >
        📱 Install app
      </button>

      {showIosHint && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowIosHint(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-bg-panel border border-hair-2 rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="text-[24px]">📱</div>
              <div className="flex-1">
                <h3 className="text-14 font-semibold text-ink-0 mb-1">
                  Install Hawkeye on your iPhone
                </h3>
                <p className="text-11 text-ink-2">
                  Add to your home screen for fullscreen, app-like access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIosHint(false)}
                className="text-ink-3 hover:text-ink-0 text-18 leading-none -mr-1 -mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ol className="text-12 text-ink-1 space-y-2 mb-4 list-decimal pl-5">
              <li>
                Open this page in <span className="font-semibold">Safari</span>{" "}
                (not Chrome — only Safari can install on iOS).
              </li>
              <li>
                Tap the <span className="font-semibold">Share</span> button{" "}
                <span className="inline-block px-1.5 py-0.5 bg-bg-2 border border-hair-2 rounded text-10 font-mono">⎙</span>{" "}
                at the bottom.
              </li>
              <li>
                Scroll down and tap{" "}
                <span className="font-semibold">"Add to Home Screen"</span>.
              </li>
              <li>
                Tap <span className="font-semibold">Add</span> in the top-right.
              </li>
            </ol>
            <button
              type="button"
              onClick={dismissForever}
              className="w-full text-11 text-ink-3 hover:text-ink-0 border border-hair-2 rounded py-1.5"
            >
              Don't show again
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default InstallAppButton;
