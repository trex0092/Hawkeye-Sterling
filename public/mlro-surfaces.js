// Hawkeye Sterling — operator surfaces (scaffold).
// Wires the 11-tab OPERATOR SURFACES section. Renderers for each surface are
// intentionally placeholder here — the authoritative logic for each lives in
// the backing TS modules under src/brain/ and will be mirrored in this file
// in the follow-up batch. This stub exists so the HTML doesn't 404 and the
// tab switcher is interactive.
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var SURFACES = {
    smurfing: {
      title: 'Smurfing / structuring detector',
      backing: 'src/brain/smurfing-detector.ts',
      note: 'Detects near-threshold cash clusters + multi-customer rings sharing a link-key.',
    },
    sanction_delta: {
      title: 'Sanction-list delta',
      backing: 'src/brain/sanction-delta.ts',
      note: 'Diffs two list snapshots — additions, removals, amendments, re-screen queue.',
    },
    cross_regime: {
      title: 'Cross-regime conflict',
      backing: 'src/brain/cross-regime-conflict.ts',
      note: 'Surfaces where UN / OFAC / EU / UK / EOCN regimes disagree on the subject.',
    },
    kri_registry: {
      title: 'KRI registry',
      backing: 'src/brain/kri-registry.ts',
      note: '14 board-facing Key Risk Indicators with RAG bands and appetite mapping.',
    },
    calibration: {
      title: 'Calibration ledger',
      backing: 'src/brain/mlro-calibration.ts',
      note: 'Brier / log / hit-rate over advisor predictions vs MLRO-confirmed outcomes.',
    },
    peer_benchmark: {
      title: 'Peer benchmark',
      backing: 'pending TS module',
      note: 'Compares self metrics against anonymised peer group across RBA dimensions.',
    },
    reasoning_diff: {
      title: 'Reasoning diff',
      backing: 'src/brain/mlro-conflict-detector.ts',
      note: 'Side-by-side comparison of two reasoning-chain runs — verdict, confidence, citations.',
    },
    facts_linter: {
      title: 'Observable-facts linter',
      backing: 'src/brain/observable-facts.ts',
      note: 'Checks narrative text for allegation-upgrade, legal-conclusion, and scope-drift violations.',
    },
    corroboration: {
      title: 'Corroboration score',
      backing: 'src/brain/evidence.ts',
      note: 'Counts independent evidence sources per claim; flags single-source dependencies.',
    },
    rubric_picker: {
      title: 'Sector-rubric picker',
      backing: 'src/brain/mlro-sector-rubrics.ts',
      note: 'DPMS / VASP / Real-estate / Insurance / FinTech — sector-specific EDD rubrics.',
    },
    playbook_viewer: {
      title: 'Playbook viewer',
      backing: 'src/brain/playbooks.ts',
      note: 'Renders the curated pipeline playbooks (CAHRA, VASP mixer, PEP SoW mismatch, ...).',
    },
  };

  function renderPlaceholder(id) {
    var s = SURFACES[id];
    if (!s) return '<p class="op-empty">Unknown surface.</p>';
    return (
      '<article class="op-placeholder">' +
      '  <header class="op-ph-head">' +
      '    <h4>' + s.title + '</h4>' +
      '    <span class="op-ph-backing mono">' + s.backing + '</span>' +
      '  </header>' +
      '  <p class="op-ph-note">' + s.note + '</p>' +
      '  <p class="op-ph-tag mono">RENDERER · SCAFFOLDED · BACKING MODULE SHIPPED</p>' +
      '</article>'
    );
  }

  function switchTo(id) {
    var mount = $('#op-surface-mount');
    if (!mount) return;
    mount.innerHTML = renderPlaceholder(id);
    $$('.op-tab').forEach(function (btn) {
      var on = btn.getAttribute('data-surface') === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
  }

  function init() {
    if (!$('#op-surface-mount')) return;
    $$('.op-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTo(btn.getAttribute('data-surface'));
      });
    });
    // Render the default (first / active) tab.
    var initial = $('.op-tab.is-active')?.getAttribute('data-surface') || 'smurfing';
    switchTo(initial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
