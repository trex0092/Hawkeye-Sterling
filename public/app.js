// Hawkeye Sterling V2 — Module 01 · Subject Screening (browser controller)
// Vanilla ES module. No build step required.

const FACULTIES = [
  { id: 'reasoning',     label: 'Reasoning',     syn: 'logic · deduction · inference · rationalization · argumentation · analysis · cogitation · ratiocination · sense-making · thought process' },
  { id: 'data_analysis', label: 'Data analysis', syn: 'data interpretation · data mining · data crunching · analytics · quantitative · statistical · data examination · evaluation · modeling · processing' },
  { id: 'deep_thinking', label: 'Deep thinking', syn: 'contemplation · reflection · rumination · introspection · meditation · pondering · musing · deliberation · cerebration · profound thought' },
  { id: 'intelligence',  label: 'Intelligence',  syn: 'intellect · acumen · cleverness · brilliance · brainpower · wit · sagacity · perspicacity · mental capacity · cognitive ability' },
  { id: 'smartness',     label: 'Smartness',     syn: 'sharpness · shrewdness · astuteness · quick-wittedness · savvy · canniness · ingenuity · resourcefulness · adroitness · keenness' },
  { id: 'strong_brain',  label: 'Strong brain',  syn: 'sharp mind · keen intellect · powerful mind · quick mind · agile mind · brilliant mind · analytical mind · steel-trap mind · mental prowess · intellectual firepower' },
  { id: 'inference',     label: 'Inference',     syn: 'implication · derivation · induction · abduction · projection · extrapolation · surmisal · presumption · reasoned guess · entailment' },
  { id: 'argumentation', label: 'Argumentation', syn: 'disputation · debate · dialectic · case-making · advocacy · refutation · rebuttal · counter-argument · pro-contra framing' },
  { id: 'introspection', label: 'Introspection', syn: 'self-examination · self-critique · self-reflection · self-scrutiny · metacognition · self-audit · self-monitoring · calibration' },
  { id: 'ratiocination', label: 'Ratiocination', syn: 'reasoned conclusion · formal reasoning · principled deduction · methodical inference · rigorous argument · terminal synthesis · signed verdict' },
];

const MODES_W1 = [
  'modus_ponens','modus_tollens','reductio','syllogistic','propositional_logic','predicate_logic','fuzzy_logic','probabilistic_logic','default_reasoning','non_monotonic','paraconsistent','modal_logic','deontic_logic','temporal_logic','epistemic_logic','system_1','system_2','dual_process','ooda','pre_mortem','post_mortem','steelman','hindsight_check','cognitive_bias_audit','confidence_calibration','planning_fallacy','availability_check','framing_check','overconfidence_check','anchoring_avoidance','monte_carlo','fermi','expected_utility','minimax','maximin','cvar','regret_min','marginal','cost_benefit','break_even','real_options','sensitivity_tornado','risk_adjusted','loss_aversion_check','portfolio_view','five_whys','fishbone','fmea','pareto','swiss_cheese','bowtie','kill_chain','timeline_reconstruction','evidence_graph','link_analysis','three_lines_defence','five_pillars','risk_based_approach','fatf_effectiveness','wolfsberg_faq','lbma_rgg_five_step','oecd_ddg_annex','typology_catalogue','article_by_article','cabinet_res_walk','circular_walk','list_walk','ubo_tree_walk','jurisdiction_cascade','sanctions_regime_matrix','kpi_dpms_thirty','emirate_jurisdiction','source_triangulation','retention_audit','peer_benchmark','toulmin','irac','craac','rogerian','policy_vs_rule','de_minimis','proportionality_test','stare_decisis','analogical_precedent','gray_zone_resolution','swot','pestle','porter_adapted','steep','lens_shift','stakeholder_map','scenario_planning','war_game','minimum_viable_compliance','defence_in_depth','bayesian_network','causal_inference','counterexample_search','cross_case_triangulation','adversarial_collaboration',
];

