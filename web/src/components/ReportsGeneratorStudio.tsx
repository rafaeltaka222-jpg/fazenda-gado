"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

export interface ReportAnimalRow {
  id: string;
  tag: string;
  name: string | null;
  category: string;
  breed: string;
  sex: string;
  birth_date: string | null;
  entry_date: string | null;
  weight_kg: number | null;
  status: string;
  lot: string;
  pasture: string;
  mother_tag: string | null;
}

export interface ReportWeighingRow {
  id: string;
  tag: string;
  weighed_on: string;
  weight_kg: number;
  delta_kg: number | null;
  gmd: number | null;
  category: string;
  lot: string;
  status: string;
}

export interface ReportMovementRow {
  id: string;
  tag: string;
  occurred_on: string;
  event_type: string;
  origin: string;
  destination: string;
  notes: string;
  status: string;
}

interface SavedQueryItem {
  id: string;
  name: string;
  shared: boolean;
  created_by: string;
}

interface ReportsGeneratorStudioProps {
  farmName: string;
  animals: ReportAnimalRow[];
  weighings: ReportWeighingRow[];
  movements: ReportMovementRow[];
  savedQueries: SavedQueryItem[];
  categories: string[];
  canBuild: boolean;
}

type DataSourceKey = "animais" | "pesagens" | "movimentacoes";

interface ColumnDef {
  key: string;
  label: string;
}

const ANIMAL_COLUMNS: ColumnDef[] = [
  { key: "tag", label: "Brinco / Identificação" },
  { key: "birth_date", label: "Data de Nascimento" },
  { key: "category", label: "Categoria" },
  { key: "weight_kg", label: "Peso Atual (kg)" },
  { key: "breed", label: "Raça" },
  { key: "status", label: "Status" },
  { key: "sex", label: "Sexo" },
  { key: "mother_tag", label: "Mãe" },
  { key: "lot", label: "Lote / Pasto" },
  { key: "entry_date", label: "Data de Entrada" },
];

const WEIGHING_COLUMNS: ColumnDef[] = [
  { key: "tag", label: "Brinco / Identificação" },
  { key: "weighed_on", label: "Data da Pesagem" },
  { key: "weight_kg", label: "Peso Atual (kg)" },
  { key: "delta_kg", label: "Ganho (kg)" },
  { key: "gmd", label: "GMD (kg/dia)" },
  { key: "category", label: "Categoria" },
  { key: "lot", label: "Lote" },
  { key: "status", label: "Status" },
];

const MOVEMENT_COLUMNS: ColumnDef[] = [
  { key: "tag", label: "Brinco / Identificação" },
  { key: "occurred_on", label: "Data do Evento" },
  { key: "event_type", label: "Tipo de Movimentação" },
  { key: "origin", label: "Origem" },
  { key: "destination", label: "Destino" },
  { key: "notes", label: "Observação" },
  { key: "status", label: "Status" },
];

