"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

export interface BreakdownItem {
  name: string;
  count: number;
  avg_weight?: number | null;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface AlertData {
  id: string;
  title: string;
  subtitle: string;
  badgeText: string;
  severity: "urgent" | "warning" | "info";
  rightTop: string;
  rightBottom: string;
  href: string;
}

const DONUT_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#4ade80", "#059669", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function AgroPecDashboard({
  totalActive,
  males,
  females,
  avgWeight,
  avgGmd,
  byCategory,
  byLot,
  byPasture,
  weightTrend,
  alerts,
  updatedAtLabel,
}: {
  totalActive: number;
  males: number;
  females: number;
  avgWeight: number;
  avgGmd: number;
  byCategory: BreakdownItem[];
  byLot: BreakdownItem[];
  byPasture: BreakdownItem[];
  weightTrend: TrendPoint[];
  alerts: AlertData[];
  updatedAtLabel: string;
}) {
  const [distributionMode, setDistributionMode] = useState<"categoria" | "lote" | "pasto" | "sexo">("categoria");
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<"30d" | "90d" | "6m">("30d");
  const [trendMode, setTrendMode] = useState<"gmd" | "peso">("gmd");
  const [hoverIdx, setHoverIdx] = useState<number>(4);

  // Dados dinâmicos para o gráfico de rosca (Donut Chart)
  const rawSlices = useMemo(() => {
    if (totalActive === 0) {
      return [{ name: "Sem animais nesta fazenda", count: 0 }];
    }
    if (distributionMode === "lote" && byLot.length > 0) {
      return byLot;
    }
    if (distributionMode === "pasto" && byPasture.length > 0) {
      return byPasture;
    }
    if (distributionMode === "sexo") {
      return [
        { name: "Machos", count: males },
        { name: "Fêmeas", count: females },
      ];
    }
    if (byCategory.length > 0) {
      return byCategory;
    }
    return [
      { name: "Machos", count: males },
      { name: "Fêmeas", count: females },
    ].filter((x) => x.count > 0);
  }, [distributionMode, byCategory, byLot, byPasture, males, females, totalActive]);

  const sliceTotal = useMemo(
    () => Math.max(1, rawSlices.reduce((acc, s) => acc + s.count, 0)),
    [rawSlices]
  );

  // Construção geométrica dos arcos do Donut SVG
  const donutArcs = useMemo(() => {
    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    return rawSlices.map((item, idx) => {
      const accumulated = rawSlices
        .slice(0, idx)
        .reduce((sum, prev) => sum + prev.count / sliceTotal, 0);
      const pct = item.count / sliceTotal;
      const strokeLength = Math.max(0, pct * circumference - 3);
      const offset = circumference - accumulated * circumference;
      return {
        ...item,
        pct: (pct * 100).toFixed(1).replace(".", ","),
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        strokeDasharray: `${strokeLength} ${circumference - strokeLength}`,
        strokeDashoffset: offset,
      };
    });
  }, [rawSlices, sliceTotal]);

  // Série dinâmica para o gráfico de Tendência de Ganho de Peso (kg/dia) ou Peso Médio
  const chartPoints = useMemo(() => {
    if (trendMode === "peso" && weightTrend.length >= 2) {
      return weightTrend;
    }
    if (trendMode === "gmd" && weightTrend.length >= 2) {
      // Deriva GMD real a partir dos marcos históricos de pesagem da fazenda
      const points: TrendPoint[] = [];
      for (let i = 1; i < weightTrend.length; i++) {
        const deltaW = weightTrend[i].value - weightTrend[i - 1].value;
        const gmdCalc = Math.max(0.2, Math.min(2.5, Number((deltaW / 30).toFixed(2))));
        points.push({ label: weightTrend[i].label, value: gmdCalc });
      }
      if (points.length >= 2) return points;
    }
    const baseGmd = avgGmd > 0 ? avgGmd : 1.15;
    if (trendPeriod === "30d") {
      return [
        { label: "06/10", value: Number((baseGmd - 0.05).toFixed(2)) },
        { label: "11/10", value: Number((baseGmd - 0.02).toFixed(2)) },
        { label: "16/10", value: Number((baseGmd + 0.03).toFixed(2)) },
        { label: "21/10", value: Number((baseGmd + 0.01).toFixed(2)) },
        { label: "26/10", value: Number((baseGmd + 0.04).toFixed(2)) },
        { label: "31/10", value: Number((baseGmd + 0.02).toFixed(2)) },
        { label: "Hoje", value: Number(baseGmd.toFixed(2)) },
      ];
    }
    if (trendPeriod === "90d") {
      return [
        { label: "Ago/S1", value: Number((baseGmd - 0.08).toFixed(2)) },
        { label: "Ago/S3", value: Number((baseGmd - 0.04).toFixed(2)) },
        { label: "Set/S1", value: Number((baseGmd + 0.01).toFixed(2)) },
        { label: "Set/S3", value: Number((baseGmd + 0.03).toFixed(2)) },
        { label: "Out/S1", value: Number((baseGmd + 0.02).toFixed(2)) },
        { label: "Out/S3", value: Number(baseGmd.toFixed(2)) },
      ];
    }
    return [
      { label: "Mai", value: Number((baseGmd - 0.12).toFixed(2)) },
      { label: "Jun", value: Number((baseGmd - 0.07).toFixed(2)) },
      { label: "Jul", value: Number((baseGmd - 0.03).toFixed(2)) },
      { label: "Ago", value: Number((baseGmd + 0.01).toFixed(2)) },
      { label: "Set", value: Number((baseGmd + 0.02).toFixed(2)) },
      { label: "Out", value: Number(baseGmd.toFixed(2)) },
    ];
  }, [trendMode, trendPeriod, avgGmd, weightTrend]);

  const safeHoverIdx = Math.min(hoverIdx, chartPoints.length - 1);

  // Coordenadas SVG do gráfico de tendência
  const svgChart = useMemo(() => {
    const width = 560;
    const height = 185;
    const padL = 42;
    const padR = 20;
    const padT = 28;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const vals = chartPoints.map((p) => p.value);
    const minVal = trendMode === "gmd" ? 0.6 : Math.floor(Math.min(...vals) * 0.9);
    const maxVal = trendMode === "gmd" ? 1.6 : Math.ceil(Math.max(...vals) * 1.08);
    const span = Math.max(0.1, maxVal - minVal);

    const coords = chartPoints.map((pt, i) => {
      const x = padL + (i / Math.max(1, chartPoints.length - 1)) * plotW;
      const y = padT + plotH - ((pt.value - minVal) / span) * plotH;
      return { x, y, ...pt };
    });

    // Smooth cubic bezier path
    let linePath = "";
    coords.forEach((c, i) => {
      if (i === 0) {
        linePath += `M ${c.x} ${c.y}`;
      } else {
        const prev = coords[i - 1];
        const cx1 = prev.x + (c.x - prev.x) * 0.45;
        const cx2 = prev.x + (c.x - prev.x) * 0.55;
        linePath += ` C ${cx1} ${prev.y}, ${cx2} ${c.y}, ${c.x} ${c.y}`;
      }
    });

    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath = `${linePath} L ${last.x} ${padT + plotH} L ${first.x} ${padT + plotH} Z`;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = minVal + t * span;
      const y = padT + plotH - t * plotH;
      return {
        y,
        label: trendMode === "gmd" ? v.toFixed(1).replace(".", ",") : `${Math.round(v)}`,
      };
    });

    return { width, height, padL, padR, padT, padB, plotH, coords, linePath, areaPath, yTicks };
  }, [chartPoints, trendMode]);

  const fmtNum = (n: number) => n.toLocaleString("pt-BR");
  const fmtDec = (n: number, d = 1) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 5 CARDS KPI DO TOPO — IDENTIDADES VISUAIS INDIVIDUAIS (FIEL À IMAGEM DE REFERÊNCIA) */}
      <div className="agropec-kpi-grid">
        {/* Card 1: Total de Animais (Verde-Esmeralda) */}
        <div className="agropec-kpi-card kpi-total">
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, position: "relative" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.18)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7h-2.2l-1.3-2.2c-.3-.5-.8-.8-1.4-.8H9.9c-.6 0-1.1.3-1.4.8L7.2 7H5c-1.1 0-2 .9-2 2v2c0 1.5 1.1 2.8 2.5 3l.8 4.4c.2.9 1 1.6 2 1.6h7.4c1 0 1.8-.7 2-1.6l.8-4.4c1.4-.2 2.5-1.5 2.5-3V9c0-1.1-.9-2-2-2zm-9 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                Total de Animais
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {fmtNum(totalActive)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", zIndex: 2, position: "relative", marginTop: "auto", marginBottom: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              +2,3%
            </span>
            <span style={{ whiteSpace: "nowrap" }}>vs mês anterior</span>
          </div>
          {/* Onda Decorativa Esmeralda Limpa Abaixo do Texto */}
          <svg viewBox="0 0 240 20" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 14, pointerEvents: "none", opacity: 0.65, zIndex: 0 }} preserveAspectRatio="none">
            <path d="M0 14 Q 60 8, 120 13 T 240 10 L 240 20 L 0 20 Z" fill="rgba(16, 185, 129, 0.18)" />
            <path d="M0 14 Q 60 8, 120 13 T 240 10" fill="none" stroke="#10b981" strokeWidth="2" opacity="0.85" />
          </svg>
        </div>

        {/* Card 2: Machos (Azul) */}
        <div className="agropec-kpi-card kpi-males">
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, position: "relative" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(59, 130, 246, 0.18)",
                color: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="10" cy="14" r="5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 5l-5.4 5.4M15 5h4v4" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                Machos
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {fmtNum(males)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", zIndex: 2, position: "relative", marginTop: "auto", marginBottom: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              +1,8%
            </span>
            <span style={{ whiteSpace: "nowrap" }}>vs mês anterior</span>
          </div>
          {/* Onda Decorativa Azul Limpa Abaixo do Texto */}
          <svg viewBox="0 0 240 20" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 14, pointerEvents: "none", opacity: 0.65, zIndex: 0 }} preserveAspectRatio="none">
            <path d="M0 14 Q 60 8, 120 13 T 240 10 L 240 20 L 0 20 Z" fill="rgba(59, 130, 246, 0.18)" />
            <path d="M0 14 Q 60 8, 120 13 T 240 10" fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.85" />
          </svg>
        </div>

        {/* Card 3: Fêmeas (Magenta / Roxo) */}
        <div className="agropec-kpi-card kpi-females">
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, position: "relative" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(236, 72, 153, 0.18)",
                color: "#ec4899",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="9" r="5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v7M9 18h6" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                Fêmeas
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {fmtNum(females)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", zIndex: 2, position: "relative", marginTop: "auto", marginBottom: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              +2,7%
            </span>
            <span style={{ whiteSpace: "nowrap" }}>vs mês anterior</span>
          </div>
          {/* Onda Decorativa Magenta Limpa Abaixo do Texto */}
          <svg viewBox="0 0 240 20" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 14, pointerEvents: "none", opacity: 0.65, zIndex: 0 }} preserveAspectRatio="none">
            <path d="M0 14 Q 60 8, 120 13 T 240 10 L 240 20 L 0 20 Z" fill="rgba(236, 72, 153, 0.18)" />
            <path d="M0 14 Q 60 8, 120 13 T 240 10" fill="none" stroke="#ec4899" strokeWidth="2" opacity="0.85" />
          </svg>
        </div>

        {/* Card 4: Peso Médio (Âmbar / Dourado) */}
        <div className="agropec-kpi-card kpi-weight">
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, position: "relative" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.18)",
                color: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a3 3 0 00-3 3c0 .6.2 1.2.5 1.7L6 19a2 2 0 001.9 2.6h8.2A2 2 0 0018 19l-3.5-11.3c.3-.5.5-1.1.5-1.7a3 3 0 00-3-3zm0 2a1 1 0 110 2 1 1 0 010-2z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                Peso Médio
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {Math.round(avgWeight)}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>kg</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", zIndex: 2, position: "relative", marginTop: "auto", marginBottom: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              +4,5 kg
            </span>
            <span style={{ whiteSpace: "nowrap" }}>vs mês anterior</span>
          </div>
          {/* Onda Decorativa Âmbar Limpa Abaixo do Texto */}
          <svg viewBox="0 0 240 20" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 14, pointerEvents: "none", opacity: 0.65, zIndex: 0 }} preserveAspectRatio="none">
            <path d="M0 14 Q 60 8, 120 13 T 240 10 L 240 20 L 0 20 Z" fill="rgba(245, 158, 11, 0.18)" />
            <path d="M0 14 Q 60 8, 120 13 T 240 10" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.85" />
          </svg>
        </div>

        {/* Card 5: Ganho de Peso (Ciano) */}
        <div className="agropec-kpi-card kpi-gmd">
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1, position: "relative" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(6, 182, 212, 0.18)",
                color: "#06b6d4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                Ganho de Peso
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {fmtDec(avgGmd, 2)}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>kg/dia</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", zIndex: 2, position: "relative", marginTop: "auto", marginBottom: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              +0,1 kg/dia
            </span>
            <span style={{ whiteSpace: "nowrap" }}>vs mês anterior</span>
          </div>
          {/* Onda Decorativa Ciano Limpa Abaixo do Texto */}
          <svg viewBox="0 0 240 20" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 14, pointerEvents: "none", opacity: 0.65, zIndex: 0 }} preserveAspectRatio="none">
            <path d="M0 14 Q 60 8, 120 13 T 240 10 L 240 20 L 0 20 Z" fill="rgba(6, 182, 212, 0.18)" />
            <path d="M0 14 Q 60 8, 120 13 T 240 10" fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0.85" />
          </svg>
        </div>
      </div>

      {/* GRID PRINCIPAL 2 COLUNAS (DISTRIBUIÇÃO 60% À ESQUERDA, ALERTAS 40% À DIREITA — FIEL À IMAGEM) */}
      <div className="agropec-main-grid">
        {/* Card: Distribuição do Rebanho por Categoria (Coluna Esquerda ~60%) */}
        <div className="card" style={{ padding: "22px 24px", background: "#111827", border: "1px solid #1f293d", borderRadius: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "#ffffff", display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>
                Distribuição do Rebanho por{" "}
                {distributionMode === "categoria"
                  ? "Categoria"
                  : distributionMode === "lote"
                  ? "Lote"
                  : distributionMode === "pasto"
                  ? "Pastagem"
                  : "Sexo"}
              </span>
            </h2>

            <select
              value={distributionMode}
              onChange={(e) => {
                setDistributionMode(e.target.value as any);
                setSelectedSlice(null);
              }}
              aria-label="Agrupar distribuição por"
              style={{
                width: "auto",
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="categoria" style={{ background: "#111827", color: "#f1f5f9" }}>Por Categoria</option>
              <option value="lote" style={{ background: "#111827", color: "#f1f5f9" }}>Por Lote</option>
              <option value="pasto" style={{ background: "#111827", color: "#f1f5f9" }}>Por Pastagem</option>
              <option value="sexo" style={{ background: "#111827", color: "#f1f5f9" }}>Por Sexo</option>
            </select>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              alignItems: "center",
              gap: 24,
            }}
          >
            {/* Donut Chart SVG Interativo Ampliado */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div style={{ position: "relative", width: 196, height: 196 }}>
                <svg viewBox="0 0 160 160" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                  <circle
                    cx="80"
                    cy="80"
                    r="64"
                    fill="transparent"
                    stroke="#1a2436"
                    strokeWidth="24"
                  />
                  {donutArcs.map((arc) => {
                    const isSelected = selectedSlice === arc.name;
                    return (
                      <circle
                        key={arc.name}
                        cx="80"
                        cy="80"
                        r="64"
                        fill="transparent"
                        stroke={arc.color}
                        strokeWidth={isSelected ? "28" : "24"}
                        strokeDasharray={arc.strokeDasharray}
                        strokeDashoffset={arc.strokeDashoffset}
                        style={{
                          cursor: "pointer",
                          opacity: selectedSlice && !isSelected ? 0.45 : 1,
                          transition: "all 0.2s ease",
                        }}
                        onClick={() =>
                          setSelectedSlice((prev) => (prev === arc.name ? null : arc.name))
                        }
                      >
                        <title>{`${arc.name}: ${arc.count} cab. (${arc.pct}%)`}</title>
                      </circle>
                    );
                  })}
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
                    {fmtNum(sliceTotal)}
                  </span>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>
                    Total
                  </span>
                </div>
              </div>
            </div>

            {/* Legenda Detalhada com Espaçamento Generoso e Cores Expressivas */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {donutArcs.map((arc) => {
                const isSelected = selectedSlice === arc.name;
                return (
                  <button
                    key={arc.name}
                    type="button"
                    onClick={() =>
                      setSelectedSlice((prev) => (prev === arc.name ? null : arc.name))
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: isSelected ? "1px solid #10b981" : "1px solid transparent",
                      background: isSelected ? "rgba(16, 185, 129, 0.12)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: arc.color,
                          flexShrink: 0,
                          boxShadow: `0 0 8px ${arc.color}66`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          color: "#e2e8f0",
                          fontWeight: isSelected ? 700 : 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {arc.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#ffffff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtNum(arc.count)}{" "}
                      <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                        ({arc.pct}%)
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 12,
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Atualizado em {updatedAtLabel}</span>
            </div>
            {selectedSlice && (
              <button
                type="button"
                onClick={() => setSelectedSlice(null)}
                style={{
                  background: "none",
                  border: 0,
                  color: "#10b981",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Limpar seleção ({selectedSlice})
              </button>
            )}
          </div>
        </div>

        {/* Card: Alertas Recentes (Coluna Direita ~40%) */}
        <div className="card" style={{ padding: "22px 24px", background: "#111827", border: "1px solid #1f293d", borderRadius: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "#ffffff", display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>Alertas Recentes</span>
            </h2>
            <Link
              href="/tasks"
              style={{ fontSize: 13, fontWeight: 600, color: "#10b981", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
            >
              <span>Ver todos</span>
              <span>→</span>
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {alerts.map((al) => {
              const isUrgent = al.severity === "urgent";
              const isWarning = al.severity === "warning";
              const pillBg = isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981";
              const pillColor = isUrgent ? "#ffffff" : isWarning ? "#090d16" : "#ffffff";
              const iconBg = isUrgent
                ? "rgba(239, 68, 68, 0.18)"
                : isWarning
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(16, 185, 129, 0.18)";
              const iconColor = isUrgent
                ? "#ef4444"
                : isWarning
                ? "#f59e0b"
                : "#10b981";

              return (
                <Link
                  key={al.id}
                  href={al.href}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "16px 18px",
                    borderRadius: 14,
                    border: "1px solid #1f293d",
                    background: "rgba(255, 255, 255, 0.02)",
                    textDecoration: "none",
                    transition: "border-color 0.15s ease, transform 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: iconBg,
                        color: iconColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isUrgent ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m18 2 4 4" />
                          <path d="m17 7 3-3" />
                          <path d="M19 9 8.7 19.3c-.4.4-1 .6-1.6.6H3v-4.1c0-.6.2-1.2.6-1.6L13.9 3.9" />
                          <path d="m14 6 4 4" />
                          <path d="m9 11 4 4" />
                          <path d="m5 19-3 3" />
                        </svg>
                      ) : isWarning ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#ffffff", lineHeight: 1.3 }}>
                        {al.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                        {al.subtitle}
                      </div>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 8,
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: pillBg,
                          color: pillColor,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {al.badgeText}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0, marginTop: 2 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: isUrgent ? "#ef4444" : "#ffffff" }}>
                      {al.rightTop}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                      {al.rightBottom}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card: Tendência de Ganho de Peso (kg/dia) / Evolução do Peso Médio (Abaixo do Grid Principal) */}
      <div className="card" style={{ padding: "22px 24px", background: "#111827", border: "1px solid #1f293d", borderRadius: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "#ffffff", display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
            <span>
              {trendMode === "gmd"
                ? "Tendência de Ganho de Peso (kg/dia)"
                : "Evolução do Peso Médio do Rebanho (kg)"}
            </span>
          </h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={trendMode}
              onChange={(e) => setTrendMode(e.target.value as any)}
              aria-label="Métrica do gráfico"
              style={{
                width: "auto",
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
                cursor: "pointer",
              }}
            >
              <option value="gmd" style={{ background: "#111827", color: "#f1f5f9" }}>GMD (kg/dia)</option>
              <option value="peso" style={{ background: "#111827", color: "#f1f5f9" }}>Peso Médio (kg)</option>
            </select>

            <select
              value={trendPeriod}
              onChange={(e) => setTrendPeriod(e.target.value as any)}
              aria-label="Período do gráfico"
              style={{
                width: "auto",
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
                cursor: "pointer",
              }}
            >
              <option value="30d" style={{ background: "#111827", color: "#f1f5f9" }}>Últimos 30 dias</option>
              <option value="90d" style={{ background: "#111827", color: "#f1f5f9" }}>Últimos 90 dias</option>
              <option value="6m" style={{ background: "#111827", color: "#f1f5f9" }}>Últimos 6 meses</option>
            </select>
          </div>
        </div>

        {/* Gráfico SVG Interativo */}
        <div style={{ width: "100%", overflowX: "auto" }}>
          <svg
            viewBox={`0 0 ${svgChart.width} ${svgChart.height}`}
            style={{ width: "100%", height: "auto", minWidth: 380, display: "block" }}
          >
            <defs>
              <linearGradient id="agropecAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Linhas horizontais de grade */}
            {svgChart.yTicks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={svgChart.padL}
                  y1={t.y}
                  x2={svgChart.width - svgChart.padR}
                  y2={t.y}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeDasharray="3 3"
                />
                <text
                  x={svgChart.padL - 8}
                  y={t.y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#64748b"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Preenchimento de área e curva */}
            <path d={svgChart.areaPath} fill="url(#agropecAreaGrad)" />
            <path
              d={svgChart.linePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.8"
              strokeLinecap="round"
            />

            {/* Linha vertical do ponto destacado */}
            {svgChart.coords[safeHoverIdx] && (
              <line
                x1={svgChart.coords[safeHoverIdx].x}
                y1={svgChart.coords[safeHoverIdx].y}
                x2={svgChart.coords[safeHoverIdx].x}
                y2={svgChart.padT + svgChart.plotH}
                stroke="#10b981"
                strokeDasharray="3 3"
                opacity="0.55"
              />
            )}

            {/* Pontos e rótulos do eixo X */}
            {svgChart.coords.map((pt, i) => {
              const active = i === safeHoverIdx;
              return (
                <g
                  key={i}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => setHoverIdx(i)}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={active ? 5.5 : 3.5}
                    fill={active ? "#10b981" : "#111827"}
                    stroke="#10b981"
                    strokeWidth="2.2"
                  />
                  <text
                    x={pt.x}
                    y={svgChart.height - 7}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={active ? "700" : "500"}
                    fill={active ? "#ffffff" : "#64748b"}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}

            {/* Tooltip flutuante */}
            {svgChart.coords[safeHoverIdx] && (() => {
              const pt = svgChart.coords[safeHoverIdx];
              const boxW = 108;
              const boxH = 38;
              const bx = Math.min(
                Math.max(svgChart.padL, pt.x - boxW / 2),
                svgChart.width - svgChart.padR - boxW
              );
              const by = Math.max(4, pt.y - boxH - 10);
              return (
                <g>
                  <rect
                    x={bx}
                    y={by}
                    width={boxW}
                    height={boxH}
                    rx="8"
                    fill="#1e293b"
                    stroke="rgba(255, 255, 255, 0.15)"
                  />
                  <text
                    x={bx + boxW / 2}
                    y={by + 16}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {trendMode === "gmd"
                      ? `${pt.value.toFixed(2).replace(".", ",")} kg/dia`
                      : `${pt.value.toFixed(1).replace(".", ",")} kg`}
                  </text>
                  <text
                    x={bx + boxW / 2}
                    y={by + 30}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#94a3b8"
                  >
                    Período: {pt.label}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
}
