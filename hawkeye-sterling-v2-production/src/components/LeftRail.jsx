import { FILTERS, SHIFT } from '@/data/constants';

function LeftRail({ activeFilter, setFilter }) {
  return (
    <div className="rail">
      <div className="rail-section">
        <div className="shift-card">
          <div className="officer">
            <div className="officer-avatar">{SHIFT.avatar}</div>
            <div>
              <div className="officer-name">{SHIFT.officer}</div>
              <div className="officer-role">{SHIFT.role}</div>
            </div>
          </div>
          <div className="shift-meta">
            <div>
              <span className="k">Shift</span>
              <span className="v">{SHIFT.shiftStart}–{SHIFT.shiftEnd}</span>
            </div>
            <div>
              <span className="k">Caseload</span>
              <span className="v">{SHIFT.caseload}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rail-section">
        <h3>Queue filters</h3>
        <div className="filter-group">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-row ${activeFilter === f.id ? 'active' : ''} ${f.kind || ''}`}
              onClick={() => setFilter(f.id)}
            >
              <span>{f.label}</span>
              <span className="count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-foot">
        <strong>K</strong>/<strong>J</strong> to nav<br />
        <strong>T</strong> for tweaks
      </div>
    </div>
  );
}

export default LeftRail;
