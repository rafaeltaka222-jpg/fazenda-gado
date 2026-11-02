export default function SanitaryRingGauge({
  percentage = 98,
  size = 64,
  strokeWidth = 5.5,
}: {
  percentage?: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPct = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (validPct / 100) * circumference;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Anel de fundo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={strokeWidth}
          opacity="0.35"
        />
        {/* Anel de progresso verde */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {/* Texto central */}
      <span
        style={{
          position: "absolute",
          fontSize: size <= 64 ? "12px" : "14px",
          fontWeight: 700,
          color: "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {validPct}%
      </span>
    </div>
  );
}
