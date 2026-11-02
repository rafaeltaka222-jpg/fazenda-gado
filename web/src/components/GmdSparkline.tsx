export default function GmdSparkline({
  width = 240,
  height = 42,
  color = "#10b981",
}: {
  width?: number | string;
  height?: number;
  color?: string;
}) {
  // Pontos de onda simulando a trajetória de ganho de peso contínuo
  const points = [
    { x: 0, y: 34 },
    { x: 30, y: 28 },
    { x: 60, y: 32 },
    { x: 90, y: 22 },
    { x: 120, y: 30 },
    { x: 150, y: 24 },
    { x: 180, y: 14 },
    { x: 210, y: 26 },
    { x: 240, y: 8 },
  ];

  // Gera curva Bézier suave
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    path += ` Q ${p1.x} ${p1.y}, ${midX} ${(p1.y + p2.y) / 2} T ${p2.x} ${p2.y}`;
  }

  const areaPath = `${path} L 240 ${height} L 0 ${height} Z`;

  return (
    <div style={{ width: "100%", height, overflow: "hidden" }}>
      <svg
        viewBox={`0 0 240 ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <linearGradient id="gmdSparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#gmdSparkGrad)" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
