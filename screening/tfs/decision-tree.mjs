/**
 * EOCN TFS Decision Tree Engine — Implements the July 2025 Guidance.
 *
 * Complete decision tree for Targeted Financial Sanctions processing:
 *
 *   SCREENING RESULT
 *   ├── Confirmed Match (100% match)
 *   │   ├── FREEZE immediately (within 24 clock hours)
 *   │   ├── File CNMR via goAML within 5 business days
 *   │   ├── Report to EOCN
 *   │   └── DO NOT notify subject (Art.29)
 *   │
 *   ├── Partial Match (possible match, needs verification)
 *   │   ├── SUSPEND transaction immediately
 *   │   ├── Attempt to obtain identification (10 business days)
 *   │   ├── If confirmed → FREEZE + CNMR path
 *   │   ├── If cannot verify → REJECT + file PNMR within 5 business days
 *   │   └── If false positive → Document and dismiss
 *   │
 *   ├── False Positive (verified non-match)
 *   │   └── Document reasoning, retain for 10 years
 *   │
 *   └── Negative (no match)
 *       └── Proceed with transaction, log screening
 *
 * Regulatory basis:
 *   - Cabinet Decision No. 74 of 2020
 *   - EOCN TFS Guidance (July 2025)
 *   - FDL No.10/2025 Art.35
 */

/** TFS decision states. */
const STATES = {
  SCREENING: 'SCREENING',
  CONFIRMED_MATCH: 'CONFIRMED_MATCH',
  PARTIAL_MATCH: 'PARTIAL_MATCH',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  NEGATIVE: 'NEGATIVE',
  FROZEN: 'FROZEN',
  SUSPENDED: 'SUSPENDED',
  CNMR_PENDING: 'CNMR_PENDING',
  CNMR_FILED: 'CNMR_FILED',
  PNMR_PENDING: 'PNMR_PENDING',
  PNMR_FILED: 'PNMR_FILED',
  VERIFICATION_PENDING: 'VERIFICATION_PENDING',
  REJECTED: 'REJECTED',
  CLEARED: 'CLEARED',
  DISMISSED: 'DISMISSED',
};

/** Deadlines in the TFS workflow. */
const DEADLINES = {
  FREEZE_HOURS: 24,              // Clock hours, NOT business days
  CNMR_BUSINESS_DAYS: 5,        // From taking freezing measure
  PNMR_BUSINESS_DAYS: 5,        // From implementing suspension/rejection
  VERIFICATION_BUSINESS_DAYS: 10, // To obtain ID for partial match
  EOCN_REPORT_IMMEDIATE: true,   // Report to EOCN without delay
};

/**
 * Process a screening result through the TFS decision tree.
 *
 * @param {object} screening
 * @param {string} screening.subjectName - Screened entity name
 * @param {string} screening.outcome     - 'confirmed', 'partial', 'false_positive', 'negative'
 * @param {number} screening.score       - Match confidence (0-1)
 * @param {string[]} [screening.matchedLists] - Which lists matched
 * @param {string} [screening.screeningDate] - ISO date of screening
 * @returns {{ state, actions, deadlines, filings, warnings }}
 */
export function processScreeningResult(screening) {
  const { subjectName, outcome, score, matchedLists = [], screeningDate } = screening;
  const now = new Date();
  const screenDate = screeningDate ? new Date(screeningDate) : now;

  switch (outcome.toLowerCase().replace(/[\s_-]/g, '')) {
    case 'confirmed':
    case 'confirmedmatch':
    case 'truehit':
      return processConfirmedMatch(subjectName, score, matchedLists, screenDate);

    case 'partial':
    case 'partialmatch':
    case 'potentialmatch':
      return processPartialMatch(subjectName, score, matchedLists, screenDate);

    case 'falsepositive':
    case 'false':
      return processFalsePositive(subjectName, score, screenDate);

    case 'negative':
    case 'nomatch':
    case 'clear':
      return processNegative(subjectName, screenDate);

    default:
      return {
        state: STATES.SCREENING,
        error: `Unknown outcome: "${outcome}". Expected: confirmed, partial, false_positive, negative`,
      };
  }
}

