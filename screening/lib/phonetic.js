/**
 * Phonetic encoders for sanctions name matching.
 *
 * Two encoders are provided:
 *   - soundex:       classic US Census algorithm, fast, Anglo-biased
 *   - doubleMetaphone: Lawrence Philips' Double Metaphone, handles more
 *                    European spellings. Returns [primary, secondary].
 *
 * These help catch spelling variants ("Mohammed" / "Muhammad" / "Mohamed")
 * that purely string-based fuzzy metrics miss.
 *
 * The Double Metaphone implementation below is a pragmatic port covering
 * the rules that matter most for Arabic, Slavic, and Romance names found
 * on global sanctions lists. It is not a bit-perfect port of the original
 * C reference — the goal is recall, not linguistic purity.
 */

/**
 * Classic Soundex. Always returns a 4-character code (letter + 3 digits).
 */
export function soundex(name) {
  if (!name) return '';
  const s = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const map = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  let out = s[0];
  let prev = map[s[0]] || '';
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const code = map[s[i]] || '';
    if (code && code !== prev) out += code;
    if (code) prev = code;
    else prev = '';
  }
  return (out + '000').slice(0, 4);
}

/**
 * Double Metaphone — primary + alternate encoding.
 * Returns a 2-element array; alternate equals primary if no variant exists.
 */
