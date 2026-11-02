"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export interface FilterableAnimal {
  id: string;
  ear_tag: string;
  name?: string | null;
  sex: "macho" | "femea" | string;
  category: string;
  lot_name?: string | null;
  pasture_name?: string | null;
  current_weight?: number | null;
  avg_gmd?: number | null;
  status: string;
  in_withdrawal?: boolean;
  is_pregnant?: boolean;
  days_without_weight?: number;
}

interface FilterSuiteProps {
  animals: FilterableAnimal[];
  lots: string[];
  pastures: string[];
  categories: string[];
}

export default function DashboardFilterSuite({
  animals = [],
  lots = [],
  pastures = [],
  categories = [],
}: FilterSuiteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<string>("ano");
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [selectedPasture, setSelectedPasture] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSex, setSelectedSex] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Filtros aplicados
  const filteredAnimals = useMemo(() => {
    return animals.filter((a) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesTag = a.ear_tag.toLowerCase().includes(q);
        const matchesName = a.name?.toLowerCase().includes(q);
        const matchesLot = a.lot_name?.toLowerCase().includes(q);
        if (!matchesTag && !matchesName && !matchesLot) return false;
      }
      if (selectedLot && a.lot_name !== selectedLot) return false;
      if (selectedPasture && a.pasture_name !== selectedPasture) return false;
      if (selectedCategory && a.category !== selectedCategory) return false;
      if (selectedSex && a.sex !== selectedSex) return false;
      if (selectedStatus) {
        if (selectedStatus === "carencia" && !a.in_withdrawal) return false;
        if (selectedStatus === "prenha" && !a.is_pregnant) return false;
        if (selectedStatus === "sem_peso" && (a.days_without_weight ?? 0) < 60 && a.current_weight != null) return false;
        if (selectedStatus === "ativos" && a.status !== "ativo") return false;
      }
      return true;
    });
  }, [animals, searchTerm, selectedLot, selectedPasture, selectedCategory, selectedSex, selectedStatus]);

  // Indicadores recalculados dinamicamente com base no filtro
  const filteredMetrics = useMemo(() => {
    const total = filteredAnimals.length;
    const males = filteredAnimals.filter((a) => a.sex === "macho").length;
    const females = filteredAnimals.filter((a) => a.sex === "femea").length;

    const weights = filteredAnimals.map((a) => a.current_weight).filter((w): w is number => w != null && w > 0);
    const avgWeight = weights.length ? weights.reduce((s, w) => s + w, 0) / weights.length : null;

    const gmds = filteredAnimals.map((a) => a.avg_gmd).filter((g): g is number => g != null);
    const avgGmd = gmds.length ? gmds.reduce((s, g) => s + g, 0) / gmds.length : null;

    return { total, males, females, avgWeight, avgGmd };
  }, [filteredAnimals]);

  const hasActiveFilters = Boolean(
    searchTerm || selectedLot || selectedPasture || selectedCategory || selectedSex || selectedStatus || periodPreset !== "ano"
  );

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedLot("");
    setSelectedPasture("");
    setSelectedCategory("");
    setSelectedSex("");
    setSelectedStatus("");
    setPeriodPreset("ano");
  };

  return (
    <div style={{ marginTop: 24, marginBottom: 20 }}>
      {/* Barra de Ação Superior do Filtro */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Botão de Expansão do Filtro */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="btn ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 12px",
              background: isOpen ? "var(--brand-light)" : "transparent",
              color: isOpen ? "var(--brand)" : "inherit",
              borderColor: isOpen ? "var(--brand-border)" : "var(--line)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filtros Avançados</span>
            {hasActiveFilters && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--brand)",
                }}
              />
            )}
          </button>

          {/* Presets de Período em Chips Rápidos */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "todos", label: "Histórico Total" },
              { id: "30d", label: "Últimos 30 dias" },
              { id: "90d", label: "90 dias" },
              { id: "ano", label: "Ano Atual (2026)" },
              { id: "safra", label: "Safra 25/26" },
            ].map((p) => {
              const active = periodPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodPreset(p.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                    background: active ? "var(--brand-light)" : "var(--surface)",
                    color: active ? "var(--brand)" : "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Busca por Brinco Rápida */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", minWidth: 200 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por brinco ou lote..."
              style={{
                padding: "6px 10px 6px 30px",
                fontSize: 12.5,
                borderRadius: 8,
                border: "1px solid var(--line-strong)",
                background: "var(--surface)",
                color: "var(--ink)",
                width: "100%",
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
              style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Painel Expansível de Filtros Avançados */}
      {isOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 16,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "var(--shadow-card)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {/* Lote */}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
              Lote de Manejo
            </label>
            <select
              value={selectedLot}
              onChange={(e) => setSelectedLot(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Todos os Lotes</option>
              {lots.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Pasto */}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
              Pasto / Piquete
            </label>
            <select
              value={selectedPasture}
              onChange={(e) => setSelectedPasture(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Todos os Pastos</option>
              {pastures.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
              Categoria Zootécnica
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Sexo */}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
              Gênero / Sexo
            </label>
            <select
              value={selectedSex}
              onChange={(e) => setSelectedSex(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Todos (Machos e Fêmeas)</option>
              <option value="macho">Apenas Machos</option>
              <option value="femea">Apenas Fêmeas</option>
            </select>
          </div>

          {/* Situação Sanitária */}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
              Status Sanitário & Manejo
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Todos os Status</option>
              <option value="ativos">Animais Ativos</option>
              <option value="carencia">Em Carência Medicamentosa</option>
              <option value="prenha">Matrizes Prenhas Confirmadas</option>
              <option value="sem_peso">Sem Pesagem Recente (&gt;60 dias)</option>
            </select>
          </div>
        </div>
      )}

      {/* Barra de Filtros Ativos e Resultados */}
      {hasActiveFilters && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            padding: "8px 12px",
            marginTop: 8,
            background: "var(--brand-light)",
            border: "1px solid var(--brand-border)",
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "var(--brand)" }}>Filtros Ativos:</span>
            {periodPreset !== "ano" && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Período: {periodPreset}
              </span>
            )}
            {selectedLot && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Lote: {selectedLot}
                <button type="button" onClick={() => setSelectedLot("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            {selectedPasture && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Pasto: {selectedPasture}
                <button type="button" onClick={() => setSelectedPasture("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            {selectedCategory && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Cat: {selectedCategory}
                <button type="button" onClick={() => setSelectedCategory("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            {selectedSex && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Sexo: {selectedSex}
                <button type="button" onClick={() => setSelectedSex("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            {selectedStatus && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Status: {selectedStatus}
                <button type="button" onClick={() => setSelectedStatus("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            {searchTerm && (
              <span className="badge" style={{ fontSize: 11, background: "var(--surface)" }}>
                Busca: "{searchTerm}"
                <button type="button" onClick={() => setSearchTerm("")} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer" }}>✕</button>
              </span>
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              style={{
                border: "none",
                background: "none",
                color: "var(--brand)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Limpar tudo
            </button>
          </div>

          <div style={{ color: "var(--ink-secondary)", fontWeight: 500 }}>
            Exibindo <strong>{filteredMetrics.total}</strong> de {animals.length} animais ({((filteredMetrics.total / (animals.length || 1)) * 100).toFixed(0)}%)
          </div>
        </div>
      )}

      {/* Mini-painel de Estatísticas Filtradas quando o filtro estiver ativo */}
      {hasActiveFilters && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
            marginTop: 10,
            padding: 12,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Rebanho Filtrado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{filteredMetrics.total} cab.</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Machos</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--brand)" }}>
              {filteredMetrics.males} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>({((filteredMetrics.males / (filteredMetrics.total || 1)) * 100).toFixed(0)}%)</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Fêmeas</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0284c7" }}>
              {filteredMetrics.females} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>({((filteredMetrics.females / (filteredMetrics.total || 1)) * 100).toFixed(0)}%)</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Peso Médio Filtrado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
              {filteredMetrics.avgWeight ? `${filteredMetrics.avgWeight.toFixed(1)} kg` : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>GMD Médio Filtrado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: filteredMetrics.avgGmd && filteredMetrics.avgGmd > 0 ? "var(--brand)" : "var(--ink)" }}>
              {filteredMetrics.avgGmd ? `+${filteredMetrics.avgGmd.toFixed(2)} kg/d` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Amostra de Animais Filtrados */}
      {hasActiveFilters && filteredAnimals.length > 0 && (
        <div style={{ marginTop: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Animais Filtrados em Tempo Real</span>
            <Link href="/herd" className="btn link" style={{ fontSize: 12 }}>Ver rebanho completo →</Link>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 280 }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Brinco</th>
                  <th>Categoria</th>
                  <th>Sexo</th>
                  <th>Lote</th>
                  <th>Pasto</th>
                  <th>Peso Atual</th>
                  <th>GMD</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnimals.slice(0, 15).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/herd/${a.id}`} style={{ fontWeight: 700, color: "var(--brand)" }}>
                        {a.ear_tag}
                      </Link>
                      {a.name && <span style={{ color: "var(--muted)", marginLeft: 6 }}>({a.name})</span>}
                    </td>
                    <td>{a.category}</td>
                    <td>{a.sex === "macho" ? "Macho" : "Fêmea"}</td>
                    <td>{a.lot_name || "—"}</td>
                    <td>{a.pasture_name || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{a.current_weight ? `${a.current_weight.toFixed(1)} kg` : "—"}</td>
                    <td style={{ color: a.avg_gmd && a.avg_gmd > 0 ? "var(--brand)" : "inherit", fontWeight: 600 }}>
                      {a.avg_gmd ? `+${a.avg_gmd.toFixed(2)}` : "—"}
                    </td>
                    <td>
                      {a.in_withdrawal ? (
                        <span className="badge warning" style={{ fontSize: 10 }}>Carência</span>
                      ) : a.is_pregnant ? (
                        <span className="badge" style={{ fontSize: 10 }}>Prenha</span>
                      ) : (
                        <span className="badge neutral" style={{ fontSize: 10 }}>Ativo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAnimals.length > 15 && (
            <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "var(--muted)", background: "var(--bg-subtle)" }}>
              Exibindo os primeiros 15 de {filteredAnimals.length} animais filtrados. Acesse o menu Rebanho Ativo para exportar ou ver a lista completa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
