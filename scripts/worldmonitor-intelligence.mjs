/**
 * World Monitor intelligence feed — daily compliance intelligence scan.
 *
 * Fetches geopolitical intelligence events from World Monitor / GDELT
 * for jurisdictions in the FATF grey/blacklists plus UAE, then produces
 * a daily intelligence briefing and records observations in the Claude
 * memory system.
 *
 * Schedule: Daily (GitHub Actions) or on-demand.
 * Archive:  history/daily-ops/YYYY-MM-DD-intelligence.txt
 *
 * Deterministic unless ANTHROPIC_API_KEY is set, in which case Claude
 * synthesises a narrative summary of the top signals.
 */

import path from 'node:path';
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from './lib/report-scaffold.mjs';
import { writeHistory, isoDate } from './history-writer.mjs';
import { renderDocxBuffer } from './lib/docx-writer.mjs';

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const dryRun = process.env.DRY_RUN === 'true';

// Lazy-import the World Monitor adapter (screening module)
const { fetchIntelligence, scoreIntelligence, jurisdictionBriefing, SIGNAL_CATEGORIES } =
  await import('../screening/sources/worldmonitor.js');

// Jurisdictions to monitor: FATF lists + UAE + key trading partners
const WATCH_JURISDICTIONS = [
  'AE', // UAE (home jurisdiction)
  'IR', 'KP', 'MM', // FATF blacklist
  'IN', 'CN', 'RU', 'TR', 'ZA', 'NG', 'LB', 'PK', // Key trading / risk
];

const SIGNAL_LABELS = {
  sanctions: 'Sanctions',
  fatf: 'FATF / AML',
  jurisdiction_risk: 'Jurisdiction Risk',
  regulatory: 'Regulatory Action',
  precious_metals: 'Precious Metals & Stones',
};

async function main() {
  console.log(`World Monitor Intelligence Scan — ${today}`);
  console.log('='.repeat(50));

  const allEvents = [];
  const briefings = [];

  // Fetch intelligence for each watched jurisdiction
  for (const country of WATCH_JURISDICTIONS) {
    try {
      console.log(`\nScanning ${country}...`);
      const briefing = await jurisdictionBriefing(country, {
        hours: 24,
        limit: 20,
        cacheDir: path.resolve(process.cwd(), '..', '.screening', 'cache'),
        logger: (msg) => console.log(`  ${msg}`),
      });

      if (briefing.events.length > 0) {
        briefings.push(briefing);
        allEvents.push(...briefing.events);
        console.log(`  Found ${briefing.events.length} signals (lift: ${briefing.score.lift})`);
      } else {
        console.log('  No compliance signals.');
      }
    } catch (err) {
      console.error(`  Error scanning ${country}: ${err.message}`);
    }
  }

  // Also fetch global sanctions/FATF signals not tied to a specific country
  try {
    console.log('\nScanning global signals...');
    const globalEvents = await fetchIntelligence({
      hours: 24,
      limit: 30,
      cacheDir: path.resolve(process.cwd(), '..', '.screening', 'cache'),
      logger: (msg) => console.log(`  ${msg}`),
    });
    const globalScore = scoreIntelligence(globalEvents);
    if (globalEvents.length > 0) {
      briefings.push({
        country: 'GLOBAL',
        events: globalEvents,
        score: globalScore,
        briefing: `Global intelligence: ${globalEvents.length} signals`,
      });
      allEvents.push(...globalEvents);
      console.log(`  Found ${globalEvents.length} global signals`);
    }
  } catch (err) {
    console.error(`  Error scanning global: ${err.message}`);
  }

  // Deduplicate events by URL
  const seen = new Set();
  const uniqueEvents = [];
  for (const e of allEvents) {
    if (!seen.has(e.url)) {
      seen.add(e.url);
      uniqueEvents.push(e);
    }
  }

  // Build the intelligence report
  const report = buildReport(uniqueEvents, briefings);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total unique signals: ${uniqueEvents.length}`);
  console.log(`Jurisdictions with activity: ${briefings.filter(b => b.events.length > 0).length}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Report:\n');
    console.log(report);
    return;
  }

  // Archive the report
  const archivePath = `daily-ops/${today}-intelligence.txt`;
  await writeHistory(archivePath, report);
  console.log(`Archived to history/${archivePath}`);

  // Record in Claude memory system (if available)
  await recordInMemory(uniqueEvents, briefings);

  // Post to Asana if configured
  if (env.ASANA_TOKEN && uniqueEvents.length > 0) {
    try {
      const asanaClient = createAsanaClient(env);
      const headline = uniqueEvents.length > 0
        ? `Intelligence scan: ${uniqueEvents.length} signals across ${briefings.length} jurisdictions`
        : 'Intelligence scan: no compliance signals detected';

      // Attempt to post as comment on pinned task
      await tryArchive(asanaClient, env, headline, report, today);
    } catch (err) {
      console.error(`Asana posting error: ${err.message}`);
    }
  }
}

