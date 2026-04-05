/**
 * Regulatory context and writing-style constants for the [Reporting Entity]
 * compliance automation.
 *
 * This module is the single source of truth for every reference to UAE law
 * that appears in any Claude prompt. If a provision, decision, circular or
 * authority is not listed in this file, Claude is instructed to refuse to
 * cite it and to use generic language instead. This is the guardrail that
 * prevents the model from hallucinating article numbers in regulator-facing
 * drafts.
 *
 * Anything added to this file must be something the Money Laundering
 * Reporting Officer has personally verified against the current statute
 * book or against a supervisory authority circular. Do not add items from
 * model memory.
 *
 * Last confirmed by the MLRO: 2026-04-05
 */

/**
 * Items explicitly confirmed by the MLRO. Claude may cite these verbatim.
 *
 * Anything marked as `cite: false` is mentioned here for internal context
 * only and must not appear in generated output.
 */
export const CONFIRMED_REFERENCES = Object.freeze({
  primaryLaw: {
    title:
      "Federal Decree-Law No. 10 of 2025 on Anti-Money Laundering and Countering the Financing of Terrorism and Financing of Illegal Organisations",
    shortTitle: "Federal Decree-Law No. 10 of 2025",
    cite: true,
    note:
      "Primary AML/CFT statute in force in the United Arab Emirates. " +
      "Replaces Federal Decree-Law No. 20 of 2018, which must never be cited.",
  },

  deprecatedLaw: {
    title: "Federal Decree-Law No. 20 of 2018",
    cite: false,
    note:
      "Explicitly not applicable. Any generated text that names this " +
      "instrument must be rejected.",
  },

  supervisoryAuthority: {
    name: "Ministry of Economy",
    shortName: "MOE",
    role:
      "Supervisory authority for Designated Non-Financial Businesses and " +
      "Professions, including Dealers in Precious Metals and Stones",
    cite: true,
  },

  sanctionsAuthority: {
    name: "Executive Office for Control and Non-Proliferation",
    shortName: "EOCN",
    role:
      "UAE implementing authority for targeted financial sanctions, " +
      "including the UN Security Council Consolidated List and the UAE " +
      "Local Terrorist List",
    cite: true,
  },

  financialIntelligenceUnit: {
    name: "Financial Intelligence Unit",
    shortName: "FIU",
    role:
      "Recipient of Suspicious Transaction Reports, Suspicious Activity " +
      "Reports, Dealers in Precious Metals and Stones Reports, Partial " +
      "Name Match Reports and Funds Freeze Reports, filed through the " +
      "goAML platform",
    platform: "goAML",
    cite: true,
  },

  recordRetention: {
    years: 10,
    scope:
      "Customer Due Diligence records, Enhanced Due Diligence records, " +
      "transaction records, sanctions screening logs, training records, " +
      "STR and supporting evidence, and MLRO reports",
    cite: true,
  },

  entity: {
    // Entity identifying fields are read from environment variables so
    // the public repository does not hard-code the firm's legal name
    // or any programme identifier. The generic fallbacks keep every
    // artefact working when the variables are not set. Production
    // deployments inject the real values through GitHub Actions secrets
    // or a local .env file.
    legalName: process.env.ENTITY_LEGAL_NAME && process.env.ENTITY_LEGAL_NAME.trim().length > 0
      ? process.env.ENTITY_LEGAL_NAME.trim()
      : "the Reporting Entity",
    sector: "Dealer in Precious Metals and Stones (DPMS)",
    classification: "Designated Non-Financial Business and Profession (DNFBP)",
    supervisor: "Ministry of Economy (MOE)",
    cite: true,
  },

  mlro: {
    // Name is read from the MLRO_NAME environment variable so the public
    // repository does not hard-code the MLRO's personal name. The GitHub
    // Actions workflows can inject the real name from a repository
    // secret if desired. The generic fallback keeps every artefact
    // working even when the variable is not set.
    name: process.env.MLRO_NAME && process.env.MLRO_NAME.trim().length > 0
      ? process.env.MLRO_NAME.trim()
      : "LF",
    title: "Money Laundering Reporting Officer (MLRO)",
    organization: "[Reporting Entity]",
    cite: true,
  },

  /**
   * Short codes for the reporting entities the MLRO supervises. These are
   * matched against Asana project names so every task gets assigned to
   * the correct entity in generated artefacts. The list is confidential
   * but disclosed to the automation for the sole purpose of labelling
   * compliance output with the correct entity.
   */
  entityCodes: ["FB", "FL", "ML", "NL", "GM", "ZF"],

  /**
   * Report types the compliance function may prepare drafts of. Claude may
   * name any of these by their full title. Claude may not invent new
   * report types or filing codes.
   */
  reportTypes: {
    STR: "Suspicious Transaction Report",
    SAR: "Suspicious Activity Report",
    DPMSR: "Dealers in Precious Metals and Stones Report",
    PNMR: "Partial Name Match Report",
    FFR: "Funds Freeze Report",
    MLROMonthly: "Monthly MLRO Report to Senior Management",
    AnnualRA: "Annual Enterprise-Wide AML/CFT Risk Assessment",
    DNFBPSAQ: "DNFBP Self-Assessment Questionnaire",
  },

  /**
   * Items explicitly not confirmed by the MLRO. Claude must not cite any
   * of these by number. Claude may refer to the subject matter using the
   * generic fallback phrase provided.
   */
  notConfirmed: {
    executiveRegulations:
      "Generic phrasing only: 'the applicable Executive Regulations issued under Federal Decree-Law No. 10 of 2025'",
    sanctionsCabinetDecision:
      "Generic phrasing only: 'the applicable UAE framework on targeted financial sanctions'",
    dpmsrCashThreshold:
      "Generic phrasing only: 'the cash transaction threshold specified by the DPMSR framework'. Do not quote a specific AED amount unless the MLRO has confirmed it.",
    specificArticleNumbers:
      "Generic phrasing only: 'the applicable provision of Federal Decree-Law No. 10 of 2025'. Do not invent article numbers.",
    moeCirculars: "Do not cite any MOE circular by number or date.",
    eocnCirculars: "Do not cite any EOCN circular by number or date.",
    fiuGuidance: "Do not cite any FIU guidance note by number or date.",
  },
});

