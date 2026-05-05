// Hawkeye Sterling — name matchers (Layers 96-105).

// 96. Levenshtein (normalised 0..1)
export function levenshtein(a: string, b: string): number {
  const A = a.toLowerCase(), B = b.toLowerCase();
  if (A === B) return 1;
  if (!A.length || !B.length) return 0;
  const m = A.length, n = B.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) d[i]![0] = i;
  for (let j = 0; j <= n; j += 1) d[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
    }
  }
  const dist = d[m]![n]!;
  return 1 - dist / Math.max(m, n);
}

// 97. Damerau-Levenshtein (transposition-aware)
export function damerauLevenshtein(a: string, b: string): number {
  const A = a.toLowerCase(), B = b.toLowerCase();
  const m = A.length, n = B.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) d[i]![0] = i;
  for (let j = 0; j <= n; j += 1) d[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return 1 - d[m]![n]! / Math.max(m, n);
}

// 98. Jaro-Winkler
export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const A = a.toLowerCase(), B = b.toLowerCase();
  if (A === B) return 1;
  if (!A.length || !B.length) return 0;
  const matchDist = Math.floor(Math.max(A.length, B.length) / 2) - 1;
  const aMatches = new Array(A.length).fill(false);
  const bMatches = new Array(B.length).fill(false);
  let matches = 0;
  for (let i = 0; i < A.length; i += 1) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, B.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j]) continue;
      if (A[i] !== B[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches += 1; break;
    }
  }
  if (!matches) return 0;
  let t = 0; let k = 0;
  for (let i = 0; i < A.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (A[i] !== B[k]) t += 1;
    k += 1;
  }
  t /= 2;
  const m = matches;
  const jaro = (m / A.length + m / B.length + (m - t) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, A.length, B.length); i += 1) {
    if (A[i] === B[i]) prefix += 1; else break;
  }
  return jaro + prefix * p * (1 - jaro);
}

// 99. Token-set ratio (best of token combinations)
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = new Set([...ta].filter((t) => tb.has(t)));
  const aOnly = [...ta].filter((t) => !tb.has(t));
  const bOnly = [...tb].filter((t) => !ta.has(t));
  const t1 = [...inter, ...aOnly].sort().join(" ");
  const t2 = [...inter, ...bOnly].sort().join(" ");
  return Math.max(levenshtein(t1, t2), jaroWinkler(t1, t2));
}

// 100. Soundex extended (4-char code)
export function soundex(s: string): string {
  if (!s) return "";
  const u = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!u) return "";
  const map: Record<string, string> = { B: "1", F: "1", P: "1", V: "1", C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2", D: "3", T: "3", L: "4", M: "5", N: "5", R: "6" };
  let code = u[0]!;
  let prev = map[u[0]!] ?? "";
  for (let i = 1; i < u.length && code.length < 4; i += 1) {
    const c = map[u[i]!];
    if (c && c !== prev) code += c;
    prev = c ?? "";
  }
  return (code + "0000").slice(0, 4);
}

// 101. NYSIIS encoder
export function nysiis(s: string): string {
  if (!s) return "";
  let u = s.toUpperCase().replace(/[^A-Z]/g, "");
  u = u.replace(/^MAC/, "MCC").replace(/^KN/, "N").replace(/^K/, "C")
       .replace(/^PH/, "FF").replace(/^PF/, "FF").replace(/^SCH/, "SSS");
  u = u.replace(/EE$|IE$/, "Y").replace(/(DT|RT|RD|NT|ND)$/, "D");
  let res = u[0]!;
  for (let i = 1; i < u.length; i += 1) {
    let c = u[i]!;
    c = c.replace(/EV/, "AF").replace(/[AEIOU]/, "A");
    c = c.replace(/Q/, "G").replace(/Z/, "S").replace(/M/, "N");
    c = c.replace(/KN/, "N").replace(/K/, "C").replace(/SCH/, "SSS");
    c = c.replace(/PH/, "FF").replace(/H/, res.slice(-1) ?? "").replace(/W/, "");
    if (c !== res.slice(-1)) res += c;
  }
  return res.slice(0, 6);
}

// 102. Match-Rating Approach (MRA)
export function mra(a: string): string {
  if (!a) return "";
  let u = a.toUpperCase().replace(/[^A-Z]/g, "");
  u = u.replace(/[AEIOU]/g, (v, idx) => (idx === 0 ? v : ""));
  // Remove duplicate consecutive letters
  u = u.replace(/(.)\1+/g, "$1");
  if (u.length > 6) u = u.slice(0, 3) + u.slice(-3);
  return u;
}

// 103. Cologne phonetic (German)
export function cologne(s: string): string {
  if (!s) return "";
  const u = s.toUpperCase().replace(/[^A-Z]/g, "").replace(/Ä/g, "A").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/ß/g, "S");
  let out = "";
  for (let i = 0; i < u.length; i += 1) {
    const c = u[i]!;
    let code = "";
    if ("AEIOUJY".includes(c)) code = (i === 0 ? "0" : "");
    else if (c === "B") code = "1";
    else if (c === "P") code = u[i + 1] === "H" ? "3" : "1";
    else if ("DT".includes(c)) code = "CSZ".includes(u[i + 1] ?? "") ? "8" : "2";
    else if ("FVW".includes(c)) code = "3";
    else if ("GKQ".includes(c)) code = "4";
    else if (c === "C") code = i === 0 ? ("AHKLOQRUX".includes(u[1] ?? "") ? "4" : "8") : "8";
    else if (c === "X") code = "48";
    else if (c === "L") code = "5";
    else if ("MN".includes(c)) code = "6";
    else if (c === "R") code = "7";
    else if ("SZ".includes(c)) code = "8";
    if (code && out.slice(-1) !== code[0]) out += code;
  }
  return out.replace(/(.)\1+/g, "$1");
}

// 104. Initials matcher — A.B. Smith vs Alan Bradley Smith
export function initialsMatch(a: string, b: string): number {
  const ai = a.split(/\s+/).filter(Boolean).map((t) => t[0]?.toUpperCase() ?? "").join("");
  const bi = b.split(/\s+/).filter(Boolean).map((t) => t[0]?.toUpperCase() ?? "").join("");
  if (!ai || !bi) return 0;
  if (ai === bi) return 1;
  if (ai.startsWith(bi) || bi.startsWith(ai)) return 0.7;
  return 0;
}

// 105. Reverse-name matcher (Smith John vs John Smith)
export function reverseMatch(a: string, b: string): number {
  const at = a.toLowerCase().split(/\s+/).filter(Boolean);
  const bt = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (at.length === bt.length && [...at].reverse().join(" ") === bt.join(" ")) return 1;
  return jaroWinkler([...at].reverse().join(" "), bt.join(" "));
}
