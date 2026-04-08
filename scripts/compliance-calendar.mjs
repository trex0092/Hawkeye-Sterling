/**
 * Compliance Calendar Engine — Every recurring regulatory deadline
 * in one place with automated reminders.
 *
 * Tracks:
 *   - Quarterly DPMSR submissions
 *   - Annual EWRA (Enterprise-Wide Risk Assessment)
 *   - Annual LBMA audit
 *   - Annual training
 *   - Monthly MLRO reports
 *   - Quarterly MLRO reports to Board
 *   - Annual programme effectiveness review
 *   - FATF list verification (3x/year: Feb, Jun, Oct)
 *   - goAML registration renewal
 *   - UBO re-verification deadlines
 *   - Policy update deadlines (30 days after new circular)
 */

const today = new Date();
today.setHours(0, 0, 0, 0);

/** All recurring compliance deadlines. */
const DEADLINES = [
  // ── Daily ──
  { id: 'D-01', name: 'Sanctions screening of new transactions/counterparties', frequency: 'daily', regulation: 'FDL No.10/2025 Art.35 | EOCN TFS Guidance', priority: 'HIGH' },
  { id: 'D-02', name: 'Transaction monitoring for threshold breaches (AED 55K)', frequency: 'daily', regulation: 'MoE Circular 08/AML/2021', priority: 'HIGH' },

  // ── Weekly ──
  { id: 'W-01', name: 'MLRO weekly compliance report', frequency: 'weekly', dueDay: 0, regulation: 'FDL No.10/2025 Art.20-21 | Best Practice', priority: 'MEDIUM' },
  { id: 'W-02', name: 'Filing pipeline review (pending STR/DPMSR)', frequency: 'weekly', dueDay: 0, regulation: 'FDL No.10/2025 Art.26-27', priority: 'HIGH' },

  // ── Monthly ──
  { id: 'M-01', name: 'MLRO monthly report to Senior Management', frequency: 'monthly', dueDay: 5, regulation: 'FDL No.10/2025 Art.20-21 | Cabinet Res 134/2025 Art.18', priority: 'HIGH' },
  { id: 'M-02', name: 'Monthly incident log review', frequency: 'monthly', dueDay: 5, regulation: 'Cabinet Res 134/2025 Art.19', priority: 'MEDIUM' },
  { id: 'M-03', name: 'CDD refresh check for overdue entities', frequency: 'monthly', dueDay: 1, regulation: 'Cabinet Res 134/2025 Art.11', priority: 'HIGH' },

  // ── Quarterly ──
  { id: 'Q-01', name: 'Quarterly MLRO report to Board/Senior Management', frequency: 'quarterly', dueMonth: [3, 6, 9, 12], dueDay: 15, regulation: 'FDL No.10/2025 Art.20-21', priority: 'HIGH' },
  { id: 'Q-02', name: 'Quarterly jurisdiction exposure heatmap', frequency: 'quarterly', dueMonth: [3, 6, 9, 12], dueDay: 15, regulation: 'Cabinet Res 134/2025 Art.5 | Best Practice', priority: 'MEDIUM' },
  { id: 'Q-03', name: 'Quarterly DPMS compliance report to MoE', frequency: 'quarterly', dueMonth: [3, 6, 9, 12], dueDay: 15, regulation: 'MoE Circular 08/AML/2021', priority: 'HIGH' },

  // ── Bi-annual ──
  { id: 'B-01', name: 'FATF list verification (February plenary)', frequency: 'biannual', dueMonth: [2], dueDay: 28, regulation: 'FATF Rec 22/23 | Screening config update', priority: 'HIGH' },
  { id: 'B-02', name: 'FATF list verification (June plenary)', frequency: 'biannual', dueMonth: [6], dueDay: 30, regulation: 'FATF Rec 22/23 | Screening config update', priority: 'HIGH' },
  { id: 'B-03', name: 'FATF list verification (October plenary)', frequency: 'biannual', dueMonth: [10], dueDay: 31, regulation: 'FATF Rec 22/23 | Screening config update', priority: 'HIGH' },

  // ── Annual ──
  { id: 'A-01', name: 'Enterprise-Wide Risk Assessment (EWRA/BWRA)', frequency: 'annual', dueMonth: [3], dueDay: 31, regulation: 'Cabinet Res 134/2025 Art.5 | UAE NRA', priority: 'CRITICAL' },
  { id: 'A-02', name: 'Annual MLRO report', frequency: 'annual', dueMonth: [1], dueDay: 31, regulation: 'FDL No.10/2025 Art.20-21', priority: 'HIGH' },
  { id: 'A-03', name: 'Annual AML/CFT/CPF staff training', frequency: 'annual', dueMonth: [12], dueDay: 31, regulation: 'FDL No.10/2025 Art.21 | Cabinet Res 134/2025 Art.20', priority: 'HIGH' },
  { id: 'A-04', name: 'Annual programme effectiveness review', frequency: 'annual', dueMonth: [12], dueDay: 31, regulation: 'Cabinet Res 134/2025 Art.19 | FATF Rec 18', priority: 'HIGH' },
  { id: 'A-05', name: 'Independent AML/CFT audit', frequency: 'annual', dueMonth: [12], dueDay: 31, regulation: 'Cabinet Res 134/2025 Art.19 | FATF Rec 18', priority: 'CRITICAL' },
  { id: 'A-06', name: 'LBMA Responsible Gold Guidance annual audit', frequency: 'annual', dueMonth: [3], dueDay: 31, regulation: 'LBMA RGG v9 Step 4', priority: 'CRITICAL' },
  { id: 'A-07', name: 'OECD Step 5 annual DD report publication', frequency: 'annual', dueMonth: [6], dueDay: 30, regulation: 'OECD DD Guidance Step 5', priority: 'HIGH' },
  { id: 'A-08', name: 'PF risk assessment review', frequency: 'annual', dueMonth: [3], dueDay: 31, regulation: 'Cabinet Res 156/2025 | FATF Rec 1, 2, 7', priority: 'HIGH' },
  { id: 'A-09', name: 'Customer exit report (relationship terminations)', frequency: 'annual', dueMonth: [12], dueDay: 31, regulation: 'Cabinet Res 134/2025 Art.11 | Best Practice', priority: 'MEDIUM' },
  { id: 'A-10', name: 'goAML registration renewal/verification', frequency: 'annual', dueMonth: [1], dueDay: 31, regulation: 'MoE Circular 08/AML/2021', priority: 'HIGH' },

  // ── Event-driven (check monthly) ──
  { id: 'E-01', name: 'Policy update within 30 days of new MoE circular', frequency: 'event', regulation: 'FDL No.10/2025 | Cabinet Res 134/2025', priority: 'HIGH' },
  { id: 'E-02', name: 'UBO re-verification within 15 working days of ownership change', frequency: 'event', regulation: 'Cabinet Decision 109/2023', priority: 'HIGH' },
  { id: 'E-03', name: 'CO/MLRO change notification to MoE', frequency: 'event', regulation: 'Cabinet Res 134/2025 Art.18', priority: 'CRITICAL' },
];

