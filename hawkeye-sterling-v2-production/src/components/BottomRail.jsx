import React, { useState } from 'react';

function BottomRail({ approvals, lines }) {
  const [activeTab, setActiveTab] = useState('approvals');

  return (
    <div className="bottom-rail">
      <div style={{ borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--pad)', borderBottom: '1px solid var(--rule)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-micro)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Awaiting Approval · {approvals.length}
          </h3>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--pad-sm)' }}>
          {approvals.map((apr) => (
            <div
              key={apr.id}
              style={{
                border: `1px solid var(--rule)`,
                borderLeft: apr.kind === 'danger' ? '3px solid var(--accent)' : '3px solid var(--rule)',
                padding: '10px 12px',
                marginBottom: '8px',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              <div style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'var(--ink-3)', marginBottom: '4px' }}>
                {apr.id}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{apr.title}</div>
              <div style={{ fontSize: '10px', color: 'var(--ink-3)', marginBottom: '4px' }}>
                {apr.meta.map((m, i) => (
                  <span key={i}>
                    {m}
                    {i < apr.meta.length - 1 && ' · '}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 500 }}>{apr.sla}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--pad)', borderBottom: '1px solid var(--rule)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-micro)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Console · Live
          </h3>
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'var(--pad-sm)',
            fontFamily: 'JetBrains Mono',
            fontSize: '10px',
            backgroundColor: 'var(--paper)',
          }}
        >
          {lines.map((line, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '4px',
                color:
                  line.kind === 'hit'
                    ? 'var(--accent)'
                    : line.kind === 'clear'
                      ? 'var(--sage)'
                      : line.kind === 'warn'
                        ? 'var(--amber)'
                        : 'var(--ink-2)',
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{line.ts}</span> {line.lvl} {line.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BottomRail;
