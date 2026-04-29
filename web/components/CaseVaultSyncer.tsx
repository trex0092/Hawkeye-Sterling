"use client";

import { useEffect } from "react";
import { syncFromServer } from "@/lib/data/case-store";

// Mounted once at the top of the app. Triggers a one-shot pull from
// the server vault so cases written from another device, the seed
// blob, or a re-deploy show up in this browser without operator
// action. The pull merges with the local localStorage state — any
// pending local changes ride into the merge POST.
//
// Failures are silent: localStorage stays authoritative when the
// server is unreachable, so the app still works in offline / degraded
// modes.
export function CaseVaultSyncer(): null {
  useEffect(() => {
    void syncFromServer();
  }, []);
  return null;
}