export function doubleMetaphone(input) {
  if (!input) return ['', ''];
  const s = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return ['', ''];

  let primary = '';
  let alternate = '';
  let i = 0;
  const len = s.length;
  const last = len - 1;

  const at = (offset, substrs) => {
    if (offset + 1 > len) return false;
    for (const sub of substrs) {
      if (s.substr(offset, sub.length) === sub) return true;
    }
    return false;
  };
  const isVowel = (c) => 'AEIOUY'.includes(c);

  // Skip silent initial letters.
  if (at(0, ['GN', 'KN', 'PN', 'WR', 'PS'])) i = 1;
  if (s[0] === 'X') { primary += 'S'; alternate += 'S'; i = 1; }

  while (i < len && (primary.length < 8 || alternate.length < 8)) {
    const c = s[i];
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (i === 0) { primary += 'A'; alternate += 'A'; }
        i++;
        break;
      case 'B':
        primary += 'P'; alternate += 'P';
        i += (s[i + 1] === 'B') ? 2 : 1;
        break;
      case 'C':
        if (i > 0 && !isVowel(s[i - 1]) && at(i, ['CH']) && !at(i, ['CHIA'])) {
          primary += 'K'; alternate += 'K'; i += 2;
        } else if (at(i, ['CH'])) {
          primary += 'X'; alternate += 'X'; i += 2;
        } else if (at(i, ['CZ'])) {
          primary += 'S'; alternate += 'X'; i += 2;
        } else if (at(i + 1, ['IA'])) {
          primary += 'X'; alternate += 'X'; i += 3;
        } else if (at(i, ['CC']) && !(i === 1 && s[0] === 'M')) {
          if (at(i + 2, ['I', 'E', 'H']) && !at(i + 2, ['HU'])) {
            if ((i === 1 && s[0] === 'A') || at(i - 1, ['UCCEE', 'UCCES'])) {
              primary += 'KS'; alternate += 'KS';
            } else { primary += 'X'; alternate += 'X'; }
            i += 3;
          } else { primary += 'K'; alternate += 'K'; i += 2; }
        } else if (at(i, ['CK', 'CG', 'CQ'])) {
          primary += 'K'; alternate += 'K'; i += 2;
        } else if (at(i, ['CI', 'CE', 'CY'])) {
          primary += 'S'; alternate += 'S'; i += 2;
        } else {
          primary += 'K'; alternate += 'K';
          i += (at(i + 1, [' C', ' Q', ' G'])) ? 2 : 1;
        }
        break;
      case 'D':
        if (at(i, ['DG'])) {
          if (at(i + 2, ['I', 'E', 'Y'])) { primary += 'J'; alternate += 'J'; i += 3; }
          else { primary += 'TK'; alternate += 'TK'; i += 2; }
        } else if (at(i, ['DT', 'DD'])) { primary += 'T'; alternate += 'T'; i += 2; }
        else { primary += 'T'; alternate += 'T'; i++; }
        break;
      case 'F':
        primary += 'F'; alternate += 'F';
        i += (s[i + 1] === 'F') ? 2 : 1;
        break;
      case 'G':
        if (s[i + 1] === 'H') {
          if (i > 0 && !isVowel(s[i - 1])) { primary += 'K'; alternate += 'K'; i += 2; }
          else if (i === 0) {
            if (s[i + 2] === 'I') { primary += 'J'; alternate += 'J'; }
            else { primary += 'K'; alternate += 'K'; }
            i += 2;
          } else { i += 2; }
        } else if (s[i + 1] === 'N') {
          if (i === 1 && isVowel(s[0]) && !at(0, ['AGNES'])) {
            primary += 'KN'; alternate += 'N';
          } else { primary += 'N'; alternate += 'KN'; }
          i += 2;
        } else if (at(i, ['GLI'])) { primary += 'KL'; alternate += 'L'; i += 2; }
        else if (i === 0 && (s[1] === 'Y' || at(1, ['ES', 'EP', 'EB', 'EL', 'EY', 'IB', 'IL', 'IN', 'IE', 'EI', 'ER']))) {
          primary += 'K'; alternate += 'J'; i += 2;
        } else if ((at(i + 1, ['ER']) || s[i + 1] === 'Y') && !at(0, ['DANGER', 'RANGER', 'MANGER']) && !at(i - 1, ['E', 'I']) && !at(i - 1, ['RGY', 'OGY'])) {
          primary += 'K'; alternate += 'J'; i += 2;
        } else if (at(i + 1, ['E', 'I', 'Y']) || at(i - 1, ['AGGI', 'OGGI'])) {
          if (at(0, ['VAN ', 'VON ']) || at(0, ['SCH']) || at(i + 1, ['ET'])) {
            primary += 'K'; alternate += 'K';
          } else if (at(i + 1, ['IER '])) { primary += 'J'; alternate += 'J'; }
          else { primary += 'J'; alternate += 'K'; }
          i += 2;
        } else if (s[i + 1] === 'G') { primary += 'K'; alternate += 'K'; i += 2; }
        else { primary += 'K'; alternate += 'K'; i++; }
        break;
      case 'H':
        if ((i === 0 || isVowel(s[i - 1])) && isVowel(s[i + 1])) {
          primary += 'H'; alternate += 'H'; i += 2;
        } else i++;
        break;
      case 'J':
        if (at(i, ['JOSE']) || at(0, ['SAN '])) {
          if ((i === 0 && s[i + 4] === ' ') || at(0, ['SAN '])) {
            primary += 'H'; alternate += 'H';
          } else { primary += 'J'; alternate += 'H'; }
          i++;
        } else {
          if (i === 0 && !at(i, ['JOSE'])) { primary += 'J'; alternate += 'A'; }
          else if (isVowel(s[i - 1]) && (s[i + 1] === 'A' || s[i + 1] === 'O')) {
            primary += 'J'; alternate += 'H';
          } else if (i === last) { primary += 'J'; alternate += ''; }
          else if (!'LTKSNMBZ'.includes(s[i + 1]) && !at(i - 1, ['SKJ', 'LLJ', 'IJ'])) {
            primary += 'J'; alternate += 'J';
          }
          i += (s[i + 1] === 'J') ? 2 : 1;
        }
        break;
      case 'K':
        primary += 'K'; alternate += 'K';
        i += (s[i + 1] === 'K') ? 2 : 1;
        break;
      case 'L':
        if (s[i + 1] === 'L') {
          if ((i === len - 3 && at(i - 1, ['ILLO', 'ILLA', 'ALLE'])) ||
              ((at(last - 1, ['AS', 'OS']) || 'AO'.includes(s[last])) && at(i - 1, ['ALLE']))) {
            primary += 'L'; alternate += '';
            i += 2; break;
          }
          i += 2;
        } else i++;
        primary += 'L'; alternate += 'L';
        break;
      case 'M':
        primary += 'M'; alternate += 'M';
        i += ((at(i - 1, ['UMB']) && (i + 1 === last || at(i + 2, ['ER']))) || s[i + 1] === 'M') ? 2 : 1;
        break;
      case 'N':
        primary += 'N'; alternate += 'N';
        i += (s[i + 1] === 'N') ? 2 : 1;
        break;
      case 'P':
        if (s[i + 1] === 'H') { primary += 'F'; alternate += 'F'; i += 2; }
        else { primary += 'P'; alternate += 'P'; i += 'PB'.includes(s[i + 1]) ? 2 : 1; }
        break;
      case 'Q':
        primary += 'K'; alternate += 'K';
        i += (s[i + 1] === 'Q') ? 2 : 1;
        break;
      case 'R':
        if (i === last && !at(0, ['SCH']) && at(i - 2, ['IE']) && !at(i - 4, ['ME', 'MA'])) {
          primary += ''; alternate += 'R';
        } else { primary += 'R'; alternate += 'R'; }
        i += (s[i + 1] === 'R') ? 2 : 1;
        break;
      case 'S':
        if (at(i - 1, ['ISL', 'YSL'])) { i++; break; }
        if (i === 0 && at(0, ['SUGAR'])) { primary += 'X'; alternate += 'S'; i++; break; }
        if (at(i, ['SH'])) {
          if (at(i + 1, ['HEIM', 'HOEK', 'HOLM', 'HOLZ'])) {
            primary += 'S'; alternate += 'S';
          } else { primary += 'X'; alternate += 'X'; }
          i += 2; break;
        }
        if (at(i, ['SIO', 'SIA', 'SIAN'])) {
          primary += 'S'; alternate += 'X';
          i += 3; break;
        }
        if ((i === 0 && 'MNLW'.includes(s[1])) || s[i + 1] === 'Z') {
          primary += 'S'; alternate += 'X';
          i += (s[i + 1] === 'Z') ? 2 : 1; break;
        }
        if (at(i, ['SC'])) {
          if (s[i + 2] === 'H') {
            if (at(i + 3, ['OO', 'ER', 'EN', 'UY', 'ED', 'EM'])) {
              if (at(i + 3, ['ER', 'EN'])) { primary += 'X'; alternate += 'SK'; }
              else { primary += 'SK'; alternate += 'SK'; }
            } else {
              if (i === 0 && !isVowel(s[3]) && s[3] !== 'W') { primary += 'X'; alternate += 'S'; }
              else { primary += 'X'; alternate += 'X'; }
            }
            i += 3; break;
          }
          if ('IEY'.includes(s[i + 2])) { primary += 'S'; alternate += 'S'; i += 3; break; }
          primary += 'SK'; alternate += 'SK'; i += 3; break;
        }
        if (i === last && at(i - 2, ['AI', 'OI'])) { primary += ''; alternate += 'S'; }
        else { primary += 'S'; alternate += 'S'; }
        i += 'SZ'.includes(s[i + 1]) ? 2 : 1;
        break;
      case 'T':
        if (at(i, ['TION'])) { primary += 'X'; alternate += 'X'; i += 3; break; }
        if (at(i, ['TIA', 'TCH'])) { primary += 'X'; alternate += 'X'; i += 3; break; }
        if (at(i, ['TH']) || at(i, ['TTH'])) {
          if (at(i + 2, ['OM', 'AM']) || at(0, ['VAN ', 'VON ']) || at(0, ['SCH'])) {
            primary += 'T'; alternate += 'T';
          } else { primary += '0'; alternate += 'T'; }
          i += 2; break;
        }
        primary += 'T'; alternate += 'T';
        i += 'TD'.includes(s[i + 1]) ? 2 : 1;
        break;
      case 'V':
        primary += 'F'; alternate += 'F';
        i += (s[i + 1] === 'V') ? 2 : 1;
        break;
      case 'W':
        if (at(i, ['WR'])) { primary += 'R'; alternate += 'R'; i += 2; break; }
        if (i === 0 && (isVowel(s[i + 1]) || at(i, ['WH']))) {
          if (isVowel(s[i + 1])) { primary += 'A'; alternate += 'F'; }
          else { primary += 'A'; alternate += 'A'; }
        }
        if ((i === last && isVowel(s[i - 1])) || at(i - 1, ['EWSKI', 'EWSKY', 'OWSKI', 'OWSKY']) || at(0, ['SCH'])) {
          primary += ''; alternate += 'F';
          i++; break;
        }
        if (at(i, ['WICZ', 'WITZ'])) { primary += 'TS'; alternate += 'FX'; i += 4; break; }
        i++;
        break;
      case 'X':
        if (!(i === last && (at(i - 3, ['IAU', 'EAU']) || at(i - 2, ['AU', 'OU'])))) {
          primary += 'KS'; alternate += 'KS';
        }
        i += 'CX'.includes(s[i + 1]) ? 2 : 1;
        break;
      case 'Z':
        if (s[i + 1] === 'H') { primary += 'J'; alternate += 'J'; i += 2; break; }
        if (at(i + 1, ['ZO', 'ZI', 'ZA']) || (i > 0 && s[i - 1] !== 'T' && at(i, ['Z']))) {
          primary += 'S'; alternate += 'TS';
        } else { primary += 'S'; alternate += 'S'; }
        i += (s[i + 1] === 'Z') ? 2 : 1;
        break;
      default:
        i++;
    }
  }

  return [primary.slice(0, 8), alternate.slice(0, 8)];
}

/**
 * Combined phonetic fingerprint used by the store index.
 * Concatenates soundex + double metaphone primary with a separator, so
 * candidate retrieval can hit either encoding.
 */
export function phoneticKeys(name) {
  if (!name) return [];
  const sx = soundex(name);
  const [dmp, dms] = doubleMetaphone(name);
  const keys = new Set();
  if (sx) keys.add('S:' + sx);
  if (dmp) keys.add('M:' + dmp);
  if (dms && dms !== dmp) keys.add('M:' + dms);
  return [...keys];
}
