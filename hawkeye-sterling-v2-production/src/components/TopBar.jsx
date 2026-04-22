import React from 'react';
import { WORKSPACES } from '@/data/constants';

function TopBar({ workspace, setWorkspace, onTweaksToggle, now }) {
  return (
    <div className="top-bar">
      <div className="brand">
        <div className="brand-mark">H</div>
        <div className="brand-text">
          <div className="name">Hawkeye</div>
          <div className="sub">Sterling V2</div>
        </div>
      </div>

      <nav className="top-nav">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            className={`${workspace === ws.id ? 'active' : ''}`}
            onClick={() => setWorkspace(ws.id)}
          >
            {ws.label}
          </button>
        ))}
      </nav>

      <div className="top-right">
        <div className="session">
          <span>Session</span>
          <span className="chip">a7fb19c4</span>
          <span className="kbd">T</span>
        </div>
        <div style={{ color: 'var(--ink-3)', fontSize: '12px' }}>{now}</div>
      </div>
    </div>
  );
}

export default TopBar;
