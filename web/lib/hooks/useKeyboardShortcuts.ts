"use client";

import { useEffect } from "react";

export interface ShortcutMap {
  /** Open new screening form. */
  onNewScreening?: () => void;
  /** Move row selection down. */
  onNextRow?: () => void;
  /** Move row selection up. */
  onPrevRow?: () => void;
  /** Escalate the current subject to MLRO. */
  onEscalate?: () => void;
  /** Focus the search input. */
  onFocusSearch?: () => void;
  /** Close any open modal / dialog. */
  onEscape?: () => void;
}

// Compliance teams live in the keyboard. The canonical bindings:
//   n        - new screening form
//   j / ↓    - next row
//   k / ↑    - prev row
//   e        - escalate to MLRO
//   /        - focus search
//   Esc      - close modal
//
// Disabled while the user is typing in an input/textarea/select so the
// hotkeys never eat real characters.
export function useKeyboardShortcuts(map: ShortcutMap): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;
      // Allow Esc to close even from inside an input.
      if (e.key === "Escape") {
        map.onEscape?.();
        return;
      }
      if (isEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          map.onNewScreening?.();
          break;
        case "j":
        case "ArrowDown":
          if (e.key === "ArrowDown" && !map.onNextRow) return;
          e.preventDefault();
          map.onNextRow?.();
          break;
        case "k":
        case "ArrowUp":
          if (e.key === "ArrowUp" && !map.onPrevRow) return;
          e.preventDefault();
          map.onPrevRow?.();
          break;
        case "e":
          e.preventDefault();
          map.onEscalate?.();
          break;
        case "/":
          e.preventDefault();
          map.onFocusSearch?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}