const MODES_W2 = [
  'bayes_theorem','frequentist','confidence_interval','hypothesis_test','chi_square','regression','time_series','markov_chain','hmm','survival','entropy','kl_divergence','mdl','occam','centrality','community_detection','motif_detection','shortest_path','occam_vs_conspiracy','burden_of_proof','presumption_innocence','popper_falsification','triangulation','saturation','stride','pasta','attack_tree','mitre_attack','tabletop_exercise','fair','octave','velocity_analysis','spike_detection','seasonality','regime_change','sentiment_analysis','entity_resolution','narrative_coherence','linguistic_forensics','pattern_of_life','peer_group_anomaly','insider_threat','collusion_pattern','self_dealing','front_running','wash_trade','spoofing','ghost_employees','lapping','ethical_matrix','provenance_trace','lineage','tamper_detection','source_credibility','completeness_audit','freshness_check','reconciliation','discrepancy_log','data_quality_score','conflict_interest','four_eyes_stress','escalation_trigger','sla_check','audit_trail_reconstruction','control_effectiveness','residual_vs_inherent','risk_appetite_check','kri_alignment','regulatory_mapping','exception_log','training_inadequacy','staff_workload','documentation_quality','policy_drift','verdict_replay','chain_analysis','taint_propagation','privacy_coin_reasoning','bridge_risk','mev_scan','stablecoin_reserve','nft_wash','defi_smart_contract','ucp600_discipline','tbml_overlay','insurance_wrap','real_estate_cash','art_dealer','yacht_jet','family_office_signal','market_manipulation','advance_fee','app_scam','bec_fraud','synthetic_id','ponzi_scheme','invoice_fraud','phoenix_company','sanctions_maritime_stss','kyb_strict',
];

const TAXONOMY = [
  { id: 'ml_financial_crime', label: 'Money Laundering & Financial Crime', keywords: ['launder','money laundering','financial crime','economic crime','fraud','embezzle','extort','kickback','forgery','counterfeiting','identity theft','Ponzi','pyramid scheme','insider trading','market manipulation','accounting fraud','asset misappropriation','tax evasion','tax fraud','VAT fraud','cyber fraud','wire fraud'] },
  { id: 'terrorist_financing', label: 'Terrorist Financing', keywords: ['terrorism','terrorist financing','financing of terrorism','terror funding','extremist','radicalisation','designated terrorist','militant'] },
  { id: 'proliferation_financing', label: 'Proliferation Financing', keywords: ['proliferation financing','weapons of mass destruction','WMD','dual-use','sanctions evasion','arms trafficking','weapons smuggling','nuclear','chemical weapons','biological weapons'] },
  { id: 'corruption_organised_crime', label: 'Corruption, Bribery & Organised Crime', keywords: ['corrupt','bribe','corruption','abuse of power','conflict of interest','misuse of funds','kleptocracy','state capture','mafia','organised crime','drug trafficking','narcotics','cartel','human trafficking','people smuggling','forced labour','modern slavery','wildlife trafficking','cybercrime','ransomware','darknet'] },
  { id: 'legal_criminal_regulatory', label: 'Legal, Criminal & Regulatory Proceedings', keywords: ['arrest','blackmail','breach','convict','court case','felon','fined','guilty','illegal','imprisonment','jail','litigate','murder','politic','prosecute','sanctions','theft','unlawful','verdict','debarred','blacklisted','regulatory breach'] },
];

