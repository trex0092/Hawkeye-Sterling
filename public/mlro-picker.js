// Hawkeye Sterling — deep-reasoning mode picker.
// Renders searchable, categorised, multi-select picker over the 690-mode
// catalogue. Mirrors the TS module src/brain/mlro-reasoning-modes.ts — when
// deep-reasoning.js loads and exposes window.__deepReasoningModes, we
// overlay our picker on top and drive its <select> via events.
(function () {
  'use strict';

  var ALL_IDS = [];
  var CATEGORIES = Object.create(null);
  var LABELS = {
    gold_dpms: 'Gold / DPMS', quantitative: 'Quantitative', threat_modeling: 'Threat modelling',
    ubo_transparency: 'UBO / transparency', crypto: 'Crypto / VA', correspondent: 'Correspondent',
    cdd_edd: 'CDD / EDD', filings: 'Filings', governance: 'Governance', logic: 'Formal logic',
    sanctions_pf: 'Sanctions / PF', maritime: 'Maritime', trade_finance: 'Trade finance',
    real_estate: 'Real estate', pep: 'PEP / RCA', npo: 'NPO', insurance: 'Insurance',
    gambling: 'Gambling', luxury: 'Luxury assets', fraud: 'Fraud', market_abuse: 'Market abuse',
    ethics_rhetoric: 'Ethics / rhetoric', cognitive: 'Cognitive', strategic: 'Strategic',
    forensic: 'Forensic', data_quality: 'Data quality', compliance_framework: 'Compliance framework',
    general: 'General',
  };

  function categorise(id) {
    var s = id;
    function has() { for (var i = 0; i < arguments.length; i++) if (s.indexOf(arguments[i]) !== -1) return true; return false; }
    if (has('bullion_','gold','lbma','dpms','refiner','dore','assay','cahra')) return 'gold_dpms';
    if (has('bayes','probabilistic','statistical','markov','regression','hmm','frequent','monte_carlo','kl_','entropy','chi_square','fermi','time_series','survival','hypothesis_test','confidence_interval')) return 'quantitative';
    if (has('attack','mitre','threat','stride','pasta','fair','octave','red_team','tabletop','bowtie','kill_chain','adversarial')) return 'threat_modeling';
    if (has('ubo','bearer','nominee')) return 'ubo_transparency';
    if (has('crypto','mixer','wallet','chain_analysis','mev','bridge','defi','nft','privacy_coin','taint','stablecoin')) return 'crypto';
    if (has('corresp','nested','u_turn','turn_')) return 'correspondent';
    if (has('cdd','edd','onboard','prospect','sow','sof')) return 'cdd_edd';
    if (has('str','ffr','pnmr','sar','ctr','filing','goaml','narrative_str')) return 'filings';
    if (has('audit','four_eyes','sod','segregation','policy','governance','mlro','board_reporting','escalation','training','insurance','control_effect','regulatory_correspondence')) return 'governance';
    if (has('modus','reductio','syllog','ponens','tollens','predicate','propositional','modal','deontic','temporal','epistemic','paraconsistent','non_monotonic','default_reasoning')) return 'logic';
    if (has('sanction','eocn','un_1','ofac','fatf','ofsi','tfs','pf_','proliferation')) return 'sanctions_pf';
    if (has('vessel','stss','maritime','flag','ais','ship','imo','port_state')) return 'maritime';
    if (has('tbml','invoice','trade_','ucp600','lc_','incoterms','hs_','bill_of_lading','over_invoice','under_invoice','phantom_')) return 'trade_finance';
    if (has('re_','real_estate','property','villa','goldenvisa','rapid_flip')) return 'real_estate';
    if (has('pep','rca')) return 'pep';
    if (has('npo','charity')) return 'npo';
    if (has('insurance','life_','policy_lapse','beneficiary_rotation','premium_overfund')) return 'insurance';
    if (has('gambling','casino','junket')) return 'gambling';
    if (has('art_','yacht','jet','luxury')) return 'luxury';
    if (has('advance_fee','bec','synthetic_id','ponzi','phoenix','ato_','sim_swap','app_scam','fraud','chargeback','refund','invoice_fraud','loyalty')) return 'fraud';
    if (has('market_','insider','spoof','wash_trade','marking','layering','front_running')) return 'market_abuse';
    if (has('ethic','deontolog','utilitarian','virtue','rogerian','toulmin','irac','craac')) return 'ethics_rhetoric';
    if (has('ooda','pre_mortem','post_mortem','steelman','hindsight','cognitive_bias','dual_process','system_1','system_2','availability_check','framing_check','anchoring','overconfidence','planning_fallacy','loss_aversion','confidence_calibration')) return 'cognitive';
    if (has('swot','pestle','scenario','war_game','stakeholder','porter','steep','lens_shift','strategic','minimum_viable')) return 'strategic';
    if (has('five_whys','fishbone','fmea','pareto','swiss_cheese','causal','timeline','link_analysis','centrality','community_detection','motif','shortest_path','graph','evidence_graph','entity_resolution','pattern_of_life','peer_group_anomaly','insider_threat','collusion','self_dealing','ghost_emp','lapping','linguistic_forensics','narrative_coherence','sentiment','spike_detection','velocity_analysis','seasonality','regime_change','pep_group')) return 'forensic';
    if (has('data_quality','reconciliation','completeness','freshness','source_credibility','tamper','lineage','provenance','discrepancy_log','data_integrity','schema_drift')) return 'data_quality';
    if (has('retention_audit','peer_benchmark','source_triangulation','article_by_article','circular_walk','cabinet_res','list_walk','jurisdiction_cascade','sanctions_regime_matrix','kpi_dpms','emirate_jurisdiction','regulatory_mapping','exception_log','policy_drift','policy_vs_rule','de_minimis','proportionality','stare_decisis','analogical_precedent','gray_zone_resolution')) return 'compliance_framework';
    return 'general';
  }

  var $ = function (sel) { return document.querySelector(sel); };
  var selected = [];

  function tryBootstrap() {
    // Pull the mode list from the reference IIFE if it published one;
    // otherwise recover from any rendered <select> options.
    if (window.__deepReasoningModes && window.__deepReasoningModes.length) {
      ALL_IDS = window.__deepReasoningModes.slice();
    } else {
      var sel = document.querySelector('#deepReasoningMount select');
      if (sel) ALL_IDS = Array.prototype.slice.call(sel.options).map(function (o) { return o.value; });
    }
    if (ALL_IDS.length === 0) return false;
    CATEGORIES = {};
    for (var i = 0; i < ALL_IDS.length; i++) {
      var id = ALL_IDS[i];
      var c = categorise(id);
      (CATEGORIES[c] || (CATEGORIES[c] = [])).push(id);
    }
    renderCats();
    renderList(null, '');
    renderSuggest();
    return true;
  }

  function renderCats() {
    var root = $('#dr-cats');
    if (!root) return;
    var cats = Object.keys(CATEGORIES).sort(function (a, b) { return CATEGORIES[b].length - CATEGORIES[a].length; });
    var html = '<button type="button" class="dr-cat is-active" data-cat="">' +
      '<span class="dr-cat-label">All</span><span class="dr-cat-count mono">' + ALL_IDS.length + '</span></button>';
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      html += '<button type="button" class="dr-cat" data-cat="' + c + '">' +
        '<span class="dr-cat-label">' + (LABELS[c] || c) + '</span>' +
        '<span class="dr-cat-count mono">' + CATEGORIES[c].length + '</span></button>';
    }
    root.innerHTML = html;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cat]');
      if (!btn) return;
      root.querySelectorAll('.dr-cat').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      var cat = btn.getAttribute('data-cat');
      var q = ($('#dr-search') && $('#dr-search').value) || '';
      renderList(cat || null, q);
    });
  }

  function renderList(cat, query) {
    var root = $('#dr-mode-list');
    var count = $('#dr-search-count');
    if (!root) return;
    var pool = cat ? CATEGORIES[cat] || [] : ALL_IDS;
    var q = (query || '').trim().toLowerCase();
    var tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    var filtered = tokens.length === 0 ? pool : pool.filter(function (id) {
      return tokens.every(function (t) { return id.toLowerCase().indexOf(t) !== -1; });
    });
    if (count) count.textContent = String(filtered.length);
    var html = '';
    var cap = Math.min(filtered.length, 300);
    for (var i = 0; i < cap; i++) {
      var id = filtered[i];
      var on = selected.indexOf(id) !== -1;
      html += '<li><button type="button" class="dr-mode' + (on ? ' is-on' : '') + '" data-id="' + id + '">' +
        '<span class="dr-mode-id mono">' + id + '</span></button></li>';
    }
    if (filtered.length > cap) {
      html += '<li class="dr-mode-more mono">+ ' + (filtered.length - cap) + ' more — refine the search</li>';
    }
    root.innerHTML = html;
    root.addEventListener('click', onModeClick);
  }

  function onModeClick(e) {
    var btn = e.target.closest('.dr-mode');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var i = selected.indexOf(id);
    if (i === -1) selected.push(id);
    else selected.splice(i, 1);
    btn.classList.toggle('is-on');
    renderSelected();
    syncBackingSelect();
  }

  function renderSelected() {
    var root = $('#dr-selected');
    if (!root) return;
    if (selected.length === 0) { root.innerHTML = '<li class="dr-empty">— pick one or more modes to chain —</li>'; return; }
    var html = '';
    for (var i = 0; i < selected.length; i++) {
      var id = selected[i];
      html += '<li><span class="dr-sel-n mono">' + (i + 1) + '</span><span class="dr-sel-id mono">' + id + '</span>' +
        '<button type="button" class="dr-sel-rm" data-id="' + id + '" aria-label="Remove">×</button></li>';
    }
    root.innerHTML = html;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.dr-sel-rm');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var i = selected.indexOf(id);
      if (i !== -1) selected.splice(i, 1);
      renderSelected();
      // Sync UI + select.
      document.querySelectorAll('.dr-mode[data-id="' + id + '"]').forEach(function (b) { b.classList.remove('is-on'); });
      syncBackingSelect();
    });
  }

  function renderSuggest() {
    var root = $('#dr-suggest-chips');
    if (!root) return;
    // Heuristic: read the form to infer context.
    var nat = document.querySelector('#subject_nationality');
    var subj = document.querySelector('#subject_name');
    var ctx = {
      sector: 'dpms',
      hasCrypto: /(crypto|wallet|btc|eth|usdt)/i.test((subj && subj.value) || ''),
      hasCahra: false,
      hasPep: false,
      hasCash: true,
    };
    var picks = [];
    function add(cat, n) { if (CATEGORIES[cat]) picks = picks.concat(CATEGORIES[cat].slice(0, n)); }
    add('logic', 2); add('cognitive', 2); add('governance', 1);
    if (ctx.sector === 'dpms') add('gold_dpms', 2);
    if (ctx.hasCrypto) add('crypto', 2);
    if (ctx.hasCash) add('quantitative', 1);
    picks = picks.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 7);
    root.innerHTML = picks.map(function (id) {
      return '<button type="button" class="dr-suggest-chip mono" data-id="' + id + '">' + id + '</button>';
    }).join('');
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.dr-suggest-chip');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (selected.indexOf(id) === -1) selected.push(id);
      renderSelected();
      document.querySelectorAll('.dr-mode[data-id="' + id + '"]').forEach(function (b) { b.classList.add('is-on'); });
      syncBackingSelect();
    });
  }

  function syncBackingSelect() {
    // Drive the reference IIFE's <select> if present. Prefer the first
    // selected mode as the active prefix; additional selections are kept
    // in Hawkeye history for chaining.
    var sel = document.querySelector('#deepReasoningMount select');
    if (sel && selected.length > 0 && Array.prototype.slice.call(sel.options).some(function (o) { return o.value === selected[0]; })) {
      sel.value = selected[0];
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try {
      localStorage.setItem('hawkeye.dr-picker.selected', JSON.stringify(selected));
    } catch (_) {}
  }

  function bindSearch() {
    var input = $('#dr-search');
    if (!input) return;
    input.addEventListener('input', function () {
      var active = document.querySelector('.dr-cat.is-active');
      var cat = active && active.getAttribute('data-cat');
      renderList(cat || null, input.value);
    });
  }

  function bindClear() {
    var btn = $('#dr-clear');
    if (!btn) return;
    btn.addEventListener('click', function () {
      selected = [];
      renderSelected();
      document.querySelectorAll('.dr-mode.is-on').forEach(function (b) { b.classList.remove('is-on'); });
      syncBackingSelect();
    });
  }

  function init() {
    bindSearch();
    bindClear();
    renderSelected();
    // Try immediately; retry a few times while deep-reasoning.js renders.
    if (!tryBootstrap()) {
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (tryBootstrap() || tries > 30) clearInterval(t);
      }, 250);
    }
    try {
      var raw = localStorage.getItem('hawkeye.dr-picker.selected');
      if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) selected = arr.slice(0, 12); }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