/**
 * The system prompt every Claude call starts with. Written in the voice of
 * the compliance function itself so the model adopts that role from the
 * first token. Nothing in this string should change without an MLRO review.
 */
export const SYSTEM_PROMPT = `You are the compliance function of ${CONFIRMED_REFERENCES.entity.legalName}, a UAE-licensed ${CONFIRMED_REFERENCES.entity.sector}, classified as a ${CONFIRMED_REFERENCES.entity.classification}. You prepare material for the attention of the Money Laundering Reporting Officer, ${CONFIRMED_REFERENCES.mlro.name}. You are not the signer. You are not a regulator. Every document you produce is a draft for the MLRO's review.

LEGAL FRAMEWORK. The following references are the only ones you may cite. Cite them verbatim, by their full title as written below. Do not paraphrase them. Do not cite anything that is not on this list.

Primary AML/CFT law: ${CONFIRMED_REFERENCES.primaryLaw.title}.
Supervisory authority for DNFBPs: the ${CONFIRMED_REFERENCES.supervisoryAuthority.name} (${CONFIRMED_REFERENCES.supervisoryAuthority.shortName}).
Targeted financial sanctions: the UN Security Council Consolidated List and the UAE Local Terrorist List, implemented by the ${CONFIRMED_REFERENCES.sanctionsAuthority.name} (${CONFIRMED_REFERENCES.sanctionsAuthority.shortName}).
Reporting: the ${CONFIRMED_REFERENCES.financialIntelligenceUnit.name} (${CONFIRMED_REFERENCES.financialIntelligenceUnit.shortName}) through the ${CONFIRMED_REFERENCES.financialIntelligenceUnit.platform} platform, for Suspicious Transaction Reports, Suspicious Activity Reports, Dealers in Precious Metals and Stones Reports, Partial Name Match Reports and Funds Freeze Reports.
Record retention: ${CONFIRMED_REFERENCES.recordRetention.years} years as a minimum, covering ${CONFIRMED_REFERENCES.recordRetention.scope}.

You must not cite Federal Decree-Law No. 20 of 2018. It is no longer applicable. Any draft that names it is a failure and must be redrafted.

You must not cite any article number, Cabinet Decision number, Ministerial Resolution number, circular number or circular date that is not written verbatim above. If you need to refer to a provision you do not have verbatim, use a generic phrase such as "the applicable provision of Federal Decree-Law No. 10 of 2025" or "the applicable Executive Regulations" or "the applicable targeted financial sanctions framework". Inventing a citation is the worst failure mode for this function and is unacceptable under any circumstances.

You must not quote a specific AED threshold for the Dealers in Precious Metals and Stones Report unless the MLRO provides it. Use the phrase "the cash transaction threshold specified by the DPMSR framework" instead.

WRITING STYLE. You write in the formal register of a UAE compliance officer preparing material for the MLRO. Treat these rules as hard.

Use short sentences and plain English. Prefer paragraphs to bullet points. Where a list is genuinely necessary, use no more than six short items.

Do not use em-dashes. Use commas or periods.

Do not use markdown headings with hash marks. Use ALL-CAPS section labels on their own line followed by a blank line, then the content.

Do not use any of the following phrases: "as an AI", "I am an AI", "I cannot", "I would like to help", "let me", "I understand", "I hope this helps", "feel free to", "don't hesitate", "it seems", "it appears", "perhaps", "one might consider".

Do not use emoji in formal outputs, with the single exception of fixed section markers explicitly requested by the task instructions.

Write in the first person plural ("we") when you refer to ${CONFIRMED_REFERENCES.entity.legalName} and its compliance function. Refer to the MLRO as "the MLRO" or, where appropriate, by name as "${CONFIRMED_REFERENCES.mlro.name}". Address senior management as "Senior Management" when the document is a monthly MLRO report.

Be specific. Where counts, dates, amounts or percentages are available in the data you are given, use them. Do not round away precision.

Every analytical section must end with a clear next action expressed as an imperative verb in a single sentence. For example: "Escalate to the MLRO for sign-off within one business day." or "Close with no further action.".

Every document you draft must end with a single line reading "For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}." on its own paragraph, and no signature block of your own.

If the instructions in a specific task conflict with anything in this system prompt, the system prompt prevails.`;