/**
 * Get all deadlines with their current status.
 * @returns {{ upcoming, overdue, current, calendar }}
 */
export function getCalendar() {
  const upcoming = [];
  const overdue = [];
  const current = [];

  for (const dl of DEADLINES) {
    const status = getDeadlineStatus(dl);
    const entry = { ...dl, ...status };

    if (status.status === 'OVERDUE') overdue.push(entry);
    else if (status.status === 'DUE_SOON') upcoming.push(entry);
    else current.push(entry);
  }

  overdue.sort((a, b) => (a.daysUntil || 0) - (b.daysUntil || 0));
  upcoming.sort((a, b) => (a.daysUntil || 0) - (b.daysUntil || 0));

  return {
    overdue: overdue.length,
    upcoming: upcoming.length,
    current: current.length,
    total: DEADLINES.length,
    items: { overdue, upcoming, current },
  };
}

function getDeadlineStatus(dl) {
  if (dl.frequency === 'daily') {
    return { status: 'RECURRING', nextDue: 'Today', daysUntil: 0 };
  }

  if (dl.frequency === 'weekly') {
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));
    const days = Math.round((nextSunday - today) / 86400000);
    return { status: days <= 2 ? 'DUE_SOON' : 'CURRENT', nextDue: nextSunday.toISOString().split('T')[0], daysUntil: days };
  }

  if (dl.frequency === 'monthly') {
    // Check if this month's deadline has passed without completion
    const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dl.dueDay || 5);
    const nextMonthDue = new Date(today.getFullYear(), today.getMonth() + 1, dl.dueDay || 5);
    const days = Math.round((thisMonthDue - today) / 86400000);
    // If this month's due date has passed, show as overdue until next month's due
    if (days < 0) {
      return { status: 'OVERDUE', nextDue: thisMonthDue.toISOString().split('T')[0], daysUntil: days };
    }
    return {
      status: days <= 7 ? 'DUE_SOON' : 'CURRENT',
      nextDue: thisMonthDue.toISOString().split('T')[0],
      daysUntil: days,
    };
  }

  if (dl.frequency === 'quarterly' || dl.frequency === 'biannual') {
    const months = dl.dueMonth || [];
    let nextDue = null;
    for (const m of months) {
      const candidate = new Date(today.getFullYear(), m - 1, dl.dueDay || 15);
      if (candidate < today) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      if (!nextDue || candidate < nextDue) nextDue = candidate;
    }
    if (!nextDue) return { status: 'CURRENT', nextDue: 'N/A', daysUntil: 999 };
    const days = Math.round((nextDue - today) / 86400000);
    return {
      status: days < 0 ? 'OVERDUE' : days <= 14 ? 'DUE_SOON' : 'CURRENT',
      nextDue: nextDue.toISOString().split('T')[0],
      daysUntil: days,
    };
  }

  if (dl.frequency === 'annual') {
    const months = dl.dueMonth || [12];
    const nextDue = new Date(today.getFullYear(), months[0] - 1, dl.dueDay || 31);
    if (nextDue < today) nextDue.setFullYear(nextDue.getFullYear() + 1);
    const days = Math.round((nextDue - today) / 86400000);
    return {
      status: days < 0 ? 'OVERDUE' : days <= 30 ? 'DUE_SOON' : 'CURRENT',
      nextDue: nextDue.toISOString().split('T')[0],
      daysUntil: days,
    };
  }

  return { status: 'EVENT_DRIVEN', nextDue: 'When triggered', daysUntil: null };
}

// ── CLI ─────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Compliance Deadline Calendar');
  console.log('============================\n');

  const cal = getCalendar();

  if (cal.items.overdue.length > 0) {
    console.log('\x1b[31mOVERDUE:\x1b[0m');
    for (const d of cal.items.overdue) {
      console.log(`  [${d.priority}] ${d.id}: ${d.name}`);
      console.log(`    Due: ${d.nextDue} | Reg: ${d.regulation}`);
    }
    console.log();
  }

  if (cal.items.upcoming.length > 0) {
    console.log('\x1b[33mUPCOMING:\x1b[0m');
    for (const d of cal.items.upcoming) {
      console.log(`  [${d.priority}] ${d.id}: ${d.name} (${d.daysUntil} days)`);
      console.log(`    Due: ${d.nextDue} | Reg: ${d.regulation}`);
    }
    console.log();
  }

  console.log(`\x1b[32mCURRENT:\x1b[0m ${cal.items.current.length} deadlines on track`);
  console.log(`\nTotal: ${cal.total} | Overdue: ${cal.overdue} | Upcoming: ${cal.upcoming}`);
}
