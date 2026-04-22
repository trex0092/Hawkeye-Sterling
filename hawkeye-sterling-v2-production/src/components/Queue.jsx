import { useState } from 'react';
import { SUBJECTS } from '@/data/constants';

function Queue({ selectedId, setSelectedId }) {
  const [search, setSearch] = useState('');

  const filtered = SUBJECTS.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase())
  );

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'crit':
        return 'var(--accent)';
      case 'high':
        return 'var(--amber)';
      default:
        return 'var(--ink-3)';
    }
  };

  return (
    <div className="queue">
      <div className="queue-head">
        <div className="queue-title">
          <h1>
            Queue <em>42</em>
          </h1>
          <div className="queue-stats">
            <div>
              <b>3</b> critical
            </div>
            <div>
              <b>7</b> high-risk
            </div>
          </div>
        </div>
      </div>

      <div className="queue-toolbar">
        <div className="search">
          <span style={{ color: 'var(--ink-3)' }}>🔍</span>
          <input
            type="text"
            placeholder="Search ID or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn primary">Screen</button>
      </div>

      <div className="qlist">
        <div className="qrow head">
          <div></div>
          <div></div>
          <div>Subject</div>
          <div>Severity</div>
          <div>Age</div>
          <div>Score</div>
          <div>Hits</div>
        </div>

        {filtered.map((subject) => (
          <div
            key={subject.id}
            className={`qrow ${selectedId === subject.id ? 'active' : ''}`}
            onClick={() => setSelectedId(subject.id)}
            style={{
              cursor: 'pointer',
              borderLeft: selectedId === subject.id ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: getSeverityColor(subject.severity),
              }}
            ></div>
            <div style={{ fontSize: 'var(--fs-mono)', color: 'var(--ink-3)' }}>{subject.id}</div>
            <div>
              <div style={{ fontWeight: 500 }}>{subject.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{subject.type}</div>
            </div>
            <div style={{ textTransform: 'capitalize', fontSize: '12px' }}>{subject.severity}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: '12px' }}>{subject.age}</div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{subject.score}</div>
            <div style={{ color: 'var(--amber)', fontWeight: 600 }}>
              {subject.lists ? subject.lists.filter((l) => l.hit).length : 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Queue;