const ADVERSE_QUERY = 'launder OR fraud OR bribe OR corrupt OR arrest OR blackmail OR breach OR convict OR "court case" OR embezzle OR extort OR felon OR fined OR guilty OR illegal OR imprisonment OR jail OR kickback OR litigate OR mafia OR murder OR prosecute OR terrorism OR theft OR unlawful OR verdict OR politic OR sanctions OR "money laundering" OR "financial crime" OR "economic crime" OR "terrorist financing" OR "financing of terrorism" OR "terror funding" OR extremist OR radicalisation OR "designated terrorist" OR militant OR "proliferation financing" OR "weapons of mass destruction" OR WMD OR "dual-use" OR "sanctions evasion" OR "arms trafficking" OR "weapons smuggling" OR nuclear OR "chemical weapons" OR "biological weapons" OR "tax evasion" OR "tax fraud" OR "VAT fraud" OR Ponzi OR "pyramid scheme" OR "insider trading" OR "market manipulation" OR "accounting fraud" OR "asset misappropriation" OR forgery OR counterfeiting OR "identity theft" OR "cyber fraud" OR "wire fraud" OR corruption OR "abuse of power" OR "conflict of interest" OR "misuse of funds" OR kleptocracy OR "state capture" OR "organised crime" OR "drug trafficking" OR narcotics OR cartel OR "human trafficking" OR "people smuggling" OR "forced labour" OR "modern slavery" OR "wildlife trafficking" OR cybercrime OR ransomware OR darknet OR debarred OR blacklisted OR "regulatory breach"';

const STORAGE_KEY = 'hawkeye-sterling-v2:module01:draft';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  mode: 'first_screening',
  recordId: null,
  faculties: Object.fromEntries(FACULTIES.map((f) => [f.id, true])),
  modes: new Set([...MODES_W1, ...MODES_W2]),
};

// ---------- utilities
const pad = (n) => String(n).padStart(2, '0');
function nowUtcIso() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}
function nowLocalDatetime() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowUtcClock() {
  const d = new Date();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
function generateRecordId(mode) {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const prefix = mode === 'daily_monitoring' ? 'HWK-01D' : 'HWK-01F';
  return `${prefix}-${ymd}-${rand}`;
}
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- render: faculties
function renderFaculties() {
  const root = $('#faculties');
  if (!root) return;
  root.innerHTML = FACULTIES.map((f, i) => `
    <label class="faculty ${state.faculties[f.id] ? 'active' : ''}" data-faculty="${f.id}">
      <div class="faculty-head">
        <span class="faculty-idx">${String(i+1).padStart(2,'0')}</span>
        <span class="faculty-name">${f.label}</span>
        <input type="checkbox" ${state.faculties[f.id] ? 'checked' : ''} data-faculty-toggle="${f.id}" style="margin-left:auto"/>
      </div>
      <div class="faculty-syn">${f.syn}</div>
    </label>
  `).join('');
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const id = t.getAttribute('data-faculty-toggle');
    if (!id) return;
    state.faculties[id] = t.checked;
    const card = root.querySelector(`[data-faculty="${id}"]`);
    if (card) card.classList.toggle('active', t.checked);
    updateScorecard();
  }, { once: false });
}

// ---------- render: reasoning modes pool
function renderModesPool() {
  const root = $('#modes-pool');
  if (!root) return;
  const chip = (id) => `<button type="button" class="chip on" data-mode-id="${id}" aria-pressed="true">${id}</button>`;
  root.innerHTML = `
    <div class="wave">Wave 1 · ${MODES_W1.length} modes</div>
    <div class="modes-chips" data-wave="1">${MODES_W1.map(chip).join('')}</div>
    <div class="wave" style="margin-top:12px">Wave 2 · ${MODES_W2.length} modes</div>
    <div class="modes-chips" data-wave="2">${MODES_W2.map(chip).join('')}</div>
  `;
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode-id]');
    if (!t) return;
    const id = t.getAttribute('data-mode-id');
    if (state.modes.has(id)) { state.modes.delete(id); t.classList.remove('on'); t.setAttribute('aria-pressed','false'); }
    else { state.modes.add(id); t.classList.add('on'); t.setAttribute('aria-pressed','true'); }
    updateScorecard();
  });
}

// ---------- render: taxonomy + query
function renderTaxonomy() {
  const root = $('#taxonomy');
  if (!root) return;
  root.innerHTML = TAXONOMY.map((c) => `
    <div class="tax">
      <h4>${c.label}<span class="count">${c.keywords.length}</span></h4>
      <ul>${c.keywords.map((k) => `<li>${k}</li>`).join('')}</ul>
    </div>
  `).join('');
  const q = $('#q-text');
  if (q) q.textContent = ADVERSE_QUERY;
  const copy = $('#copy-q');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ADVERSE_QUERY); copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 1400); }
    catch { copy.textContent = 'Select & copy'; }
  });
}