function processConfirmedMatch(name, score, lists, screenDate) {
  const freezeDeadline = new Date(screenDate.getTime() + DEADLINES.FREEZE_HOURS * 3600000);
  const cnmrDeadline = addBusinessDays(screenDate, DEADLINES.CNMR_BUSINESS_DAYS);

  return {
    state: STATES.CONFIRMED_MATCH,
    subject: name,
    score,
    matchedLists: lists,
    classification: 'CRITICAL',

    actions: [
      {
        order: 1,
        action: 'FREEZE all assets, funds, and economic resources immediately',
        deadline: freezeDeadline.toISOString(),
        deadlineType: 'CLOCK_HOURS',
        deadlineValue: DEADLINES.FREEZE_HOURS,
        regulation: 'Cabinet Decision 74/2020 Art.4 | EOCN TFS Guidance July 2025',
        mandatory: true,
      },
      {
        order: 2,
        action: 'Report freeze to EOCN without delay',
        deadline: 'IMMEDIATE',
        regulation: 'Cabinet Decision 74/2020 Art.5',
        mandatory: true,
      },
      {
        order: 3,
        action: 'File CNMR (Confirmed Name Match Report) via goAML',
        deadline: cnmrDeadline.toISOString().split('T')[0],
        deadlineType: 'BUSINESS_DAYS',
        deadlineValue: DEADLINES.CNMR_BUSINESS_DAYS,
        regulation: 'EOCN TFS Guidance July 2025',
        mandatory: true,
      },
      {
        order: 4,
        action: 'DO NOT notify the subject or any third party',
        regulation: 'FDL No.10/2025 Art.29 (no tipping off)',
        mandatory: true,
      },
      {
        order: 5,
        action: 'Retain all screening evidence for minimum 10 years',
        regulation: 'FDL No.10/2025 Art.24',
        mandatory: true,
      },
    ],

    deadlines: {
      freeze: { expires: freezeDeadline.toISOString(), hours: DEADLINES.FREEZE_HOURS },
      cnmr: { due: cnmrDeadline.toISOString().split('T')[0], businessDays: DEADLINES.CNMR_BUSINESS_DAYS },
    },

    filings: [
      { type: 'CNMR', status: 'PENDING', due: cnmrDeadline.toISOString().split('T')[0] },
    ],

    warnings: [
      'Asset freeze has NO time limit — remains until delisting by EOCN',
      'Criminal liability for failure to freeze within 24 hours',
      'Tipping off is a criminal offence under FDL Art.29',
    ],

    nextSteps: [
      'Confirm freeze execution and timestamp',
      'Prepare CNMR documentation',
      'Notify senior management (internal only)',
      'Update entity risk rating to CRITICAL',
    ],
  };
}

function processPartialMatch(name, score, lists, screenDate) {
  const verificationDeadline = addBusinessDays(screenDate, DEADLINES.VERIFICATION_BUSINESS_DAYS);
  const pnmrDeadline = addBusinessDays(screenDate, DEADLINES.PNMR_BUSINESS_DAYS);

  return {
    state: STATES.PARTIAL_MATCH,
    subject: name,
    score,
    matchedLists: lists,
    classification: 'HIGH',

    actions: [
      {
        order: 1,
        action: 'SUSPEND the transaction immediately',
        deadline: 'IMMEDIATE',
        regulation: 'EOCN TFS Guidance July 2025',
        mandatory: true,
      },
      {
        order: 2,
        action: 'Attempt to obtain identification documents from subject',
        deadline: verificationDeadline.toISOString().split('T')[0],
        deadlineType: 'BUSINESS_DAYS',
        deadlineValue: DEADLINES.VERIFICATION_BUSINESS_DAYS,
        regulation: 'EOCN TFS Guidance July 2025',
        mandatory: true,
      },
      {
        order: 3,
        action: 'File PNMR (Partial Name Match Report) via goAML within 5 business days from suspension',
        deadline: pnmrDeadline.toISOString().split('T')[0],
        deadlineType: 'BUSINESS_DAYS',
        deadlineValue: DEADLINES.PNMR_BUSINESS_DAYS,
        regulation: 'EOCN TFS Guidance July 2025',
        mandatory: true,
      },
    ],

    deadlines: {
      verification: { due: verificationDeadline.toISOString().split('T')[0], businessDays: DEADLINES.VERIFICATION_BUSINESS_DAYS },
      pnmr: { due: pnmrDeadline.toISOString().split('T')[0], businessDays: DEADLINES.PNMR_BUSINESS_DAYS },
    },

    filings: [
      { type: 'PNMR', status: 'PENDING', due: pnmrDeadline.toISOString().split('T')[0] },
    ],

    decisionTree: {
      'ID obtained + confirmed match': {
        nextState: STATES.CONFIRMED_MATCH,
        action: 'Transition to FREEZE + CNMR path',
      },
      'ID obtained + not a match': {
        nextState: STATES.FALSE_POSITIVE,
        action: 'Document false positive, release transaction',
      },
      'Cannot obtain ID within 10 business days': {
        nextState: STATES.REJECTED,
        action: 'REJECT transaction, file PNMR within 5 business days from rejection',
      },
      'EOCN validates PNMR as confirmed': {
        nextState: STATES.CONFIRMED_MATCH,
        action: 'FREEZE + file CNMR (EOCN escalation)',
      },
    },

    warnings: [
      'Transaction must remain suspended until verification complete',
      'If EOCN validates the PNMR as a confirmed match, you must freeze and file CNMR',
    ],
  };
}