function buildReport(events, briefings) {
  const lines = [];

  lines.push(`WORLD MONITOR INTELLIGENCE BRIEFING`);
  lines.push(`Date: ${today}`);
  lines.push(`Prepared by: Automated compliance intelligence system`);
  lines.push(`Classification: Internal, for MLRO review`);
  lines.push('');

  // Summary
  lines.push('1. EXECUTIVE SUMMARY');
  lines.push('');
  const catCounts = {};
  for (const e of events) {
    for (const s of e.signals) {
      catCounts[s] = (catCounts[s] || 0) + 1;
    }
  }
  lines.push(`Total compliance signals detected: ${events.length}`);
  lines.push(`Signal breakdown:`);
  for (const [cat, label] of Object.entries(SIGNAL_LABELS)) {
    if (catCounts[cat]) {
      lines.push(`  ${label}: ${catCounts[cat]}`);
    }
  }
  lines.push('');

  // Jurisdiction briefings
  lines.push('2. JURISDICTION BRIEFINGS');
  lines.push('');

  for (const b of briefings) {
    if (b.events.length === 0) continue;
    lines.push(`--- ${b.country} (${b.events.length} signals, risk lift: ${b.score.lift}) ---`);
    for (const e of b.events.slice(0, 5)) {
      const date = e.date ? e.date.split('T')[0] : 'n/a';
      lines.push(`  [${date}] ${e.title.slice(0, 100)}`);
      lines.push(`    Category: ${SIGNAL_LABELS[e.category] || e.category} | Source: ${e.domain}`);
    }
    if (b.events.length > 5) {
      lines.push(`  ... and ${b.events.length - 5} more signals`);
    }
    lines.push('');
  }

  // Action items
  lines.push('3. RECOMMENDED ACTIONS');
  lines.push('');

  const highLift = briefings.filter(b => b.score.lift >= 0.05);
  if (highLift.length > 0) {
    lines.push('The following jurisdictions warrant enhanced attention:');
    for (const b of highLift) {
      lines.push(`  ${b.country}: lift ${b.score.lift}, top signal: ${b.score.topSignal || 'mixed'}`);
    }
    lines.push('');
    lines.push('Recommendation: Review counterparty exposure to the above jurisdictions.');
    lines.push('Cross-reference with the quarterly jurisdiction heatmap.');
  } else {
    lines.push('No jurisdictions triggered enhanced attention thresholds.');
    lines.push('Routine monitoring continues.');
  }

  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

/**
 * Record intelligence observations in the Claude memory system.
 */
async function recordInMemory(events, briefings) {
  try {
    const mem = (await import('../claude-mem/index.mjs')).default;

    // Only record if there's an active session or we can start one
    const sessionId = `intelligence-${today}`;
    mem.startSession(sessionId);

    // Record high-relevance events
    const topEvents = events
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);

    for (const e of topEvents) {
      mem.observe({
        category: 'regulatory_observation',
        content: `[Intelligence] ${e.category}: ${e.title.slice(0, 200)} (${e.domain}, tone: ${e.tone})`,
        importance: e.signals.includes('sanctions') || e.signals.includes('fatf') ? 8 : 6,
      });
    }

    // Record jurisdiction risk summaries
    for (const b of briefings) {
      if (b.score.lift >= 0.03) {
        mem.observe({
          category: 'risk_assessment',
          content: `[Intelligence] ${b.country} risk lift: ${b.score.lift} (${b.score.categories.join(', ')}) — ${b.events.length} signals`,
          entityName: b.country,
          importance: b.score.lift >= 0.05 ? 8 : 6,
        });
      }
    }

    await mem.endSession(`Intelligence scan: ${events.length} signals, ${briefings.length} jurisdictions`);
    mem.close();
    console.log('Intelligence observations recorded in memory system.');
  } catch (err) {
    // Memory system may not be set up yet — non-critical
    console.log(`Memory system not available: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
