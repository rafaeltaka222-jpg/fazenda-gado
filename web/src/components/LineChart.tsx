// Gráfico de linha refinado em SVG com preenchimento em degradê adaptável ao modo Claro/Escuro.
export default function LineChart({
  points,
  unit,
  title,
}: {
  points: { label: string; value: number }[];
  unit: string;
  title: string;
}) {
  if (points.length === 0) return <p className="muted">Sem dados para o período.</p>;

  const W = 580, H = 210, L = 48, R = 20, T = 22, B = 38;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.16;
  min -= pad; max += pad;

  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const lastX = x(points.length - 1);
  const firstX = x(0);
  const bottomY = H - B;
  const areaPath = `${linePath} L${lastX.toFixed(1)},${bottomY} L${firstX.toFixed(1)},${bottomY} Z`;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", maxWidth: W, height: "auto" }}>
        <title>{title}</title>
        <defs>
          <linearGradient id="agroAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.01" />
          </linearGradient>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="var(--brand)" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Linhas de Grade Horizontais */}
        {[0, 0.5, 1].map((t) => {
          const v = min + (max - min) * t;
          return (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--line)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontWeight="500">
                {fmt(v)}
              </text>
            </g>
          );
        })}

        {/* Área preenchida sob a curva */}
        <path d={areaPath} fill="url(#agroAreaGrad)" />

        {/* Linha principal */}
        <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Pontos de dados e labels */}
        {points.map((p, i) => {
          const px = x(i);
          const py = y(p.value);
          return (
            <g key={p.label}>
              <circle cx={px} cy={py} r="6" fill="var(--surface)" stroke="var(--brand)" strokeWidth="3" filter="url(#shadow)" />
              {/* Badge/Valor acima do ponto */}
              <rect
                x={px - 28}
                y={py - 24}
                width="56"
                height="18"
                rx="5"
                fill="var(--surface)"
                stroke="var(--line-strong)"
                strokeWidth="1"
              />
              <text x={px} y={py - 11} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--ink)">
                {fmt(p.value)} {unit}
              </text>
              {/* Mês/Rótulo no rodapé */}
              <text x={px} y={H - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--muted)">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}