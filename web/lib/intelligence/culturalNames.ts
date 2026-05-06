// Hawkeye Sterling — cultural name handler (Layer #30).
//
// Different cultures structure personal names differently. A naive
// "first-token / last-token" split breaks down for:
//   - Arabic:   ism + nasab (bin/binte) + laqab + nisbah + kunya
//   - Chinese:  surname-FIRST (e.g. 习近平 = Xi Jinping)
//   - Spanish:  given-name + paternal-surname + maternal-surname
//   - Russian:  given-name + patronymic + surname
// The handler returns a canonical {given, surname, patronymic, kunya, ...}
// shape so the matcher can compare apples to apples.

export type Culture = "arabic" | "chinese" | "spanish" | "russian" | "western";

export interface ParsedName {
  culture: Culture;
  given?: string;
  middle?: string;
  surname?: string;
  /** Arabic patronymic ("son/daughter of"). */
  nasab?: string;
  /** Arabic descriptive epithet (e.g. "al-Salem"). */
  nisbah?: string;
  /** Arabic kunya — "father/mother of" (e.g. "Abu Mohamed"). */
  kunya?: string;
  /** Russian patronymic (e.g. "Ivanovich"). */
  patronymic?: string;
  /** Spanish maternal surname. */
  maternalSurname?: string;
  /** Original normalised string. */
  normalised: string;
  /** Tokens after canonicalisation. */
  tokens: string[];
}

const ARABIC_HINTS = /\b(?:bin|binte?|ibn|ibnu|abu|abou|abdul|abd\s+al|al-|el-|el\s)/i;
const RUSSIAN_PATRONYMIC = /\b\S+(?:ovich|evich|ovna|evna|ich|inov|ovsky|evsky)\b/i;

function detectCulture(s: string): Culture {
  if (ARABIC_HINTS.test(s)) return "arabic";
  if (/[一-鿿]/.test(s)) return "chinese";
  if (RUSSIAN_PATRONYMIC.test(s)) return "russian";
  if (/\b(?:de\s+la\s+|del\s+|de\s+los\s+)/i.test(s)) return "spanish";
  return "western";
}

function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z\s\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseName(input: string): ParsedName {
  const original = (input ?? "").toString();
  const norm = normalise(original);
  const culture = detectCulture(original);
  const tokens = norm.split(" ").filter(Boolean);

  switch (culture) {
    case "arabic": {
      const out: ParsedName = { culture, normalised: norm, tokens };
      // Detect kunya: leading "Abu" / "Abou" / "Umm".
      if (tokens[0] && /^(abu|abou|umm)$/i.test(tokens[0])) {
        out.kunya = tokens.slice(0, 2).join(" ");
      }
      // nasab: contains bin/binte/ibn.
      const nasabIdx = tokens.findIndex((t) => /^(bin|binte|ibn|ibnu)$/i.test(t));
      if (nasabIdx >= 0 && tokens[nasabIdx + 1]) {
        out.nasab = `${tokens[nasabIdx]} ${tokens[nasabIdx + 1]}`;
        out.given = tokens.slice(0, nasabIdx).join(" ");
        out.surname = tokens.slice(nasabIdx + 2).join(" ") || undefined;
      } else {
        out.given = tokens[0];
        out.surname = tokens.slice(1).join(" ") || undefined;
      }
      // nisbah: trailing "al-X" / "El-X".
      const nisbahMatch = tokens.find((t) => /^(al|el)-?$/i.test(t));
      if (nisbahMatch) {
        const idx = tokens.lastIndexOf(nisbahMatch);
        out.nisbah = tokens.slice(idx).join(" ");
      }
      return out;
    }
    case "chinese": {
      // Chinese names are surname-FIRST. For Latin transliterations
      // (Xi Jinping), this still tends to be surname-first.
      return {
        culture,
        normalised: norm,
        tokens,
        ...(tokens.length > 0 ? { surname: tokens[0] } : {}),
        ...(tokens.length > 1 ? { given: tokens.slice(1).join(" ") } : {}),
      };
    }
    case "spanish": {
      // Spanish: given + paternal + maternal (e.g. "Juan García López").
      // Particles "de"/"del"/"de la" stick to the following surname.
      const out: ParsedName = { culture, normalised: norm, tokens };
      out.given = tokens[0];
      if (tokens.length >= 3) {
        out.surname = tokens[tokens.length - 2];
        out.maternalSurname = tokens[tokens.length - 1];
      } else if (tokens.length === 2) {
        out.surname = tokens[1];
      }
      return out;
    }
    case "russian": {
      // Russian: given + patronymic + surname OR surname + given + patronymic.
      const out: ParsedName = { culture, normalised: norm, tokens };
      const patIdx = tokens.findIndex((t) => /(?:ovich|evich|ovna|evna)$/i.test(t));
      if (patIdx >= 0) {
        out.patronymic = tokens[patIdx];
        out.given = tokens.slice(0, patIdx).join(" ") || undefined;
        out.surname = tokens.slice(patIdx + 1).join(" ") || undefined;
      } else {
        out.given = tokens[0];
        out.surname = tokens.slice(1).join(" ") || undefined;
      }
      return out;
    }
    default: {
      return {
        culture: "western",
        normalised: norm,
        tokens,
        ...(tokens.length > 0 ? { given: tokens[0] } : {}),
        ...(tokens.length > 1 ? { surname: tokens.slice(-1)[0] } : {}),
        ...(tokens.length > 2 ? { middle: tokens.slice(1, -1).join(" ") } : {}),
      };
    }
  }
}

/**
 * Cross-culture comparable token: produces the SAME canonical form
 * regardless of which culture parsed the name. Lets the matcher score
 * "Xi Jinping" vs "Jinping Xi" or "Mohamed bin Salman" vs "Mohamed Salman"
 * without losing the cultural structure.
 */
export function canonicalKey(parsed: ParsedName): string {
  const parts = [parsed.given ?? "", parsed.surname ?? "", parsed.maternalSurname ?? ""]
    .filter((s) => s)
    .map((s) => s.toLowerCase().trim());
  return parts.sort().join(" ");
}
