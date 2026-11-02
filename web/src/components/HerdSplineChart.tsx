"use client";

import { useState } from "react";

interface DataPoint {
  month: string;
  actual: number;
  target: number;
}

const DEFAULT_DATA: DataPoint[] = [
  { month: "Jan", actual: 70, target: 60 },
  { month: "Fev", actual: 104, target: 82 },
  { month: "Mar", actual: 110, target: 88 },
  { month: "Abr", actual: 106, target: 116 },
  { month: "Mai", actual: 114, target: 110 },
  { month: "Jun", actual: 138, target: 122 },
  { month: "Jul", actual: 124, target: 136 },
  { month: "Ago", actual: 142, target: 150 },
  { month: "Set", actual: 156, target: 144 },
  { month: "Out", actual: 160, target: 154 },
  { month: "Nov", actual: 152, target: 158 },
  { month: "Dez", actual: 178, target: 164 },
];

// Gera curva Bézier cúbica suave através dos pontos (Catmull-Rom para Bézier)
function getSmoothSplinePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return path;
}

export default function HerdSplineChart({
  data = DEFAULT_DATA,
  currentCount,
}: {
  data?: DataPoint[];
  currentCount?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Ajusta a última barra/ponto se houver contagem real
  const chartData = data.map((d, i) => {
    if (i === data.length - 1 && currentCount && currentCount > 0) {
      return { ...d, actual: currentCount };
    }
    return d;
  });

  const W = 620;
  const H = 240;
  const padLeft = 40;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 32;

  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const minY = 40;
  const maxY = 180;
  const yTicks = [40, 60, 80, 100, 120, 140, 160, 180];

  const getX = (i: number) => padLeft + (i / (chartData.length - 1)) * chartW;
  const getY = (val: number) => padTop + chartH - ((val - minY) / (maxY - minY)) * chartH;

  const actualPoints = chartData.map((d, i) => ({ x: getX(i), y: getY(d.actual) }));
  const targetPoints = chartData.map((d, i) => ({ x: getX(i), y: getY(d.target) }));

  const actualSpline = getSmoothSplinePath(actualPoints);
  const targetSpline = getSmoothSplinePath(targetPoints);

  // Área preenchida sob a curva verde
  const areaPath = `${actualSpline} L ${actualPoints[actualPoints.length - 1].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${actualPoints[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  return (
    <div style={{ position: "relative", width: "100%", overflowX: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Gráfico de Evolução do Rebanho Ativo"
      >
        <defs>
          {/* Gradiente sutil sob a curva esmeralda */}
          <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="85%" stopColor="#10b981" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>

          {/* Sombra de brilho para os pontos */}
          <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#10b981" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Linhas de Grade Horizontais e Rótulos Y */}
        {yTicks.map((val) => {
          const y = getY(val);
          return (
            <g key={val}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.4"
              />
              <text
                x={padLeft - 10}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--muted)"
                fontWeight="500"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Área preenchida sob a curva esmeralda */}
        <path d={areaPath} fill="url(#emeraldGrad)" />

        {/* Linha Ciano (Meta / Ano Anterior) */}
        <path
          d={targetSpline}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />

        {/* Linha Esmeralda (Rebanho Real Atual) */}
        <path
          d={actualSpline}
          fill="none"
          stroke="#10b981"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pontos Ciano */}
        {targetPoints.map((pt, i) => (
          <circle
            key={`target-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={hoveredIdx === i ? 4.5 : 3}
            fill="#38bdf8"
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
        ))}

        {/* Pontos Esmeralda */}
        {actualPoints.map((pt, i) => (
          <circle
            key={`actual-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={hoveredIdx === i ? 5.5 : 4}
            fill="#10b981"
            stroke="var(--surface)"
            strokeWidth="2"
            filter="url(#glow-emerald)"
          />
        ))}

        {/* Rótulos X (Meses) e Colunas Interativas Invisíveis de Hover */}
        {chartData.map((d, i) => {
          const x = getX(i);
          return (
            <g key={d.month}>
              <text
                x={x}
                y={H - 10}
                textAnchor="middle"
                fontSize="11"
                fill={hoveredIdx === i ? "var(--ink)" : "var(--muted)"}
                fontWeight={hoveredIdx === i ? "700" : "500"}
              >
                {d.month}
              </text>
              {/* Área invisível de captura de hover */}
              <rect
                x={x - chartW / (chartData.length * 2)}
                y={padTop}
                width={chartW / chartData.length}
                height={chartH + padBottom}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          );
        })}

        {/* Linha vertical de foco no hover */}
        {hoveredIdx !== null && (
          <line
            x1={getX(hoveredIdx)}
            x2={getX(hoveredIdx)}
            y1={padTop}
            y2={padTop + chartH}
            stroke="var(--ink-secondary)"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            opacity="0.6"
          />
        )}
      </svg>

      {/* Tooltip Dinâmico ao passar o mouse */}
      {hoveredIdx !== null && (
        <div
          style={{
            position: "absolute",
            left: `${(getX(hoveredIdx) / W) * 100}%`,
            top: "8px",
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid var(--line-strong)",
            borderRadius: "8px",
            padding: "6px 12px",
            boxShadow: "var(--shadow-card)",
            fontSize: "11.5px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{chartData[hoveredIdx].month}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
            <span>Rebanho Real:</span>
            <strong>{chartData[hoveredIdx].actual} cab.</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#38bdf8" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38bdf8" }} />
            <span>Meta / Projeção:</span>
            <strong>{chartData[hoveredIdx].target} cab.</strong>
          </div>
        </div>
      )}
    </div>
  );
}
