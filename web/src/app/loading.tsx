export default function GlobalLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* Barra de progresso superior */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 9999,
          background: "linear-gradient(90deg, var(--brand), #4ade80, var(--brand))",
          backgroundSize: "200% 100%",
          animation: "agroProgressPulse 0.9s linear infinite",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="skeleton-pulse" style={{ width: 260, height: 32 }} />
        <div className="skeleton-pulse" style={{ width: 160, height: 36 }} />
      </div>

      <div className="agropec-kpi-grid">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="card"
            style={{ height: 108, marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div className="skeleton-pulse" style={{ width: "60%", height: 16 }} />
            <div className="skeleton-pulse" style={{ width: "45%", height: 28 }} />
            <div className="skeleton-pulse" style={{ width: "80%", height: 12 }} />
          </div>
        ))}
      </div>

      <div className="agropec-main-grid">
        <div className="card" style={{ height: 340, marginBottom: 0 }}>
          <div className="skeleton-pulse" style={{ width: "40%", height: 20, marginBottom: 20 }} />
          <div className="skeleton-pulse" style={{ width: "100%", height: 240 }} />
        </div>
        <div className="card" style={{ height: 340, marginBottom: 0 }}>
          <div className="skeleton-pulse" style={{ width: "50%", height: 20, marginBottom: 20 }} />
          <div className="skeleton-pulse" style={{ width: "100%", height: 100, marginBottom: 14 }} />
          <div className="skeleton-pulse" style={{ width: "100%", height: 100 }} />
        </div>
      </div>
    </div>
  );
}
