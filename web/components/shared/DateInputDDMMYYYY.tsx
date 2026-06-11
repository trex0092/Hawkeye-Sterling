"use client";

import { useEffect, useState } from "react";

// dd/mm/yyyy date entry.
//
// Native <input type="date"> renders its placeholder in the browser locale
// (mm/dd/yyyy on US-locale browsers) and that cannot be overridden, so
// modules use this text input instead: the operator types dd/mm/yyyy and the
// form receives the ISO yyyy-mm-dd value it already stored before.

interface Props {
  /** ISO date (yyyy-mm-dd) or empty string. */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function displayToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function DateInputDDMMYYYY({
  value,
  onChange,
  className,
  id,
  required,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);

  // Keep in sync when the parent resets the field (e.g. form clear).
  useEffect(() => {
    setText((prev) => {
      const fromValue = isoToDisplay(value);
      return displayToIso(prev) === (value || null) && prev !== "" ? prev : fromValue;
    });
    if (!value) setInvalid(false);
  }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = displayToIso(raw);
    if (iso) {
      setInvalid(false);
      onChange(iso);
    } else {
      setInvalid(raw.length >= 10);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      id={id}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => handle(e.target.value)}
      onBlur={() => setInvalid(text.trim() !== "" && displayToIso(text) === null)}
      className={`${className ?? ""}${invalid ? " border-red focus:border-red" : ""}`}
    />
  );
}