// ---------- scorecard
function gradeScore(s) {
  s = Math.max(0, Math.min(100, s));
  if (s >= 97) return 'A+'; if (s >= 93) return 'A'; if (s >= 90) return 'A-';
  if (s >= 87) return 'B+'; if (s >= 83) return 'B'; if (s >= 80) return 'B-';
  if (s >= 77) return 'C+'; if (s >= 73) return 'C'; if (s >= 70) return 'C-';
  if (s >= 67) return 'D+'; if (s >= 63) return 'D'; if (s >= 60) return 'D-';
  return 'F';
}
function updateScorecard() {
  const activeFac = Object.values(state.faculties).filter(Boolean).length;
  const facScore = (activeFac / FACULTIES.length) * 100;
  const modeScore = (state.modes.size / (MODES_W1.length + MODES_W2.length)) * 100;
  const intelligent = Math.round(facScore * 0.6 + modeScore * 0.4);
  const smart = Math.round(facScore * 0.4 + modeScore * 0.6);
  const autonomous = Math.round((facScore + modeScore) / 2);
  const composite = Math.round((intelligent + smart + autonomous) / 3);
  const set = (idG, idN, v) => { const g = $(idG); const n = $(idN); if (g) g.textContent = gradeScore(v); if (n) n.textContent = String(v); };
  set('#sc-int','#sc-int-n', intelligent);
  set('#sc-sma','#sc-sma-n', smart);
  set('#sc-aut','#sc-aut-n', autonomous);
  set('#sc-com','#sc-com-n', composite);
}

// ---------- mode switch
function bindModeSwitch() {
  $$('.mode-switch button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-mode');
      $$('.mode-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const eyebrow = $('#mode-eyebrow');
      if (eyebrow) eyebrow.textContent = state.mode === 'first_screening' ? 'FIRST SCREENING' : 'DAILY MONITORING';
      const dest = $('#hud-dest');
      if (dest) dest.textContent = state.mode === 'first_screening' ? 'Inbox → MLRO triage (first screening)' : 'Monitoring stream → MLRO triage (daily)';
      state.recordId = generateRecordId(state.mode);
      const r1 = $('#re_record_id'); if (r1) r1.value = state.recordId;
      const r2 = $('#hud-rec'); if (r2) r2.textContent = state.recordId;
    });
  });
}

// ---------- required fields + section completion
function requiredInputs() {
  return $$('#form [required], #form [data-req]');
}
function isFilled(el) {
  if (el.type === 'checkbox') return el.checked;
  return String(el.value || '').trim().length > 0;
}
function countRequired() {
  const all = requiredInputs();
  const done = all.filter(isFilled).length;
  return { done, total: all.length };
}
function sectionState(sectionEl) {
  const req = $$('[required], [data-req]', sectionEl);
  if (req.length === 0) return 'none';
  const done = req.filter(isFilled).length;
  if (done === 0) return 'none';
  if (done === req.length) return 'complete';
  return 'partial';
}
function updateProgress() {
  const { done, total } = countRequired();
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const sidePct = $('#side-pct'); if (sidePct) sidePct.textContent = `${pct}%`;
  const sideFill = $('#side-fill'); if (sideFill) sideFill.style.width = `${pct}%`;
  const hDone = $('#hud-done'); if (hDone) hDone.textContent = String(done);
  const hTot = $('#hud-total'); if (hTot) hTot.textContent = String(total);
  const hFill = $('#hud-fill'); if (hFill) hFill.style.width = `${pct}%`;
  $$('#side-nav a').forEach((a) => {
    const id = a.getAttribute('data-sec');
    const sec = document.getElementById(id);
    if (!sec) return;
    a.classList.remove('complete','partial');
    const s = sectionState(sec);
    if (s !== 'none') a.classList.add(s);
  });
}

