export function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner" />
      <div style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}>
        Conectando...
      </div>
    </div>
  );
}
