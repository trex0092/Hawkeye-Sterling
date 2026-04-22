function Tweaks({ visible, onClose, state, setState }) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--ink-2)',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Theme
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {['light', 'dark'].map((theme) => (
                <button
                  key={theme}
                  onClick={() => setState({ ...state, theme })}
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${state.theme === theme ? 'var(--accent)' : 'var(--rule)'}`,
                    background: state.theme === theme ? 'var(--accent-soft)' : 'var(--paper-2)',
                    color: 'var(--ink)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontWeight: state.theme === theme ? 500 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Density
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {['comfortable', 'compact'].map((density) => (
                <button
                  key={density}
                  onClick={() => setState({ ...state, density })}
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${state.density === density ? 'var(--accent)' : 'var(--rule)'}`,
                    background: state.density === density ? 'var(--accent-soft)' : 'var(--paper-2)',
                    color: 'var(--ink)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontWeight: state.density === density ? 500 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Accent Hue
            </label>
            <input
              type="range"
              min="0"
              max="360"
              value={state.hue}
              onChange={(e) => setState({ ...state, hue: parseInt(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink-3)' }}>{state.hue}°</div>
          </div>

          <div
            style={{
              padding: '12px',
              background: 'var(--paper-2)',
              borderRadius: '2px',
              fontSize: '11px',
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            <strong>Keyboard shortcuts:</strong>
            <div>• <strong>T</strong> — Toggle settings</div>
            <div>• <strong>K</strong>/<strong>J</strong> — Navigate queue</div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '10px 12px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default Tweaks;