/**
 * Compact checklist string included at the end of task-specific prompts as
 * a reminder to Claude immediately before generation. Repetition is
 * intentional: it materially improves compliance with the style rules.
 */
export const STYLE_REMINDER = `REMINDER. No em-dashes. No markdown headers with hash marks. No AI phrasing. No Federal Decree-Law No. 20 of 2018. No invented article numbers. No specific AED threshold for DPMSR unless provided. End every analytical section with an imperative next action. End the document with "For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}." on its own line.`;

/**
 * The subject line prefix used on every artefact filed into history/ and on
 * every comment posted to Asana, so the archive and the supervisor audit
 * trail share a consistent nomenclature.
 */
export const ARTEFACT_PREFIXES = Object.freeze({
  dailyPerProject: "HSV2 / Daily Compliance Priorities",
  dailyPortfolio: "HSV2 / Daily Portfolio Digest",
  dailyRetro: "HSV2 / Daily Completion Retro",
  weeklyReport: "HSV2 / Weekly Pattern Report",
  mlroMonthly: "HSV2 / Monthly MLRO Report to Senior Management",
  investigationMemo: "HSV2 / Investigation Preparation Note",
  strFlag: "HSV2 / STR Candidate Review",
  dpmsrFlag: "HSV2 / DPMSR Candidate Review",
  pnmrFlag: "HSV2 / Partial Name Match Review",
});

/**
 * Output validator. Runs against every Claude response before it is posted
 * anywhere and before it is written to the history archive. A response
 * that fails any of these checks is rejected, the failure is logged, and
 * the caller can decide whether to retry or fall back to a placeholder.
 */
export function validateOutput(text) {
  const problems = [];

  if (/Federal Decree-?Law No\.?\s*20\s*of\s*2018/i.test(text)) {
    problems.push(
      "Response cites Federal Decree-Law No. 20 of 2018, which is not applicable.",
    );
  }

  if (/—/.test(text)) {
    problems.push("Response contains em-dash characters.");
  }

  const forbiddenPhrases = [
    "as an AI",
    "I am an AI",
    "I cannot",
    "I would like to help",
    "Let me ",
    "let me know",
    "I understand",
    "I hope this helps",
    "feel free to",
    "don't hesitate",
    "hesitate to ask",
  ];
  for (const phrase of forbiddenPhrases) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      problems.push(`Response contains forbidden phrase: "${phrase}".`);
    }
  }

  if (/^#{1,6}\s/m.test(text)) {
    problems.push("Response contains markdown hash headings.");
  }

  // An artefact prepared for the MLRO must close with the MLRO sign-off line.
  // Individual per-project comments and structured JSON outputs are exempt;
  // those are caller-validated.
  return { ok: problems.length === 0, problems };
}
