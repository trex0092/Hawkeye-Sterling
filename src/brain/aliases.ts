// Hawkeye Sterling — alias expander.
// Given a subject name, produce the bounded set of plausible variants for
// matching:
//   - romanisation variants (Muhammad / Mohammed / Mohamed / Mohamad / Mohd)
//   - name-order flips (given-name first ↔ family-name first)
//   - particle-stripped forms (al-, el-, bin, abu, etc.)
//   - honorific-stripped forms (H.H., Sheikh, Dr., Mr., ...)
//   - canonicalised form (`normaliseArabicRoman`)
//
// The expander NEVER manufactures identity. It only lists the plausible
// renderings of the SAME name. Disambiguation across different persons is
// the job of `confidence.calibrateConfidence`.

import { romanise, variantsOf, normaliseArabicRoman } from './translit.js';

export interface AliasExpansion {
  input: string;
  canonical: string;
  variants: string[];
}

function permuteOrder(tokens: string[]): string[] {
  if (tokens.length < 2) return [tokens.join(' ')];
  const out = new Set<string>();
  out.add(tokens.join(' '));
  // Flip: last-name-first and first-name-first.
  const flipped = [tokens[tokens.length - 1] ?? '', ...tokens.slice(0, -1)];
  out.add(flipped.join(' '));
  const first = [...tokens.slice(1), tokens[0] ?? ''];
  out.add(first.join(' '));
  return [...out];
}

export function expandAliases(input: string): AliasExpansion {
  const r = romanise(input);
  const baseTokens = r.normalised.split(' ').filter(Boolean);
  const canonical = normaliseArabicRoman(input);

  const variants = new Set<string>();
  variants.add(r.raw.trim());
  variants.add(r.normalised);
  variants.add(canonical);
  for (const permutation of permuteOrder(baseTokens)) variants.add(permutation);

  // For each token that has a known romanisation family, inject every variant.
  for (let i = 0; i < baseTokens.length; i++) {
    const vs = variantsOf(baseTokens[i] ?? '');
    if (vs.length <= 1) continue;
    for (const v of vs) {
      const swapped = [...baseTokens];
      swapped[i] = v;
      variants.add(swapped.join(' '));
    }
  }

  variants.delete('');
  return {
    input,
    canonical,
    variants: [...variants],
  };
}
