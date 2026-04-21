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
