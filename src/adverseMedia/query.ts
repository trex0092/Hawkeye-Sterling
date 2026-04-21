import { ADVERSE_MEDIA_CATEGORIES } from './taxonomy.js';

export const ADVERSE_MEDIA_QUERY_FIXED: string =
  'launder OR fraud OR bribe OR corrupt OR arrest OR blackmail OR breach OR ' +
  'convict OR "court case" OR embezzle OR extort OR felon OR fined OR guilty ' +
  'OR illegal OR imprisonment OR jail OR kickback OR litigate OR mafia OR ' +
  'murder OR prosecute OR terrorism OR theft OR unlawful OR verdict OR ' +
  'politic OR sanctions OR "money laundering" OR "financial crime" OR ' +
  '"economic crime" OR "terrorist financing" OR "financing of terrorism" OR ' +
  '"terror funding" OR extremist OR radicalisation OR "designated terrorist" ' +
  'OR militant OR "proliferation financing" OR "weapons of mass destruction" ' +
  'OR WMD OR "dual-use" OR "sanctions evasion" OR "arms trafficking" OR ' +
  '"weapons smuggling" OR nuclear OR "chemical weapons" OR "biological ' +
  'weapons" OR "tax evasion" OR "tax fraud" OR "VAT fraud" OR Ponzi OR ' +
  '"pyramid scheme" OR "insider trading" OR "market manipulation" OR ' +
  '"accounting fraud" OR "asset misappropriation" OR forgery OR ' +
  'counterfeiting OR "identity theft" OR "cyber fraud" OR "wire fraud" OR ' +
  'corruption OR "abuse of power" OR "conflict of interest" OR "misuse of ' +
  'funds" OR kleptocracy OR "state capture" OR "organised crime" OR "drug ' +
  'trafficking" OR narcotics OR cartel OR "human trafficking" OR "people ' +
  'smuggling" OR "forced labour" OR "modern slavery" OR "wildlife ' +
  'trafficking" OR cybercrime OR ransomware OR darknet OR debarred OR ' +
  'blacklisted OR "regulatory breach"';

function quoteIfMultiWord(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

export function buildAdverseMediaQuery(subjectName?: string): string {
  const terms = Array.from(
    new Set(ADVERSE_MEDIA_CATEGORIES.flatMap((c) => c.keywords.map(quoteIfMultiWord))),
  );
  const risk = terms.join(' OR ');
  if (!subjectName || !subjectName.trim()) return risk;
  const safeName = subjectName.replace(/["\\]/g, '').trim();
  return `"${safeName}" AND (${risk})`;
}
