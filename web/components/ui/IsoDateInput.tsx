"use client";

import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
  title?: string;
}

const DEFAULT_CLS =
  "border border-hair-2 rounded px-2 py-1.5 text-12 bg-bg-panel text-ink-0 w-full";

function isoToDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso ?? "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function displayToIso(display: string): string | null {
  const m = display.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

export function IsoDateInput({
  value,
  onChange,
  className,
  placeholder = "dd/mm/yyyy",
  required,
  ariaLabel,
  title,
}: Props) {
  const [text, setText] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      required={required}
      aria-label={ariaLabel}
      title={title}
      className={className ?? DEFAULT_CLS}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next === "") {
          onChange("");
          return;
        }
        const iso = displayToIso(next);
        if (iso) onChange(iso);
      }}
    />
  );
}
