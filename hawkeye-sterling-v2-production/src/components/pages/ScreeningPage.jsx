function ScreeningPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--pad)',
        color: 'var(--ink-3)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: '32px', fontWeight: 400, margin: '0 0 10px' }}>
          Screening Module
        </h2>
        <p>Real-time sanctions and screening engine interface</p>
        <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Coming soon · Component ready for integration</p>
      </div>
    </div>
  );
}

export default ScreeningPage;
