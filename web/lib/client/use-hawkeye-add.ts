"use client";

import { useEffect, useRef } from "react";

// Subscribes the mounted component to the ModuleActionBar "+ ADD" button.
//
// The action bar dispatches a cancelable CustomEvent("hawkeye:add") when a
// page does not pass an explicit onAdd callback. Components deep in the tree
// (e.g. a tab panel that owns its own add-form state) can use this hook to
// open their form. preventDefault() marks the event as handled so the bar
// shows a confirmation toast instead of falling back to its generic
// behaviour.
//
// Only mount this hook in components that are rendered when their form is
// reachable (e.g. inside the active tab), so the bar always targets the
// visible panel.
export function useHawkeyeAdd(handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onAdd = (e: Event) => {
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener("hawkeye:add", onAdd);
    return () => window.removeEventListener("hawkeye:add", onAdd);
  }, []);
}
