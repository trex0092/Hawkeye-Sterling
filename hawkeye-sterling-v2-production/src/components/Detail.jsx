import { useState } from 'react';
import { SUBJECTS } from '@/data/constants';

function Detail({ subjectId, onApprove, onEscalate }) {
  const subject = SUBJECTS.find((s) => s.id === subjectId);
  const [activeTab, setActiveTab] = useState('overview');

  if (!subject) {
    return <div className="queue" style={{ padding: 'var(--pad)', color: 'var(--ink-3)' }}>No subject selected</div>;
  }

  const riskGauge = Math.floor(subject.score / 10);

  return (
    <div className="queue" style={{ borderRight: 'none' }}>
      <div className="queue-head" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '32px', margin: 0, fontFamily: 'Cormorant Garamond', fontWeight: 400 }}>{subject.name}</h1>
          <div style={{ fontSize: '11px', color: 'var(--ink-3)', fontFamily: 'JetBrains Mono' }}>{subject.id}</div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginBottom: '8px' }}>
          {subject.type} · {subject.jur}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{subject.reason}</div>
      </div>

      <div className="queue-toolbar" style={{ gap: '6px' }}>
        {['overview', 'hits', 'timeline', 'ubos'].map((tab) => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'primary' : 'ghost'}`}
            onClick={() => setActiveTab(tab)}
            style={{ flex: 0 }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="qlist" style={{ padding: 'var(--pad)' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-micro)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                Risk Score
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(10, 1fr)',
                  gap: '2px',
                }}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: '8px',
                      background: i < riskGauge ? 'var(--accent)' : 'var(--paper-3)',
                      borderRadius: '1px',
                    }}
                  ></div>
                ))}
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                <strong>{subject.score}</strong>
                {subject.severity === 'crit' && ' (Critical)'}
              </div>
            </div>

            {subject.amount && (
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-micro)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                  Transaction
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Amount
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>{subject.amount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Product
                    </div>
                    <div style={{ fontSize: '14px' }}>{subject.product}</div>
                  </div>
                </div>
              </div>
            )}

            {subject.structure && (
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-micro)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                  Structure
                </h3>
                <div style={{ fontSize: '12px', lineHeight: 1.6 }}>{subject.structure}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hits' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {subject.hits && subject.hits.length > 0 ? (
              subject.hits.map((hit, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--rule)',
                    padding: '12px',
                    borderLeft: `3px solid ${hit.kind === 'crit' ? 'var(--accent)' : 'var(--amber)'}`,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hit.list}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2)', marginBottom: '8px' }}>{hit.listRef}</div>
                  <div style={{ fontSize: '12px', marginBottom: '6px' }}>{hit.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-3)', marginBottom: '8px' }}>{hit.meta}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{hit.reason}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)' }}>{hit.score}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-3)' }}>No hits found</div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div style={{ display: 'grid', gap: '12px' }}>
            {subject.timeline && subject.timeline.length > 0 ? (
              subject.timeline.map((event, idx) => (
                <div key={idx} style={{ borderLeft: '2px solid var(--rule)', paddingLeft: '12px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--ink-3)', fontFamily: 'JetBrains Mono', marginBottom: '4px' }}>
                    {event.t}
                  </div>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>{event.head}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginBottom: '6px' }}>{event.body}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-3)' }}>{event.actor}</div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-3)' }}>No timeline events</div>
            )}
          </div>
        )}

        {activeTab === 'ubos' && (
          <div style={{ display: 'grid', gap: '12px' }}>
            {subject.ubos && subject.ubos.length > 0 ? (
              subject.ubos.map((ubo, idx) => (
                <div key={idx} style={{ border: '1px solid var(--rule)', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid var(--ink)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '12px',
                      }}
                    >
                      {ubo.avatar}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{ubo.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{ubo.role}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span>{ubo.share} ownership</span>
                    <span style={{ color: 'var(--sage)' }}>●</span>
                    <span style={{ color: 'var(--ink-3)' }}>{ubo.statusLabel}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-3)' }}>No UBO data</div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--pad)', display: 'flex', gap: '10px', borderTop: '1px solid var(--rule)' }}>
        <button className="btn primary" onClick={onApprove}>
          Approve
        </button>
        <button className="btn danger" onClick={onEscalate}>
          Escalate
        </button>
      </div>
    </div>
  );
}

export default Detail;
