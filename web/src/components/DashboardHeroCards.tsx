"use client";

import HerdSplineChart from "./HerdSplineChart";
import SanitaryRingGauge from "./SanitaryRingGauge";
import GmdSparkline from "./GmdSparkline";

interface HeroCardsProps {
  activeCount: number;
  malesCount: number;
  femalesCount: number;
  avgGmd?: number | null;
  healthAlertsCount?: number;
  iatfCount?: number;
  sanitaryPct?: number;
  nextManagementDate?: string;
  monthlyGrowthPct?: string;
}

export default function DashboardHeroCards({
  activeCount = 111,
  malesCount = 60,
  femalesCount = 51,
  avgGmd = 0.53,
  healthAlertsCount = 2,
  iatfCount = 8,
  sanitaryPct = 98,
  nextManagementDate = "15/Nov",
  monthlyGrowthPct = "+4.2%",
}: HeroCardsProps) {
  const total = malesCount + femalesCount || activeCount || 1;
  const malePct = Math.round((malesCount / total) * 100);
  const femalePct = 100 - malePct;

  const displayGmd =
    avgGmd != null && !isNaN(Number(avgGmd))
      ? Number(avgGmd) > 0
        ? `+${Number(avgGmd).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/dia`
        : `${Number(avgGmd).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/dia`
      : "+0,53 kg/dia";

  return (
    <div className="hero-dashboard-grid" style={{ marginBottom: 20 }}>
      {/* Card 1: Herói - Evolução do Rebanho Ativo */}
      <div className="card hero-chart-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Evolução do Rebanho Ativo
            </h2>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: "var(--ink)", lineHeight: 1 }}>
                {activeCount}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                cabeças na fazenda
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              color: "#10b981",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span>{monthlyGrowthPct} este mês</span>
          </div>
        </div>

        {/* Gráfico Spline Multi-Curvas Jan - Dez */}
        <div style={{ marginTop: 12 }}>
          <HerdSplineChart currentCount={activeCount} />
        </div>
      </div>

      {/* Grid Lateral de 4 Cards (2x2) */}
      <div className="hero-side-grid">
        {/* Card 2: Distribuição por Gênero */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 16px 0", color: "var(--ink)" }}>
            Distribuição por Gênero
          </h3>

          {/* Machos */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>{malesCount}</span>
                <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6, fontWeight: 500 }}>Machos</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{malePct}%</span>
            </div>
            <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  width: `${malePct}%`,
                  height: "100%",
                  background: "#10b981",
                  borderRadius: 999,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>

          {/* Fêmeas */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>{femalesCount}</span>
                <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6, fontWeight: 500 }}>Fêmeas</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{femalePct}%</span>
            </div>
            <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  width: `${femalePct}%`,
                  height: "100%",
                  background: "#06b6d4",
                  borderRadius: 999,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Controle Sanitário */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 14px 0", color: "var(--ink)" }}>
            Controle Sanitário
          </h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--ink)", lineHeight: 1 }}>
                {sanitaryPct}%
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
                Vacinação em Dia
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-light)", marginTop: 14, fontWeight: 500 }}>
                Próximo manejo: <strong style={{ color: "var(--ink-secondary)" }}>{nextManagementDate}</strong>
              </div>
            </div>
            <SanitaryRingGauge percentage={sanitaryPct} size={64} />
          </div>
        </div>

        {/* Card 4: Sanidade & IATF */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 14px 0", color: "var(--ink)" }}>
            Sanidade & IATF
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Alertas Críticos */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: "#f59e0b", lineHeight: 1 }}>
                  {healthAlertsCount}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Alertas Críticos</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Mortalidade/Tratamento</div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                Warning
              </span>
            </div>

            {/* IATF */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", lineHeight: 1 }}>
                {iatfCount}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  Reproduções Ativas (IATF)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Ganho Médio Diário (GMD) */}
        <div className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 8px 0", color: "var(--ink)" }}>
              Ganho Médio Diário (GMD)
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)" }}>
                {displayGmd}
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
              </svg>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <GmdSparkline height={38} color="#10b981" />
          </div>
        </div>
      </div>
    </div>
  );
}