const PRESET_QUERIES = [
  {
    id: "preset-geral",
    title: "Relatório Geral do Rebanho",
    subtitle: "Animais • Todos os campos principais",
    dateLabel: "Criado em 20/05/2024",
    source: "animais" as DataSourceKey,
    cols: ["tag", "category", "breed", "sex", "birth_date", "weight_kg", "status"],
    statusFilter: "ativo",
    categoryFilter: "todos",
    groupBy: "none",
  },
  {
    id: "preset-pesagem-cat",
    title: "Pesagem por Categoria",
    subtitle: "Pesagens • Agrupado por Categoria",
    dateLabel: "Criado em 18/05/2024",
    source: "pesagens" as DataSourceKey,
    cols: ["tag", "weighed_on", "category", "weight_kg", "delta_kg", "gmd", "status"],
    statusFilter: "todos",
    categoryFilter: "todos",
    groupBy: "category",
  },
  {
    id: "preset-mov-mes",
    title: "Movimentações do Mês",
    subtitle: "Movimentações • Histórico auditado",
    dateLabel: "Criado em 15/05/2024",
    source: "movimentacoes" as DataSourceKey,
    cols: ["tag", "occurred_on", "event_type", "origin", "destination", "status"],
    statusFilter: "todos",
    categoryFilter: "todos",
    groupBy: "none",
  },
  {
    id: "preset-lote",
    title: "Animais por Lote",
    subtitle: "Animais • Agrupado por Lote",
    dateLabel: "Criado em 10/05/2024",
    source: "animais" as DataSourceKey,
    cols: ["tag", "lot", "category", "breed", "sex", "weight_kg", "status"],
    statusFilter: "ativo",
    categoryFilter: "todos",
    groupBy: "lot",
  },
  {
    id: "preset-matrizes",
    title: "Vacas em Lactação",
    subtitle: "Animais • Status: Ativo",
    dateLabel: "Criado em 08/05/2024",
    source: "animais" as DataSourceKey,
    cols: ["tag", "category", "breed", "birth_date", "weight_kg", "lot", "status"],
    statusFilter: "ativo",
    categoryFilter: "Vaca",
    groupBy: "none",
  },
];

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const parts = d.slice(0, 10).split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function ReportsGeneratorStudio({
  farmName,
  animals,
  weighings,
  movements,
  savedQueries,
  categories,
  canBuild,
}: ReportsGeneratorStudioProps) {
  const [source, setSource] = useState<DataSourceKey>("animais");
  const [selectedCols, setSelectedCols] = useState<string[]>([
    "tag",
    "category",
    "breed",
    "sex",
    "birth_date",
    "weight_kg",
    "status",
  ]);
  const [statusFilter, setStatusFilter] = useState<string>("ativo");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [showSum, setShowSum] = useState<boolean>(true);
  const [showAvg, setShowAvg] = useState<boolean>(true);
  const [activePresetId, setActivePresetId] = useState<string>("preset-geral");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortCol, setSortCol] = useState<string>("tag");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  const availableColumns = useMemo(() => {
    if (source === "pesagens") return WEIGHING_COLUMNS;
    if (source === "movimentacoes") return MOVEMENT_COLUMNS;
    return ANIMAL_COLUMNS;
  }, [source]);

  const handleSourceChange = (nextSource: DataSourceKey) => {
    setSource(nextSource);
    setPage(1);
    if (nextSource === "animais") {
      setSelectedCols(["tag", "category", "breed", "sex", "birth_date", "weight_kg", "status"]);
    } else if (nextSource === "pesagens") {
      setSelectedCols(["tag", "weighed_on", "category", "weight_kg", "delta_kg", "gmd", "status"]);
    } else {
      setSelectedCols(["tag", "occurred_on", "event_type", "origin", "destination", "status"]);
    }
  };

  const toggleColumn = (key: string) => {
    setSelectedCols((prev) =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter((k) => k !== key) : prev) : [...prev, key]
    );
  };

  const selectAllColumns = () => {
    setSelectedCols(availableColumns.map((c) => c.key));
  };

  const applyPreset = (p: (typeof PRESET_QUERIES)[number]) => {
    setActivePresetId(p.id);
    setSource(p.source);
    setSelectedCols(p.cols);
    setStatusFilter(p.statusFilter);
    setCategoryFilter(p.categoryFilter);
    setGroupBy(p.groupBy);
    setPage(1);
  };

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let list: Record<string, any>[] = [];

    if (source === "animais") {
      list = animals.filter((a) => {
        if (statusFilter !== "todos" && a.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
        if (
          categoryFilter !== "todos" &&
          !a.category.toLowerCase().includes(categoryFilter.toLowerCase())
        ) {
          return false;
        }
        if (a.birth_date) {
          if (dateFrom && a.birth_date < dateFrom) return false;
          if (dateTo && a.birth_date > dateTo) return false;
        }
        return true;
      });
    } else if (source === "pesagens") {
      list = weighings.filter((w) => {
        if (
          categoryFilter !== "todos" &&
          !w.category.toLowerCase().includes(categoryFilter.toLowerCase())
        ) {
          return false;
        }
        if (w.weighed_on) {
          if (dateFrom && w.weighed_on < dateFrom) return false;
          if (dateTo && w.weighed_on > dateTo) return false;
        }
        return true;
      });
    } else {
      list = movements.filter((m) => {
        if (m.occurred_on) {
          if (dateFrom && m.occurred_on < dateFrom) return false;
          if (dateTo && m.occurred_on > dateTo) return false;
        }
        return true;
      });
    }

    // Grouping or sorting
    const effectiveSort = groupBy !== "none" ? groupBy : sortCol;
    return [...list].sort((x, y) => {
      const vx = x[effectiveSort] ?? "";
      const vy = y[effectiveSort] ?? "";
      if (typeof vx === "number" && typeof vy === "number") {
        return sortAsc ? vx - vy : vy - vx;
      }
      return sortAsc
        ? String(vx).localeCompare(String(vy), "pt-BR", { numeric: true })
        : String(vy).localeCompare(String(vx), "pt-BR", { numeric: true });
    });
  }, [source, animals, weighings, movements, statusFilter, categoryFilter, dateFrom, dateTo, groupBy, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Totals calculation
  const { totalWeight, avgWeight } = useMemo(() => {
    const weights = filteredRows
      .map((r) => Number(r.weight_kg ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const sum = weights.reduce((acc, v) => acc + v, 0);
    const avg = weights.length > 0 ? sum / weights.length : 0;
    return { totalWeight: sum, avgWeight: avg };
  }, [filteredRows]);

  const activeColumnDefs = useMemo(
    () => availableColumns.filter((c) => selectedCols.includes(c.key)),
    [availableColumns, selectedCols]
  );

  const handleSort = (key: string) => {
    if (sortCol === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(key);
      setSortAsc(true);
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    const headers = activeColumnDefs.map((c) => `"${c.label}"`).join(";");
    const lines = filteredRows.map((row) =>
      activeColumnDefs
        .map((c) => {
          const val = row[c.key];
          if (c.key === "birth_date" || c.key === "entry_date" || c.key === "weighed_on" || c.key === "occurred_on") {
            return `"${fmtDate(val)}"`;
          }
          if (typeof val === "number") {
            return `"${val.toFixed(1).replace(".", ",")}"`;
          }
          return `"${String(val ?? "—").replace(/"/g, '""')}"`;
        })
        .join(";")
    );
    const csvContent = "\uFEFF" + [headers, ...lines].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const ths = activeColumnDefs
      .map(
        (c) =>
          `<th style="background:#235c2a;color:#ffffff;padding:8px 12px;border:1px solid #d5ddd5;text-align:left;">${c.label}</th>`
      )
      .join("");
    const trs = filteredRows
      .map((row) => {
        const tds = activeColumnDefs
          .map((c) => {
            const val = row[c.key];
            let formatted = val ?? "—";
            if (c.key === "birth_date" || c.key === "entry_date" || c.key === "weighed_on" || c.key === "occurred_on") {
              formatted = fmtDate(val);
            } else if (typeof val === "number") {
              formatted = val.toFixed(1).replace(".", ",");
            }
            return `<td style="padding:6px 12px;border:1px solid #e2e8e2;">${formatted}</td>`;
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"></head>
      <body>
        <h2>Relatório Corporativo — ${farmName}</h2>
        <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      </body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${source}-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const filteredPresets = PRESET_QUERIES.filter(
    (p) =>
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Top Header matching Image 5 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              Gerador de Relatórios e Tabelas Personalizadas
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
              Crie relatórios sob medida para sua operação pecuária com exportação em múltiplos formatos
            </p>
          </div>
        </div>

        {/* 3 Export Buttons matching Image 5 */}
        <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleExportPDF}
            className="btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
            Exportar PDF
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Exportar Excel
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="btn ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              background: "var(--surface)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 4v16M16 4v16" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* 3-Column Studio Grid matching Image 5 */}
      <div className="reports-studio-grid">
        {/* LEFT COLUMN: Configuration Panel (Steps 1 to 5) */}
        <div className="card no-print" style={{ padding: 18, marginBottom: 0 }}>
          {/* 1. Fonte de Dados */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14.5 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
              </svg>
              1. Fonte de Dados
            </div>
            <p className="muted" style={{ margin: "2px 0 10px", fontSize: 12 }}>
              Selecione a origem dos dados para o relatório.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  key: "animais" as DataSourceKey,
                  title: "Animais",
                  desc: "Cadastro completo dos animais do rebanho.",
                },
                {
                  key: "pesagens" as DataSourceKey,
                  title: "Pesagens",
                  desc: "Registros de pesagem e ganho de peso.",
                },
                {
                  key: "movimentacoes" as DataSourceKey,
                  title: "Movimentações",
                  desc: "Entradas, saídas e transferências de animais.",
                },
              ].map((item) => {
                const active = source === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSourceChange(item.key)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: active ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                      background: active ? "var(--brand-light)" : "var(--surface)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: active ? "none" : "1.5px solid var(--muted)",
                        background: active ? "var(--brand)" : "transparent",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        marginTop: 2,
                        flexShrink: 0,
                      }}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{item.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Campos (Colunas) */}
          <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)", marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                2. Campos (Colunas)
              </div>
              <button
                type="button"
                onClick={selectAllColumns}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Selecionar todos
              </button>
            </div>
            <p className="muted" style={{ margin: "2px 0 10px", fontSize: 11.5 }}>
              Marque os campos que deseja incluir no relatório.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
              {availableColumns.map((col) => {
                const checked = selectedCols.includes(col.key);
                return (
                  <label
                    key={col.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: checked ? 600 : 500,
                      color: "var(--ink)",
                      cursor: "pointer",
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col.key)}
                      style={{
                        width: 15,
                        height: 15,
                        accentColor: "var(--brand)",
                        cursor: "pointer",
                        margin: 0,
                      }}
                    />
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {col.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Filtros */}
          <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              3. Filtros
            </div>
            <p className="muted" style={{ margin: "2px 0 10px", fontSize: 11.5 }}>
              Defina os critérios para filtrar os dados.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 11.5, margin: 0 }}>
                Status
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ padding: "6px 8px", fontSize: 12.5, marginTop: 3 }}
                >
                  <option value="ativo">Ativo</option>
                  <option value="todos">Todos</option>
                  <option value="vendido">Vendido</option>
                  <option value="baixado">Baixado</option>
                </select>
              </label>

              <label style={{ fontSize: 11.5, margin: 0 }}>
                Categoria
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ padding: "6px 8px", fontSize: 12.5, marginTop: 3 }}
                >
                  <option value="todos">Todos</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ fontSize: 11.5, margin: 0 }}>
                Data Inicial (De)
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  style={{ padding: "6px 8px", fontSize: 12, marginTop: 3 }}
                />
              </label>
              <label style={{ fontSize: 11.5, margin: 0 }}>
                Até
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  style={{ padding: "6px 8px", fontSize: 12, marginTop: 3 }}
                />
              </label>
            </div>
          </div>

          {/* 4. Agrupamento */}
          <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              4. Agrupamento
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>
                Agrupe os dados para organizar o relatório.
              </span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                style={{ width: "auto", minWidth: 145, padding: "6px 8px", fontSize: 12 }}
              >
                <option value="none">Nenhum agrupamento</option>
                <option value="category">Por Categoria</option>
                <option value="breed">Por Raça</option>
                <option value="lot">Por Lote</option>
                <option value="sex">Por Sexo</option>
              </select>
            </div>
          </div>

          {/* 5. Totais e Resumos */}
          <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>5. Totais e Resumos</div>
            <p className="muted" style={{ margin: "2px 0 10px", fontSize: 11.5 }}>
              Configure totais e cálculos para campos numéricos.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowSum(!showSum)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: showSum ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                  background: showSum ? "var(--brand-light)" : "var(--surface)",
                  color: showSum ? "var(--brand)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                Soma (Peso Atual) {showSum ? "✓" : ""}
              </button>
              <button
                type="button"
                onClick={() => setShowAvg(!showAvg)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: showAvg ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                  background: showAvg ? "var(--brand-light)" : "var(--surface)",
                  color: showAvg ? "var(--brand)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                Média (Peso Atual) {showAvg ? "✓" : ""}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Live Report Preview Table + Summary Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 20, marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--ink)" }}>
                  Pré-visualização do Relatório
                </h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <span
                className="badge"
                style={{
                  padding: "5px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  borderRadius: 999,
                }}
              >
                {filteredRows.length} registros encontrados
              </span>
            </div>

            <div className="table-container" style={{ borderRadius: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    {activeColumnDefs.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          cursor: "pointer",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          textTransform: "none",
                          fontWeight: 700,
                          color: "var(--ink-soft)",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {col.label}
                          <span style={{ fontSize: 10, opacity: sortCol === col.key ? 1 : 0.45 }}>
                            {sortCol === col.key ? (sortAsc ? "▲" : "▼") : "↕"}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={activeColumnDefs.length} style={{ textAlign: "center", padding: 28 }}>
                        <span className="muted">Nenhum registro encontrado para os filtros selecionados.</span>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, idx) => (
                      <tr key={row.id ?? idx}>
                        {activeColumnDefs.map((col) => {
                          const val = row[col.key];
                          if (col.key === "tag") {
                            return (
                              <td key={col.key} style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      background: "#235c2a",
                                      display: "inline-block",
                                    }}
                                  />
                                  <Link
                                    href={source === "animais" ? `/herd/${row.id}` : "/weighings"}
                                    style={{ color: "var(--ink)", textDecoration: "none" }}
                                  >
                                    {String(val).startsWith("BRC-") ? val : `BRC-${String(val).padStart(6, "0")}`}
                                  </Link>
                                </span>
                              </td>
                            );
                          }
                          if (col.key === "status") {
                            const isAtivo = String(val).toLowerCase() === "ativo" || String(val).toLowerCase() === "ok";
                            return (
                              <td key={col.key} style={{ whiteSpace: "nowrap" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontWeight: 700,
                                    fontSize: 12.5,
                                    color: isAtivo ? "var(--brand)" : "var(--amber)",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: isAtivo ? "var(--brand)" : "var(--amber)",
                                    }}
                                  />
                                  {String(val).charAt(0).toUpperCase() + String(val).slice(1)}
                                </span>
                              </td>
                            );
                          }
                          if (
                            col.key === "birth_date" ||
                            col.key === "entry_date" ||
                            col.key === "weighed_on" ||
                            col.key === "occurred_on"
                          ) {
                            return <td key={col.key}>{fmtDate(val)}</td>;
                          }
                          if (col.key === "weight_kg" || col.key === "delta_kg" || col.key === "gmd") {
                            return (
                              <td key={col.key} style={{ fontWeight: 600 }}>
                                {val != null
                                  ? Number(val).toLocaleString("pt-BR", {
                                      minimumFractionDigits: 1,
                                      maximumFractionDigits: 1,
                                    })
                                  : "—"}
                              </td>
                            );
                          }
                          return <td key={col.key}>{val ?? "—"}</td>;
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer matching Image 5 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <span className="muted" style={{ fontSize: 12.5 }}>
                Mostrando {filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} até{" "}
                {Math.min(currentPage * pageSize, filteredRows.length)} de {filteredRows.length} registros
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    opacity: currentPage <= 1 ? 0.5 : 1,
                  }}
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: currentPage === n ? "1px solid var(--brand)" : "1px solid var(--line)",
                      background: currentPage === n ? "var(--brand)" : "var(--surface)",
                      color: currentPage === n ? "#fff" : "var(--ink)",
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                    opacity: currentPage >= totalPages ? 0.5 : 1,
                  }}
                >
                  ›
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <span>ⓘ</span>
              <span>Os totais são calculados com base nos dados filtrados e colunas selecionadas.</span>
            </div>
          </div>

          {/* Summary Bar matching bottom of Image 5 */}
          {(showSum || showAvg) && (
            <div
              className="card"
              style={{
                padding: "14px 20px",
                marginBottom: 0,
                background: "var(--brand-light)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.4">
                  <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" />
                </svg>
                <span>Resumo:</span>
              </div>

              {showSum && (
                <div style={{ fontSize: 14, color: "var(--ink)" }}>
                  Soma do Peso Atual:{" "}
                  <strong>
                    {totalWeight.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    kg
                  </strong>
                </div>
              )}

              {showSum && showAvg && <span style={{ color: "var(--muted)" }}>|</span>}

              {showAvg && (
                <div style={{ fontSize: 14, color: "var(--ink)" }}>
                  Média do Peso Atual:{" "}
                  <strong>
                    {avgWeight.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    kg
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Consultas Salvas matching Image 5 */}
        <div className="card no-print" style={{ padding: 18, marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Consultas Salvas
          </div>
          <p className="muted" style={{ margin: "2px 0 12px", fontSize: 12 }}>
            Salve e acesse suas consultas personalizadas.
          </p>

          {/* Search Input */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="search"
              placeholder="Buscar consulta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 32px 8px 12px",
                fontSize: 12.5,
                borderRadius: 8,
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>

          {/* Preset Cards List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {filteredPresets.map((preset) => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: active ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                    background: active ? "var(--brand-light)" : "var(--surface)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--ink)",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--brand)" stroke="var(--brand)" strokeWidth="2">
                        <path d="M16 3l5 5-7 7-4 1 1-4 7-7z" />
                        <path d="M2 22l6-6" />
                      </svg>
                      {preset.title}
                    </span>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>⋮</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>{preset.subtitle}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, opacity: 0.85 }}>
                    {preset.dateLabel}
                  </div>
                </button>
              );
            })}

            {/* User's Saved Queries from DB */}
            {savedQueries.map((sq) => (
              <Link
                key={sq.id}
                href={`/reports/run?saved=${sq.id}`}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--brand)" }}>{sq.name}</span>
                  <span className="badge neutral" style={{ fontSize: 10 }}>
                    {sq.shared ? "Compartilhada" : "Privada"}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                  Consulta personalizada salva no banco
                </div>
              </Link>
            ))}
          </div>

          {canBuild && (
            <Link
              href="/reports/new"
              className="btn ghost"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                border: "1.5px solid var(--brand)",
                color: "var(--brand)",
              }}
            >
              + Nova Consulta
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
