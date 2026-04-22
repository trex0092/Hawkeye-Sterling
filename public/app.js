// Hawkeye Sterling — HUD client.
// Fetches /api/brain + /api/lists, submits /api/screen, streams the reasoning
// chain, renders findings by category, and renders sanctions-match candidate
// cards. No external dependencies. CSP-compliant.

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function loadBrain() {
    try {
      const res = await fetch('/api/brain', { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error('brain-meta ' + res.status);
      const data = await res.json();
      renderStats(data.totals);
      renderFaculties(data.faculties);
    } catch (err) { console.error('brain-meta', err); }
  }

  async function loadLists() {
    try {
      const res = await fetch('/api/lists', { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error('lists ' + res.status);
      const data = await res.json();
      renderLists(data.lists);
    } catch (err) { console.error('lists', err); }
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
      c.textContent = (f.modeCount || 0) + ' reasoning modes';
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
      tdPhase.textContent = L.phase != null ? 'Phase ' + L.phase : '—';
      tr.appendChild(tdPhase);
      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'list-status status-' + (L.status || 'planned');
      badge.textContent = L.status || 'planned';
      tdStatus.appendChild(badge);
      if (L.recordCount != null) {
        const small = document.createElement('span');
        small.className = 'list-meta';
        small.textContent = ' · ' + L.recordCount + ' records';
        tdStatus.appendChild(small);
      }
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
    const aliases = form.aliases.value.split(',').map((a) => a.trim()).filter((a) => a.length > 0).slice(0, 32);
    const identifiers = identifier ? { primary: identifier } : undefined;
    const subject = {
      name, type,
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(aliases.length ? { aliases } : {}),
      ...(identifiers ? { identifiers } : {}),
    };
    return { subject };
  }

  function resetStreams(msg) {
    $('#chain').textContent = '';
    $('#chain-status').textContent = msg;
    const findingsGrid = $('#findings-grid');
    if (findingsGrid) findingsGrid.textContent = '';
    const hitsGrid = $('#hits-grid');
    if (hitsGrid) hitsGrid.textContent = '';
    $('#findings-section').hidden = true;
    $('#hits-section').hidden = true;
  }

  function appendChainNode(node) {
    const ol = $('#chain');
    const li = document.createElement('li');
    li.className = 'chain-node';
    if (node.summary && node.summary.toLowerCase().startsWith('[meta]')) li.classList.add('meta');
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
      const dd = fields.querySelector('dd[data-k="' + k + '"]');
      if (dd) dd.textContent = v;
    };
    setK('runId', verdict.runId);
    setK('score', verdict.aggregateScore.toFixed(3));
    setK('confidence', verdict.aggregateConfidence.toFixed(3));
    setK('modesRun', String(depth.modesRun));
    setK('facultyCount', depth.facultyCount + ' / 10');
    setK('categories', (depth.categoriesSpanned || []).join(', ') || '—');
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

  function renderFindings(findings) {
    if (!Array.isArray(findings) || findings.length === 0) return;
    const section = $('#findings-section');
    const grid = $('#findings-grid');
    grid.textContent = '';
    const byCat = new Map();
    for (const f of findings) {
      const cat = f.category || 'other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(f);
    }
    const orderedCats = [...byCat.keys()].sort();
    for (const cat of orderedCats) {
      const card = document.createElement('article');
      card.className = 'finding-card';
      const h = document.createElement('h3');
      h.textContent = cat.replace(/_/g, ' ');
      const countBadge = document.createElement('span');
      countBadge.className = 'cat-count';
      countBadge.textContent = String(byCat.get(cat).length);
      h.appendChild(countBadge);
      card.appendChild(h);
      const list = document.createElement('ul');
      for (const f of byCat.get(cat)) {
        const li = document.createElement('li');
        const badge = document.createElement('span');
        badge.className = 'verdict-pill v-' + (f.verdict || 'inconclusive');
        badge.textContent = f.verdict || 'inconclusive';
        const mode = document.createElement('span');
        mode.className = 'mode-id';
        mode.textContent = f.modeId;
        const score = document.createElement('span');
        score.className = 'score-cell';
        score.textContent = 's=' + (f.score ?? 0).toFixed(2) + ' · c=' + (f.confidence ?? 0).toFixed(2);
        const rationale = document.createElement('p');
        rationale.className = 'rationale';
        rationale.textContent = f.rationale || '';
        li.append(badge, mode, score, rationale);
        if (Array.isArray(f.evidence) && f.evidence.length > 0) {
          const ev = document.createElement('ul');
          ev.className = 'evidence-list';
          for (const e of f.evidence.slice(0, 4)) {
            const evli = document.createElement('li');
            evli.textContent = e;
            ev.appendChild(evli);
          }
          li.appendChild(ev);
        }
        list.appendChild(li);
      }
      card.appendChild(list);
      grid.appendChild(card);
    }
    section.hidden = false;
  }

  function renderSanctionsHits(hits) {
    const section = $('#hits-section');
    const grid = $('#hits-grid');
    grid.textContent = '';
    if (!Array.isArray(hits) || hits.length === 0) { section.hidden = true; return; }
    for (const h of hits) {
      const card = document.createElement('article');
      card.className = 'hit-card';
      const head = document.createElement('h3');
      head.textContent = h.name || '(unnamed)';
      const score = document.createElement('span');
      score.className = 'hit-score';
      score.textContent = (h.score ?? 0).toFixed(3);
      head.appendChild(score);
      card.appendChild(head);
      const meta = document.createElement('dl');
      const rows = [
        ['source', h.source],
        ['type', h.type],
        ['strategy', h.strategy],
        ['matched on', h.matchedOn],
        ['programs', (h.programs || []).slice(0, 3).join(' · ') || '—'],
        ['jaro-winkler', h.subScores ? h.subScores.jaroWinkler.toFixed(3) : '—'],
        ['token-set', h.subScores ? h.subScores.tokenSet.toFixed(3) : '—'],
        ['phonetic', h.subScores && h.subScores.phoneticMatch ? 'yes' : 'no'],
      ];
      for (const [k, v] of rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = String(v ?? '—');
        meta.append(dt, dd);
      }
      card.appendChild(meta);
      if (Array.isArray(h.aliases) && h.aliases.length > 0) {
        const aliases = document.createElement('p');
        aliases.className = 'hit-aliases';
        aliases.textContent = 'aliases: ' + h.aliases.slice(0, 4).join(' · ');
        card.appendChild(aliases);
      }
      grid.appendChild(card);
    }
    section.hidden = false;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = validateInput(form);
    if (err) { alert(err); return; }
    const btn = $('#f-submit');
    btn.disabled = true;
    $('#pulse').hidden = false;
    resetStreams('Engaging brain…');
    $('#verdict-badge').setAttribute('data-outcome', 'idle');
    $('#verdict-badge').textContent = 'RUNNING';
    try {
      const payload = buildPayload(form);
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('screen ' + res.status);
      const data = await res.json();
      const { verdict, depth } = data;
      $('#chain-status').textContent = (depth.chainLength || 0) + ' reasoning steps · ' + depth.modesRun + ' modes · ' + depth.facultyCount + ' / 10 faculties';
      for (const node of verdict.chain) {
        appendChainNode(node);
        await new Promise((r) => setTimeout(r, 6));
      }
      setVerdict(verdict, depth);
      renderFindings(verdict.findings);
      renderSanctionsHits(data.sanctionsHits || []);
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

  function onKeydown(ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      const form = $('#screen-form');
      if (form) form.requestSubmit();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadBrain();
    loadLists();
    const form = $('#screen-form');
    if (form) form.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKeydown);
  });
})();
