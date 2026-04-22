"use client";

import { useEffect, useState } from "react";
import type { QuickScreenSubject, QuickScreenResult } from "@/lib/api/quickScreen.types";

export interface SuperBrainResult {
  screen: QuickScreenResult;
  pep: {
    role: string;
    tier: string;
    type: string;
    salience: number;
    matchedRule?: string;
    rationale?: string;
  } | null;
  adverseMedia: Array<{ categoryId: string; keyword: string; offset: number }>;
  jurisdiction: {
    iso2: string;
    name: string;
    region: string;
    cahra: boolean;
    regimes: string[];
  } | null;
  redlines: {
    fired: Array<{ id?: string; label?: string; why?: string }>;
    action: string | null;
    summary: string;
  };
  variants: {
    aliasExpansion: string[];
    nameVariants: string[];
    doubleMetaphone: string | [string, string];
    soundex: string;
  };
  composite: {
    score: number;
    breakdown: Record<string, number>;
  };
}

export type SuperBrainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SuperBrainResult }
  | { status: "error"; error: string };

export function useSuperBrain(
  subject: QuickScreenSubject | null,
  opts: { roleText?: string; adverseMediaText?: string } = {},
): SuperBrainState {
  const [state, setState] = useState<SuperBrainState>({ status: "idle" });
  const key = subject
    ? [subject.name, subject.jurisdiction ?? "", subject.entityType ?? "", opts.roleText ?? "", opts.adverseMediaText ?? ""].join("|")
    : "";

  useEffect(() => {
    if (!subject) {
      setState({ status: "idle" });
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading" });
    fetch("/api/super-brain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, ...opts }),
      signal: ac.signal,
    })
      .then(async (r) => {
        const payload = (await r.json()) as
          | { ok: true; [k: string]: unknown }
          | { ok: false; error: string; detail?: string };
        if (!payload.ok) {
          setState({
            status: "error",
            error: payload.detail ?? payload.error ?? "unknown",
          });
          return;
        }
        const { ok: _ok, ...result } = payload;
        void _ok;
        setState({ status: "success", result: result as unknown as SuperBrainResult });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