function processFalsePositive(name, score, screenDate) {
  return {
    state: STATES.FALSE_POSITIVE,
    subject: name,
    score,
    classification: 'LOW',

    actions: [
      {
        order: 1,
        action: 'Document the false positive determination with reasoning',
        mandatory: true,
      },
      {
        order: 2,
        action: 'Record the name of the reviewer who made the determination',
        mandatory: true,
      },
      {
        order: 3,
        action: 'Retain screening record for minimum 10 years',
        regulation: 'FDL No.10/2025 Art.24',
        mandatory: true,
      },
    ],

    deadlines: {},
    filings: [],
    warnings: [],
    nextSteps: ['Transaction may proceed', 'Update screening log'],
  };
}

function processNegative(name, screenDate) {
  return {
    state: STATES.NEGATIVE,
    subject: name,
    classification: 'CLEAR',

    actions: [
      {
        order: 1,
        action: 'Log the negative screening result',
        mandatory: true,
      },
    ],

    deadlines: {},
    filings: [],
    warnings: [],
    nextSteps: ['Transaction may proceed', 'Schedule next periodic screening per CDD cycle'],
  };
}

/**
 * Check if any TFS deadlines are breached.
 */
export function checkDeadlines(tfsEvent) {
  const breaches = [];
  const now = new Date();

  if (tfsEvent.deadlines?.freeze) {
    const freezeExpiry = new Date(tfsEvent.deadlines.freeze.expires);
    if (now > freezeExpiry && !tfsEvent.freezeConfirmed) {
      breaches.push({
        type: 'FREEZE',
        severity: 'CRITICAL',
        message: `Asset freeze deadline BREACHED — was due ${tfsEvent.deadlines.freeze.hours}h from screening`,
        regulation: 'Cabinet Decision 74/2020 Art.4',
      });
    }
  }

  if (tfsEvent.deadlines?.cnmr) {
    const cnmrDue = new Date(tfsEvent.deadlines.cnmr.due);
    if (now > cnmrDue && !tfsEvent.cnmrFiled) {
      breaches.push({
        type: 'CNMR',
        severity: 'CRITICAL',
        message: `CNMR filing deadline BREACHED — was due ${tfsEvent.deadlines.cnmr.due}`,
        regulation: 'EOCN TFS Guidance July 2025',
      });
    }
  }

  if (tfsEvent.deadlines?.pnmr) {
    const pnmrDue = new Date(tfsEvent.deadlines.pnmr.due);
    if (now > pnmrDue && !tfsEvent.pnmrFiled) {
      breaches.push({
        type: 'PNMR',
        severity: 'HIGH',
        message: `PNMR filing deadline BREACHED — was due ${tfsEvent.deadlines.pnmr.due}`,
        regulation: 'EOCN TFS Guidance July 2025',
      });
    }
  }

  return breaches;
}

function addBusinessDays(from, days) {
  const d = new Date(from);
  let counted = 0;
  while (counted < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 5 && dow !== 6) counted++;
  }
  return d;
}

export { STATES, DEADLINES };
