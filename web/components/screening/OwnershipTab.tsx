"use client";

import type { Subject } from "@/lib/types";

// Ownership / UBO chain visualiser. Renders a nested tree of beneficial
// owners, directors, and intermediate shareholders. Until a real
// ownership feed (OpenCorporates / Orbis / etc.) is wired, this
// synthesises a plausible chain from the subject's jurisdiction so
// the shape is visible end-to-end. When brain output carries an
// `ownership` field in the future, this component will render that
// instead (the data shape is forward-compatible).

interface OwnershipNode {
  id: string;
  name: string;
  kind: "ubo" | "director" | "entity" | "nominee" | "trust";
  jurisdiction?: string | undefined;
  ownershipPct?: number | undefined;
  verified?: boolean | undefined;
  role?: string | undefined;
  children?: OwnershipNode[] | undefined;
  flags?: Array<"pep" | "sanctions" | "adverse-media" | "cahra"> | undefined;
}

function synthesiseChain(subject: Subject): OwnershipNode {
  // Root node = the subject itself.
  const root: OwnershipNode = {
    id: subject.id,
    name: subject.name,
    kind: subject.entityType === "individual" ? "ubo" : "entity",
    jurisdiction: subject.country || subject.jurisdiction,
    role: subject.type,
  };

  if (subject.entityType === "individual") {
    // Individuals don't have an ownership chain — they ARE a UBO.
    return root;
  }

  // Synthesise a plausible chain for organisations so the card shape
  // renders meaningfully. Real ownership data replaces this when wired.
  root.children = [
    {
      id: `${subject.id}-ubo-1`,
      name: "[UBO 1 — 60% beneficial owner]",
      kind: "ubo",
      ownershipPct: 60,
      jurisdiction: subject.country,
      verified: false,
      flags: subject.pep ? ["pep"] : [],
    },
    {
      id: `${subject.id}-ubo-2`,
      name: "[UBO 2 — 25% beneficial owner]",
      kind: "ubo",
      ownershipPct: 25,
      jurisdiction: subject.country,
      verified: false,
    },
    {
      id: `${subject.id}-nom`,
      name: "[Nominee shareholder — 15%]",
      kind: "nominee",
      ownershipPct: 15,
      jurisdiction: "—",
    },
    {
      id: `${subject.id}-dir`,
      name: "[Director of record]",
      kind: "director",
      jurisdiction: subject.country,
      verified: false,
    },
  ];
  return root;
}

const KIND_ICON: Record<OwnershipNode["kind"], string> = {
  ubo: "👤",
  director: "🪪",
  entity: "🏛",
  nominee: "🎭",
  trust: "🗄",
};

const KIND_LABEL: Record<OwnershipNode["kind"], string> = {
  ubo: "UBO",
  director: "Director",
  entity: "Entity",
  nominee: "Nominee",
  trust: "Trust",
};

const FLAG_TONE: Record<NonNullable<OwnershipNode["flags"]>[number], string> = {
  pep: "bg-brand text-white",
  sanctions: "bg-red text-white",
  "adverse-media": "bg-orange-dim text-orange",
  cahra: "bg-red-dim text-red",
};

function Node({ node, depth = 0 }: { node: OwnershipNode; depth?: number }) {
  return (
    <div className={depth === 0 ? "" : "ml-5 mt-2 pl-3 border-l-2 border-hair"}>
      <div className="flex items-center gap-2 py-1.5 text-12">
        <span className="text-14">{KIND_ICON[node.kind]}</span>
        <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-bg-2 text-ink-2 uppercase">
          {KIND_LABEL[node.kind]}
        </span>
        <span className="font-medium text-ink-0 truncate">{node.name}</span>
        {node.ownershipPct != null && (
          <span className="font-mono text-10.5 text-ink-2">
            {node.ownershipPct}%
          </span>
        )}
        {node.jurisdiction && node.jurisdiction !== "—" && (
          <span className="font-mono text-10 text-ink-3">
            {node.jurisdiction}
          </span>
        )}
        {node.verified !== undefined && (
          <span
            className={`font-mono text-10 px-1.5 py-px rounded-sm ${
              node.verified ? "bg-green-dim text-green" : "bg-amber-dim text-amber"
            }`}
          >
            {node.verified ? "verified" : "unverified"}
          </span>
        )}
        {node.flags && node.flags.length > 0 && (
          <span className="flex gap-1">
            {node.flags.map((f) => (
              <span
                key={f}
                className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold ${FLAG_TONE[f]}`}
              >
                {f.replace("-", " ").toUpperCase()}
              </span>
            ))}
          </span>
        )}
      </div>
      {node.children && node.children.length > 0 && (
        <div>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OwnershipTab({ subject }: { subject: Subject }) {
  const chain = synthesiseChain(subject);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
          Ownership chain
        </span>
        <span className="font-mono text-10 text-ink-3">
          live-feed pending · OpenCorporates / Orbis integration
        </span>
      </div>
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
        <Node node={chain} />
      </div>
      <p className="text-10.5 text-ink-3 mt-3 leading-relaxed">
        Each node carries jurisdiction, ownership percentage, verification
        status, and risk flags (PEP / sanctions / CAHRA / adverse-media).
        Unverified nodes require an MLRO four-eyes review before onboarding
        can complete under FDL 10/2025 Art.19 (UBO identification). Shell
        companies, nominee shareholders, and trust structures render as
        distinct node kinds so layered ownership is immediately visible.
      </p>
    </div>
  );
}
