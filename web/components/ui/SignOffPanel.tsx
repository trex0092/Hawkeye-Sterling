"use client";

import { useState } from "react";

interface Signer {
  role: string;
  name: string;
  editable?: boolean;
}

const DEFAULT_SIGNERS: Signer[] = [
  { role: "Compliance Officer", name: "Luisa Fernanda" },
  { role: "Alternate Compliance Officer", name: "Vishmi Nayanika" },
  { role: "Managing Director", name: "", editable: true },
];

export function SignOffPanel() {
  const [mdName, setMdName] = useState("");

  const signers = DEFAULT_SIGNERS.map((s) =>
    s.editable ? { ...s, name: mdName } : s,
  );

  return (
    <div className="border-t-2 border-brand mt-8 pt-5">
      <div className="text-9 font-mono font-semibold uppercase tracking-wide-4 text-ink-2 mb-4">
        Filing authorisation
      </div>
      <div className="grid grid-cols-3 gap-px bg-hair-2">
        {signers.map((s) => (
          <SignerColumn
            key={s.role}
            role={s.role}
            name={s.name}
            editable={s.editable}
            onNameChange={s.editable ? setMdName : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SignerColumn({
  role,
  name,
  editable,
  onNameChange,
}: {
  role: string;
  name: string;
  editable?: boolean;
  onNameChange?: (v: string) => void;
}) {
  return (
    <div className="bg-bg-panel px-5 py-4">
      <div className="text-9 font-mono font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
        {role}
      </div>

      {editable ? (
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder="— fill in manually —"
          className="font-display text-22 italic text-ink-0 bg-transparent border-0 border-b border-hair-3 focus:border-brand focus:outline-none w-full pb-1 placeholder:not-italic placeholder:font-sans placeholder:text-14 placeholder:text-ink-3"
        />
      ) : (
        <div className="font-display text-22 italic text-ink-0 border-b border-hair-3 pb-1">
          {name}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-hair">
        <div className="text-9 font-mono font-semibold uppercase tracking-wide-4 text-ink-3 mb-1">
          Signature
        </div>
        <div className="text-10 font-mono text-ink-3 italic">
          {name ? "pending — not yet signed" : "— awaiting name —"}
        </div>
      </div>
    </div>
  );
}
