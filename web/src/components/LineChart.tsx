// Gráfico de linha simples em SVG (sem biblioteca), renderizado no servidor.
export default function LineChart({ points, unit, title }: { points: { label: string; value: number }[]; unit: string; title: string }) {
  if (points.length === 0) return <p className="muted">Sem dados.</p>;
  const W = 560, H = 190, L = 44, R = 16, T = 16, B = 34;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", maxWidth: W, height: "auto" }}>
      <title>{title}</title>
      {[0, 0.5, 1].map((t) => {
        const v = min + (max - min) * t;
        return (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} style={{ stroke: "#e7eae4" }} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: "#4a5a50" }}>{fmt(v)}</text>
          </g>
        );
      })}
      <path d={path} fill="none" strokeWidth="2.5" style={{ stroke: "#2f6b3f" }} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="4" style={{ fill: "#2f6b3f" }} />
          <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: "#1b2a22" }}>{fmt(p.value)} {unit}</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" style={{ fill: "#4a5a50" }}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
