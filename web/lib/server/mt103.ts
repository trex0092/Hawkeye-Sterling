// SWIFT MT103 parser — minimal subset covering the fields payment-rail
// screening cares about: reference (20), value date/currency/amount (32A),
// ordering customer (50A/K), beneficiary (59A/K), remittance info (70).
// Intentionally permissive — the tag regex handles the common
// `:TAG:VALUE` layout and ignores lines that don't parse.

export interface Mt103 {
  reference?: string;          // :20:
  valueDate?: string;          // :32A: YYMMDD
  currency?: string;           // :32A: CCY
  amount?: string;             // :32A: N,NN
  ordering?: {
    account?: string;
    name?: string;
    address?: string;
  };                           // :50A:/K:
  beneficiary?: {
    account?: string;
    name?: string;
    address?: string;
  };                           // :59A:/K:
  remittance?: string;         // :70:
  raw: string;
}

const TAG_RE = /^:(\d{2}[A-Z]?):(.*)$/;

function parseParty(block: string): {
  account?: string;
  name?: string;
  address?: string;
} {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  const first = lines[0]!;
  // Account numbers on MT103 :50K:/:59: typically start with /IBAN or /ACCT
  const result: { account?: string; name?: string; address?: string } = {};
  if (first.startsWith("/")) {
    result.account = first.replace(/^\//, "").trim();
    const rest = lines.slice(1);
    if (rest.length > 0) result.name = rest[0];
    if (rest.length > 1) result.address = rest.slice(1).join(", ");
  } else {
    result.name = first;
    if (lines.length > 1) result.address = lines.slice(1).join(", ");
  }
  return result;
}

export function parseMt103(input: string): Mt103 {
  const out: Mt103 = { raw: input };
  const blocks: Record<string, string> = {};
  let currentTag: string | null = null;
  let currentBuf: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    const m = TAG_RE.exec(line);
    if (m) {
      if (currentTag) blocks[currentTag] = currentBuf.join("\n").trim();
      currentTag = m[1]!;
      currentBuf = [m[2]!];
    } else if (currentTag) {
      currentBuf.push(line);
    }
  }
  if (currentTag) blocks[currentTag] = currentBuf.join("\n").trim();

  if (blocks["20"]) out.reference = blocks["20"];
  const f32 = blocks["32A"] ?? blocks["32B"];
  if (f32) {
    // :32A: YYMMDDCCYN,NN   e.g. 250423USD10000,00
    const m32 = /^(\d{6})([A-Z]{3})([\d.,]+)$/.exec(f32.replace(/\s+/g, ""));
    if (m32) {
      out.valueDate = m32[1]!;
      out.currency = m32[2]!;
      out.amount = m32[3]!;
    }
  }
  const ordering = blocks["50K"] ?? blocks["50A"] ?? blocks["50F"] ?? blocks["50"];
  if (ordering) out.ordering = parseParty(ordering);
  const beneficiary = blocks["59"] ?? blocks["59A"] ?? blocks["59F"];
  if (beneficiary) out.beneficiary = parseParty(beneficiary);
  if (blocks["70"]) out.remittance = blocks["70"];

  return out;
}
