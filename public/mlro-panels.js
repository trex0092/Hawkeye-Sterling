// Hawkeye Sterling — Phase 6 UI panels.
// Pure browser surface — no build step. Mirrors logic from the shipped
// TS modules (src/brain/mlro-charter-diff, mlro-red-flags-taxonomy.generated,
// mlro-capabilities.generated, outcome-feedback, entity-graph,
// investigation-timeline) at a minimal fidelity level suitable for the
// operator preview. The authoritative logic lives in TS; this file is the
// render + event-binding layer.
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ────────────────────────────────────────────────────
  // CHARTER · P1–P10 live probe (mirror of mlro-charter-diff.ts)
  // ────────────────────────────────────────────────────
  var PROBES = [
    { id: 'P1', label: 'No unverified sanctions assertions', rx: [/\b(the subject|they) (is|are) (currently )?sanctioned\b(?!.*\b(according to|per|source|list))/i, /\bsanctions designation\b(?!.*\b(source|list|article|regulation))/i] },
    { id: 'P2', label: 'No fabricated adverse media', rx: [/\b(according to reports|media reports indicate)\b(?!.*\b(http|www|reuters|ft|bloomberg|gulf news|khaleej times))/i, /\breports (indicate|suggest)\b(?!.*\b(source|outlet|dated|published))/i] },
    { id: 'P3', label: 'No legal conclusions', rx: [/\b(constitutes|amounts to|qualifies as)\b.*\b(money laundering|terrorist financing|bribery|fraud|corruption|proliferation financing|sanctions evasion)\b/i, /\bthis (behaviour|conduct) is (illegal|criminal|unlawful)\b/i] },
    { id: 'P4', label: 'No tipping-off content', rx: [/\b(inform|notify|tell) (the )?(customer|subject|client) (that|about)\b.*\b(str|sar|ffr|pnmr|investigation|suspicion|filing|regulator)\b/i, /\b(please|you should|you must) (withdraw|move|transfer) (funds|money|the balance) (before|prior to)\b/i, /\bwe (have|are) (filed|filing|submitted|submitting) an? (str|sar|ffr|pnmr)\b/i] },
    { id: 'P5', label: 'No allegation upgrade', rx: [/\bthe subject (is|was) (guilty|liable|convicted)\b(?!.*\b(on [A-Z]\w+ \d{4}|by [A-Z][^,.]+ court))/i, /\b(laundered|bribed|embezzled|defrauded|smuggled)\b(?!.*\b(alleged|reported|charged|accused))/i] },
    { id: 'P6', label: 'No merging of distinct persons/entities', rx: [/\bwe (have )?(merged|consolidated) (these )?(profiles|subjects|records)\b/i, /\bthe same individual as\b.*\b(name-only|partial name)\b/i] },
    { id: 'P7', label: 'No "clean" result without scope', rx: [/^\s*no match\s*\.?\s*$/im] },
    { id: 'P8', label: 'No training-data-as-source', rx: [/\b(based on my (training|knowledge)|according to my (training|training data))\b/i] },
    { id: 'P9', label: 'No opaque risk scoring', rx: [/\brisk score(:| of | is )\s*\d+(\.\d+)?\b(?!.*\b(methodology|inputs|weights|gaps))/i, /\b(high|medium|low) risk\b(?!.*\b(because|based on|per))/i] },
    { id: 'P10', label: 'No proceed on insufficient info', rx: [/\bassuming\b(?!.*\b(state the assumption|marked \[ASSUMED\]))/i] },
  ];

  function probeCharter(text) {
    if (!text) return { allowed: true, failed: [], passed: PROBES.map(function (p) { return p.id; }) };
    var failed = [];
    var passed = [];
    for (var i = 0; i < PROBES.length; i++) {
      var p = PROBES[i];
      var m = null;
      for (var j = 0; j < p.rx.length; j++) {
        var r = new RegExp(p.rx[j].source, p.rx[j].flags);
        var hit = r.exec(text);
        if (hit) { m = hit; break; }
      }
      if (m) failed.push({ id: p.id, label: p.label, span: m[0] });
      else passed.push(p.id);
    }
    // P7 special case: "no match" without scope.
    var hasScope = /\b(SCOPE_DECLARATION|lists? checked|list version|screened against)\b/i.test(text) ||
                   /\b(UN(\s+Consolidated)?|OFAC|UK OFSI|EU Consolidated|EOCN)\b/i.test(text);
    if (hasScope) {
      var idx = failed.findIndex(function (f) { return f.id === 'P7'; });
      if (idx >= 0) { passed.push('P7'); failed.splice(idx, 1); }
    }
    return { allowed: failed.length === 0, failed: failed, passed: passed };
  }

  function paintCharter(result) {
    var dots = $$('#charter-dots li');
    var fails = new Set((result.failed || []).map(function (f) { return f.id; }));
    dots.forEach(function (li) {
      var p = li.getAttribute('data-p');
      li.setAttribute('data-state', fails.has(p) ? 'fail' : 'pass');
    });
    var out = $('#charter-out');
    if (!out) return;
    if ((result.failed || []).length === 0) {
      out.hidden = false;
      out.textContent = '✓ all prohibitions pass';
    } else {
      out.hidden = false;
      out.textContent = result.failed.map(function (f) { return f.id + ': ' + f.label + ' — matched “' + (f.span || '').slice(0, 80) + '”'; }).join('\n');
    }
  }

  function bindCharterProbe() {
    var input = $('#charter-probe');
    if (!input) return;
    var run = function () { paintCharter(probeCharter(input.value)); };
    input.addEventListener('input', run);
    paintCharter({ failed: [], passed: [] });
  }

  // Expose probeCharter globally so the advisor card can call it after runs.
  window.hawkProbeCharter = probeCharter;
  window.hawkPaintCharter = paintCharter;

  // ────────────────────────────────────────────────────
  // TIMELINE — inferred phases from text entries
  // ────────────────────────────────────────────────────
  function phaseOf(action) {
    var a = (action || '').toLowerCase();
    if (/(onboard|cdd|kyc|prospect)/.test(a)) return 'CDD';
    if (/(screen|list_walk|match)/.test(a)) return 'SCREEN';
    if (/(monitor|rescreen|delta)/.test(a)) return 'MONITOR';
    if (/(alert|flag)/.test(a)) return 'ALERT';
    if (/(disposition|verdict|approve|clear)/.test(a)) return 'DISPOSITION';
    if (/(escalate|heightened)/.test(a)) return 'ESCALATE';
    if (/(str|sar|ffr|pnmr|goaml|filing)/.test(a)) return 'FILING';
    if (/(freeze|seize)/.test(a)) return 'FREEZE';
    if (/(exit|offboard|terminate)/.test(a)) return 'EXIT';
    if (/(investigat|edd)/.test(a)) return 'INVESTIGATE';
    if (/(audit|lookback|review)/.test(a)) return 'AUDIT';
    if (/(intake|case\.open|case_opened)/.test(a)) return 'INTAKE';
    return 'OTHER';
  }

  function renderTimeline(events) {
    var out = $('#timeline-out');
    if (!out) return;
    if (!events || events.length === 0) { out.textContent = '— no events recorded —'; return; }
    var sorted = events.slice().sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    out.textContent = sorted.map(function (e) {
      return (e.at || '').slice(0, 19).replace('T', ' ') + '  [' + phaseOf(e.action || e.phase) + ']  ' + (e.actor || 'system') + '  ·  ' + (e.summary || e.action || '—');
    }).join('\n');
  }

  window.hawkRenderTimeline = renderTimeline;

  // ────────────────────────────────────────────────────
  // UBO — text table view over a simple ownership graph
  // ────────────────────────────────────────────────────
  function renderUbo(parties, edges, subjectId) {
    var out = $('#ubo-out');
    if (!out) return;
    if (!parties || !edges || !subjectId) { out.textContent = '— no ownership graph provided —'; return; }
    var partyById = {};
    for (var i = 0; i < parties.length; i++) partyById[parties[i].id] = parties[i];
    var edgesTo = {};
    for (var j = 0; j < edges.length; j++) {
      if (!edgesTo[edges[j].to]) edgesTo[edges[j].to] = [];
      edgesTo[edges[j].to].push(edges[j]);
    }
    var results = [];
    function walk(id, chain, acc, viaNominee) {
      if (chain.indexOf(id) !== -1 || chain.length > 12) return;
      var inEdges = edgesTo[id] || [];
      for (var k = 0; k < inEdges.length; k++) {
        var e = inEdges[k];
        var w = e.sharePercent != null ? Math.max(0, Math.min(1, e.sharePercent / 100)) : 1;
        var next = acc * w;
        var nominee = viaNominee || e.nominee === true;
        var fromParty = partyById[e.from];
        if (!fromParty) continue;
        if (fromParty.kind === 'person') {
          results.push({ personId: fromParty.id, name: fromParty.name, percent: next * 100, nominee: nominee, chain: chain.concat([id, fromParty.id]) });
        } else {
          walk(fromParty.id, chain.concat([id]), next, nominee);
        }
      }
    }
    walk(subjectId, [], 1, false);
    if (results.length === 0) { out.textContent = 'No natural-person UBO reachable from ' + subjectId; return; }
    results.sort(function (a, b) { return b.percent - a.percent; });
    var header = 'PERSON                            %      CHAIN                               NOMINEE';
    var rows = results.slice(0, 20).map(function (r) {
      var name = (r.name || r.personId).padEnd(32).slice(0, 32);
      var pct = r.percent.toFixed(1).padStart(6);
      var chain = r.chain.join(' → ').padEnd(34).slice(0, 34);
      var nom = r.nominee ? 'YES' : 'no';
      return name + '  ' + pct + '  ' + chain + '  ' + nom;
    }).join('\n');
    out.textContent = header + '\n' + rows;
  }

  window.hawkRenderUbo = renderUbo;

  // ────────────────────────────────────────────────────
  // OUTCOME FEEDBACK — MLRO decision journal
  // ────────────────────────────────────────────────────
  var FB_KEY = 'hawkeye.outcome-feedback.v1';
  function readFb() { try { return JSON.parse(localStorage.getItem(FB_KEY) || '[]'); } catch (_) { return []; } }
  function writeFb(xs) { try { localStorage.setItem(FB_KEY, JSON.stringify(xs.slice(-200))); } catch (_) {} }
  function paintFbStats() {
    var stats = $('#fb-stats');
    if (!stats) return;
    var xs = readFb();
    if (xs.length === 0) { stats.textContent = 'No entries yet.'; return; }
    var overridden = xs.filter(function (r) { return r.overridden; }).length;
    var rate = xs.length === 0 ? 0 : 1 - overridden / xs.length;
    var modes = {};
    xs.forEach(function (r) { (r.modeIds || []).forEach(function (m) { modes[m] = (modes[m] || 0) + 1; }); });
    var topModes = Object.keys(modes).sort(function (a, b) { return modes[b] - modes[a]; }).slice(0, 5).map(function (m) { return m + '×' + modes[m]; });
    stats.textContent = 'n=' + xs.length + ' · agreement=' + (rate * 100).toFixed(0) + '% · overridden=' + overridden + ' · top-modes=' + (topModes.join(', ') || '—');
  }

  function bindFeedback() {
    var btn = $('#fb-append');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var auto = ($('#fb-auto') || {}).value || '';
      var decided = ($('#fb-decided') || {}).value || '';
      var reason = ($('#fb-reason') || {}).value || '';
      var truth = ($('#fb-truth') || {}).value || 'pending';
      var reviewer = ($('#fb-reviewer') || {}).value || 'mlro';
      if (!auto || !decided) return;
      var selected = [];
      try { selected = JSON.parse(localStorage.getItem('hawkeye.dr-picker.selected') || '[]'); } catch (_) {}
      var entry = {
        at: new Date().toISOString(),
        autoProposed: auto.trim(),
        mlroDecided: decided.trim(),
        overridden: auto.trim() !== decided.trim(),
        overrideReason: reason.trim() || null,
        groundTruth: truth,
        reviewerId: reviewer,
        modeIds: Array.isArray(selected) ? selected.slice(0, 12) : [],
      };
      var xs = readFb();
      xs.push(entry);
      writeFb(xs);
      ['#fb-auto', '#fb-decided', '#fb-reason'].forEach(function (s) { var e = $(s); if (e) e.value = ''; });
      paintFbStats();
    });
    paintFbStats();
  }

  // ────────────────────────────────────────────────────
  // TAXONOMY BROWSER — 719 red flags + 397 capabilities
  // ────────────────────────────────────────────────────
  var RF_DATA = [];   // populated at init from /taxonomies/*
  var CAP_DATA = [];

  var CURRENT_TAB = 'redflags';
  var CURRENT_FILTER = '';

  function renderTaxFilters() {
    var nav = $('#tax-filters');
    if (!nav) return;
    var buckets = {};
    var src = CURRENT_TAB === 'redflags' ? RF_DATA : CAP_DATA;
    for (var i = 0; i < src.length; i++) buckets[src[i].bucket] = (buckets[src[i].bucket] || 0) + 1;
    var html = '<button class="tax-filter ' + (CURRENT_FILTER === '' ? 'is-active' : '') + '" data-filter="">All <span class="mono">' + src.length + '</span></button>';
    Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; }).forEach(function (b) {
      html += '<button class="tax-filter ' + (CURRENT_FILTER === b ? 'is-active' : '') + '" data-filter="' + b + '">' + b + ' <span class="mono">' + buckets[b] + '</span></button>';
    });
    nav.innerHTML = html;
  }

  function renderTaxList(query) {
    var list = $('#tax-list');
    var count = $('#tax-count');
    if (!list) return;
    var src = CURRENT_TAB === 'redflags' ? RF_DATA : CAP_DATA;
    var pool = CURRENT_FILTER ? src.filter(function (x) { return x.bucket === CURRENT_FILTER; }) : src;
    var q = (query || '').trim().toLowerCase();
    var tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    var filtered = tokens.length === 0 ? pool : pool.filter(function (x) {
      var hay = (x.label + ' ' + x.id + ' ' + x.bucket).toLowerCase();
      return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    if (count) count.textContent = String(filtered.length);
    var cap = Math.min(400, filtered.length);
    var html = '';
    for (var i = 0; i < cap; i++) {
      var x = filtered[i];
      html += '<li class="tax-item"><span class="tax-bucket mono">' + x.bucket + '</span><span class="tax-label">' + x.label + '</span><span class="tax-id mono">' + x.id + '</span></li>';
    }
    if (filtered.length > cap) html += '<li class="tax-more mono">+ ' + (filtered.length - cap) + ' more — refine the search</li>';
    list.innerHTML = html;
  }

  function bindTaxonomyTabs() {
    var tabs = $$('.tax-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.toggle('is-active', b === t); b.setAttribute('aria-selected', String(b === t)); });
        CURRENT_TAB = t.getAttribute('data-tab');
        CURRENT_FILTER = '';
        renderTaxFilters();
        renderTaxList(($('#tax-search') || {}).value || '');
      });
    });
    var nav = $('#tax-filters');
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('.tax-filter');
      if (!b) return;
      CURRENT_FILTER = b.getAttribute('data-filter') || '';
      renderTaxFilters();
      renderTaxList(($('#tax-search') || {}).value || '');
    });
    var input = $('#tax-search');
    if (input) input.addEventListener('input', function () { renderTaxList(input.value); });
  }

  async function loadTaxonomies() {
    // Fetch the pre-built JSON dumps the build step emits under
    // /taxonomies/*.json. If they're not present, fall back to empty
    // arrays — the page still renders + the tests still pass.
    try {
      var [rf, cap] = await Promise.all([
        fetch('/taxonomies/red-flags.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
        fetch('/taxonomies/capabilities.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
      ]);
      RF_DATA = Array.isArray(rf) ? rf : [];
      CAP_DATA = Array.isArray(cap) ? cap : [];
    } catch (_) {
      RF_DATA = []; CAP_DATA = [];
    }
    renderTaxFilters();
    renderTaxList('');
  }

  // ────────────────────────────────────────────────────
  // init
  // ────────────────────────────────────────────────────
  function init() {
    bindCharterProbe();
    bindFeedback();
    bindTaxonomyTabs();
    loadTaxonomies();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
