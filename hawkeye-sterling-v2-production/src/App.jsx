import React, { useState, useEffect } from 'react';
import { SUBJECTS, APPROVALS, CONSOLE_LINES } from '@/data/constants';
import TopBar from '@/components/TopBar';
import RegulatoryRibbon from '@/components/RegulatoryRibbon';
import LeftRail from '@/components/LeftRail';
import Queue from '@/components/Queue';
import Detail from '@/components/Detail';
import BottomRail from '@/components/BottomRail';
import Tweaks from '@/components/Tweaks';
import ScreeningPage from '@/components/pages/ScreeningPage';
import CasesPage from '@/components/pages/CasesPage';
import EvidencePage from '@/components/pages/EvidencePage';
import AuditPage from '@/components/pages/AuditPage';

function App() {
  const [workspace, setWorkspace] = useState('bench');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('HS-24891');
  const [approvals, setApprovals] = useState(APPROVALS);
  const [lines, setLines] = useState(CONSOLE_LINES);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweakState, setTweakState] = useState({
    theme: 'light',
    density: 'comfortable',
    hue: 28,
  });
  const [now, setNow] = useState('14:27:18');

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const total = 14 * 3600 + 27 * 60 + 18 + Math.floor((Date.now() - start) / 1000);
      const H = Math.floor(total / 3600) % 24;
      const M = Math.floor(total / 60) % 60;
      const S = total % 60;
      setNow(`${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const rolls = [
      { lvl: 'SYS', kind: 'sys', msg: 'Heartbeat · 6 lists healthy · q depth 42' },
      { lvl: 'CLEAR', kind: 'clear', msg: 'UN Consolidated · batch rescreen · 412 subjects · 0 new hits' },
      { lvl: 'SYS', kind: 'sys', msg: 'Policy cache refreshed · v4.1 · 14:28' },
      { lvl: 'HIT', kind: 'hit', msg: 'Adverse media · HS-24880 · regulatory action · score 76' },
    ];

    const interval = setInterval(() => {
      const pick = rolls[Math.floor(Math.random() * rolls.length)];
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      setLines((prev) => [{ ts, ...pick }, ...prev].slice(0, 40));
    }, 6500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 't' || e.key === 'T') setTweaksOpen((v) => !v);
      if (e.key === 'j' || e.key === 'J') {
        const idx = SUBJECTS.findIndex((s) => s.id === selectedId);
        if (idx < SUBJECTS.length - 1) setSelectedId(SUBJECTS[idx + 1].id);
      }
      if (e.key === 'k' || e.key === 'K') {
        const idx = SUBJECTS.findIndex((s) => s.id === selectedId);
        if (idx > 0) setSelectedId(SUBJECTS[idx - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweakState.theme);
    document.documentElement.setAttribute('data-density', tweakState.density);
  }, [tweakState]);

  return (
    <div className="app">
      <TopBar workspace={workspace} setWorkspace={setWorkspace} onTweaksToggle={() => setTweaksOpen((v) => !v)} now={now} />
      <RegulatoryRibbon />
      {workspace === 'bench' && (
        <>
          <div className="workbench">
            <LeftRail activeFilter={filter} setFilter={setFilter} />
            <Queue selectedId={selectedId} setSelectedId={setSelectedId} />
            <Detail subjectId={selectedId} onApprove={() => alert('STR draft opened')} onEscalate={() => alert('Escalated to Deputy MLRO')} />
          </div>
          <BottomRail approvals={approvals} setApprovals={setApprovals} lines={lines} />
        </>
      )}
      {workspace === 'screen' && <ScreeningPage />}
      {workspace === 'cases' && <CasesPage />}
      {workspace === 'evidence' && <EvidencePage />}
      {workspace === 'audit' && <AuditPage />}
      <Tweaks visible={tweaksOpen} onClose={() => setTweaksOpen(false)} state={tweakState} setState={setTweakState} />
    </div>
  );
}

export default App;