// ---------- four-eyes SoD
function validateSoD() {
  const s = ($('#sb_name')?.value || '').trim().toLowerCase();
  const a1 = ($('#ap1_name')?.value || '').trim().toLowerCase();
  const a2 = ($('#ap2_name')?.value || '').trim().toLowerCase();
  const err1 = $('.err[data-for="ap1_name"]');
  const err2 = $('.err[data-for="ap2_name"]');
  let ok = true;
  if (s && a1 && s === a1) { err1?.classList.add('on'); $('#ap1_name')?.setAttribute('aria-invalid','true'); ok = false; }
  else { err1?.classList.remove('on'); $('#ap1_name')?.removeAttribute('aria-invalid'); }
  if (a2 && (a2 === s || a2 === a1)) { err2?.classList.add('on'); $('#ap2_name')?.setAttribute('aria-invalid','true'); ok = false; }
  else { err2?.classList.remove('on'); $('#ap2_name')?.removeAttribute('aria-invalid'); }
  return ok;
}

// ---------- autosave
function snapshot() {
  const form = $('#form');
  const data = {};
  $$('input, select, textarea', form).forEach((el) => {
    if (!el.id && !el.name) return;
    const key = el.id || el.name;
    if (el.type === 'checkbox') {
      if (!data[key]) data[key] = [];
      if (Array.isArray(data[key])) { if (el.checked) data[key].push(el.value || true); }
      else { data[key] = el.checked; }
    } else {
      data[key] = el.value;
    }
  });
  return {
    mode: state.mode,
    recordId: state.recordId,
    faculties: state.faculties,
    modes: Array.from(state.modes),
    fields: data,
    savedAt: nowUtcIso(),
  };
}
function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); flash('Draft saved'); } catch {}
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.mode) {
      state.mode = d.mode;
      const btn = $(`.mode-switch button[data-mode="${d.mode}"]`);
      btn?.click();
    }
    if (d.fields) {
      Object.entries(d.fields).forEach(([k, v]) => {
        const el = document.getElementById(k) || $(`[name="${k}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.value !== undefined) el.value = v;
      });
    }
  } catch {}
}

function flash(msg) {
  const btn = $('#save-draft');
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.innerHTML = `Save draft <span class="btn-kbd">⌘S</span>`; }, 1400);
}

// ---------- envelope build
function buildEnvelope() {
  const snap = snapshot();
  return {
    product: 'Hawkeye Sterling V2',
    module: '01 · Subject Screening',
    mode: state.mode,
    recordId: state.recordId,
    generatedAt: nowUtcIso(),
    destination: {
      system: 'Asana',
      route: state.mode === 'first_screening' ? '00 · Hawkeye Inbox → MLRO triage' : 'Daily Monitoring Stream → MLRO triage',
    },
    cognitiveEngine: {
      faculties: Object.entries(state.faculties).filter(([,v]) => v).map(([k]) => k),
      reasoningModes: Array.from(state.modes),
      modeCount: state.modes.size,
    },
    adverseMedia: {
      categories: TAXONOMY.map((c) => c.id),
      queryPreview: ADVERSE_QUERY.slice(0, 120) + '…',
    },
    fields: snap.fields,
    regulatoryBasis: [
      'FDL 10/2025 Art.20-21','Cabinet Res 74/2020 Art.4-7','Cabinet Res 134/2025 Art.19',
      'MoE Circular 3/2025','FDL 46/2021','Cabinet Decision 28/2023','Evidence Law FL 35/2022','FDL 45/2021 (PDPL)',
    ],
    retention: { internal: '10 yr', regulatory: 'min. 5 yr' },
  };
}

// ---------- submit
function validateAll() {
  let ok = true;
  requiredInputs().forEach((el) => {
    if (!isFilled(el)) { el.setAttribute('aria-invalid','true'); ok = false; }
    else el.removeAttribute('aria-invalid');
  });
  if (!validateSoD()) ok = false;
  return ok;
}

function onSubmit(e) {
  e.preventDefault();
  if (!validateAll()) {
    const firstBad = $('[aria-invalid="true"]');
    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash('Check required fields');
    return;
  }
  const env = buildEnvelope();
  const pre = $('#envelope-json');
  const box = $('#envelope');
  if (pre) pre.textContent = JSON.stringify(env, null, 2);
  if (box) { box.hidden = false; box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ---------- active section tracking
function bindIntersection() {
  const secs = $$('.sec');
  if (!('IntersectionObserver' in window) || secs.length === 0) return;
  const links = new Map($$('#side-nav a').map((a) => [a.getAttribute('data-sec'), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        $$('#side-nav a').forEach((a) => a.classList.remove('active'));
        const a = links.get(en.target.id);
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
  secs.forEach((s) => io.observe(s));
}

// ---------- init
function init() {
  // UTC clock
  const clock = $('#utc-clock');
  if (clock) { const tick = () => clock.textContent = nowUtcClock(); tick(); setInterval(tick, 1000); }

  // auto fields
  state.recordId = generateRecordId(state.mode);
  const r1 = $('#re_record_id'); if (r1) r1.value = state.recordId;
  const r2 = $('#hud-rec'); if (r2) r2.textContent = state.recordId;
  const sc = $('#sc_dt'); if (sc && !sc.value) sc.value = nowLocalDatetime();
  const sb = $('#sb_dt'); if (sb && !sb.value) sb.value = nowLocalDatetime();
  const ip = $('#sig_sb_ip'); if (ip) ip.value = 'captured on submit (client-agent-meta)';

  renderFaculties();
  renderModesPool();
  renderTaxonomy();
  updateScorecard();
  bindModeSwitch();
  loadDraft();

  const form = $('#form');
  if (form) {
    const onChange = debounce(() => { updateProgress(); validateSoD(); saveDraftSilent(); }, 250);
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);
    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', () => setTimeout(() => { updateProgress(); }, 0));
  }

  $('#save-draft')?.addEventListener('click', saveDraft);

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); saveDraft(); }
    if (e.key === 'Enter') { e.preventDefault(); form?.requestSubmit(); }
  });

  bindIntersection();
  updateProgress();
}

const saveDraftSilent = debounce(() => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch {}
}, 600);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
// Hawkeye Sterling — HUD client.
// Fetches /api/brain for live stats, renders faculties + list coverage,
// submits /api/screen on engage, streams the reasoning chain into the UI.
// No external dependencies; CSP-compliant.

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const sanitize = (s) => String(s ?? '').replace(/[<>&]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;');

  async function loadBrain() {
    try {
      const res = await fetch('/api/brain', { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error(`brain-meta ${res.status}`);
      const data = await res.json();
      renderStats(data.totals);
      renderFaculties(data.faculties);
    } catch (err) {
      console.error('brain-meta', err);
      // Leave placeholder dashes; UI still usable.
    }
  }

  async function loadLists() {
    try {
      const res = await fetch('/api/lists', { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error(`lists ${res.status}`);
      const data = await res.json();
      renderLists(data.lists);
    } catch (err) {
      console.error('lists', err);
    }
  }

  function renderStats(totals) {
    if (!totals) return;
    for (const el of $$('.stat-num')) {
      const k = el.getAttribute('data-k');
      if (k && totals[k] != null) el.textContent = String(totals[k]);
    }
  }

  function renderFaculties(faculties) {
    const grid = $('#faculty-grid');
    if (!grid || !faculties) return;
    grid.textContent = '';
    for (const f of faculties) {
      const card = document.createElement('div');
      card.className = 'faculty-card';
      const h = document.createElement('h3');
      h.textContent = f.displayName;
      const c = document.createElement('div');
      c.className = 'count';
      c.textContent = `${f.modeCount} reasoning modes`;
      const p = document.createElement('p');
      p.textContent = (f.synonyms || []).join(' · ');
      card.append(h, c, p);
      grid.appendChild(card);
    }
  }

  function renderLists(lists) {
    const tbody = $('#coverage-table tbody');
    if (!tbody || !lists) return;
    tbody.textContent = '';
    for (const L of lists) {
      const tr = document.createElement('tr');
      for (const k of ['displayName', 'authority', 'coverage']) {
        const td = document.createElement('td');
        td.textContent = L[k] || '';
        tr.appendChild(td);
      }
      const tdPhase = document.createElement('td');
      tdPhase.textContent = L.phase != null ? `Phase ${L.phase}` : '—';
      tr.appendChild(tdPhase);
      const tdStatus = document.createElement('td');
      tdStatus.textContent = L.status || '';
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    }
  }

  function validateInput(form) {
    const name = form.name.value.trim();
    if (!name || name.length > 256) return 'Subject name required (1–256 chars)';
    return null;
  }

  function buildPayload(form) {
    const name = form.name.value.trim();
    const type = form.type.value;
    const jurisdiction = form.jurisdiction.value.trim();
    const identifier = form.identifier.value.trim();
    const aliases = form.aliases.value
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .slice(0, 32);

    const identifiers = identifier ? { primary: identifier } : undefined;

    const subject = {
      name,
      type,
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(aliases.length ? { aliases } : {}),
      ...(identifiers ? { identifiers } : {}),
    };
    return { subject };
  }

  function resetChain(msg) {
    const ol = $('#chain');
    ol.textContent = '';
    $('#chain-status').textContent = msg;
  }

  function appendChainNode(node) {
    const ol = $('#chain');
    const li = document.createElement('li');
    const step = document.createElement('span'); step.className = 'step';
    step.textContent = String(node.step).padStart(3, '0');
    const fac = document.createElement('span'); fac.className = 'fac';
    fac.textContent = node.faculty;
    const sum = document.createElement('span'); sum.className = 'sum';
    sum.textContent = node.summary;
    li.append(step, fac, sum);
    ol.appendChild(li);
  }

  function setVerdict(verdict, depth) {
    const badge = $('#verdict-badge');
    const outcome = verdict.outcome || 'inconclusive';
    badge.setAttribute('data-outcome', outcome);
    badge.textContent = outcome.toUpperCase();

    const fields = $('#verdict-fields');
    const setK = (k, v) => {
      const dd = fields.querySelector(`dd[data-k="${k}"]`);
      if (dd) dd.textContent = v;
    };
    setK('runId', verdict.runId);
    setK('score', verdict.aggregateScore.toFixed(3));
    setK('confidence', verdict.aggregateConfidence.toFixed(3));
    setK('modesRun', String(depth.modesRun));
    setK('facultyCount', `${depth.facultyCount} / 10`);
    setK('categories', depth.categoriesSpanned.join(', ') || '—');

    const actions = $('#actions');
    const list = $('#actions-list');
    list.textContent = '';
    for (const a of verdict.recommendedActions || []) {
      const li = document.createElement('li');
      li.textContent = a;
      list.appendChild(li);
    }
    actions.hidden = (verdict.recommendedActions || []).length === 0;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = validateInput(form);
    if (err) { alert(err); return; }

    const btn = $('#f-submit');
    btn.disabled = true;
    $('#pulse').hidden = false;
    resetChain('Engaging brain…');
    $('#verdict-badge').setAttribute('data-outcome', 'idle');
    $('#verdict-badge').textContent = 'RUNNING';

    try {
      const payload = buildPayload(form);
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`screen ${res.status}`);
      const data = await res.json();
      const { verdict, depth } = data;

      $('#chain-status').textContent =
        `${depth.chainLength} reasoning steps · ${depth.modesRun} modes · ${depth.facultyCount} / 10 faculties`;
      resetChain($('#chain-status').textContent);

      for (const node of verdict.chain) {
        appendChainNode(node);
        // Yield briefly so the stream feels alive in the HUD.
        await new Promise((r) => setTimeout(r, 8));
      }
      setVerdict(verdict, depth);
    } catch (err) {
      console.error(err);
      $('#chain-status').textContent = 'Screen failed — see console.';
      $('#verdict-badge').setAttribute('data-outcome', 'inconclusive');
      $('#verdict-badge').textContent = 'ERROR';
    } finally {
      btn.disabled = false;
      $('#pulse').hidden = true;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadBrain();
    loadLists();
    const form = $('#screen-form');
    if (form) form.addEventListener('submit', onSubmit);
  });
})();
