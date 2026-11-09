import Link from "next/link";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmButton from "@/components/ConfirmSubmit";
import { registerWeighings } from "./actions";
import { createLayout, createScalePresets } from "../import/actions";

const LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = { lote?: string; ok?: string; av?: string; erro?: string };

export default async function WeighingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, ctx] = await Promise.all([searchParams, getContext()]);
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "weighings" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Módulo de Pesagem</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const lote = sp.lote && UUID.test(sp.lote) ? sp.lote : "";
  let q = supabase
    .from("animals")
    .select("id, ear_tag, name, sex, lot_id", { count: "exact" })
    .eq("farm_id", a.id)
    .eq("status", "ativo")
    .order("ear_tag")
    .limit(LIMIT);
  if (lote) q = q.eq("lot_id", lote);

  const [animals, lots, recentWRes, layoutsRes, latestBatchRes] = await Promise.all([
    q,
    supabase.from("lots").select("id, name").eq("farm_id", a.id).eq("status", "ativo").order("name"),
    supabase
      .from("weighings")
      .select("id, animal_id, weighed_at, weight_kg, animals(ear_tag)")
      .eq("farm_id", a.id)
      .is("voided_at", null)
      .order("weighed_at", { ascending: false })
      .limit(300),
    supabase
      .from("import_layouts")
      .select("id, name, delimiter, date_format, decimal_separator, device_name")
      .eq("farm_id", a.id)
      .order("name"),
    supabase
      .from("import_batches")
      .select("id, file_name, status, total_rows, ok_rows, warn_rows, error_rows, created_at")
      .eq("farm_id", a.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestBatch: any = latestBatchRes.data;
  const previewRowsRes = latestBatch?.id
    ? await supabase
        .from("import_rows")
        .select("id, line_no, ear_tag, weighed_at, weight_kg, status, message")
        .eq("batch_id", latestBatch.id)
        .order("line_no")
        .limit(8)
    : { data: [] as any[] };
  const previewRows: any[] = previewRowsRes.data ?? [];

  const rows: any[] = animals.data ?? [];
  const rawRecent = (recentWRes.data ?? []) as any[];
  const wmap = new Map<string, any>();
  for (const w of rawRecent) {
    const aid = w.animal_id;
    if (!aid) continue;
    const cur = wmap.get(aid);
    if (!cur) {
      wmap.set(aid, { animal_id: aid, last_weight: Number(w.weight_kg), last_at: w.weighed_at, prev_weight: null, prev_at: null });
    } else if (cur.prev_weight === null) {
      cur.prev_weight = Number(w.weight_kg);
      cur.prev_at = w.weighed_at;
    }
  }
  const lotName = (id: string | null) => (id ? (lots.data ?? []).find((l: any) => l.id === id)?.name ?? "—" : "—");
  const tagMap = new Map<string, string>(rows.map((r) => [r.id, r.ear_tag]));
  const recentRows = rawRecent.slice(0, 8).map((w) => {
    const dt = new Date(w.weighed_at);
    const dStr = dt.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
    const tStr = dt.toLocaleTimeString("pt-BR", {
      timeZone: "America/Bahia",
      hour: "2-digit",
      minute: "2-digit",
    });
    const s = wmap.get(w.animal_id);
    const diff =
      s?.prev_weight != null
        ? Number(w.weight_kg) - Number(s.prev_weight)
        : 0;
    const joinedTag = Array.isArray(w.animals) ? w.animals[0]?.ear_tag : w.animals?.ear_tag;
    return {
      id: w.id,
      ear_tag: joinedTag ?? tagMap.get(w.animal_id) ?? "—",
      date: dStr,
      time: tStr,
      weight: Number(w.weight_kg),
      gain: diff,
    };
  });

  const layoutList = layoutsRes.data ?? [];
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const now = new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const todayBR = today.split("-").reverse().join("/");
  const back = lote ? `/weighings?lote=${lote}` : "/weighings";

  return (
    <AppShell {...shell}>
      {/* Cabeçalho Fiel às Imagens 1 e 4 (Módulo de Pesagem - AgroPeso) */}
      <div
        className="head"
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Módulo de Pesagem
            </h1>
            <p className="muted" style={{ margin: "3px 0 0 0", fontSize: 13.5 }}>
              Controle preciso do peso e evolução do ganho médio diário (GMD)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink-secondary)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>
              {todayBR} • {now}
            </span>
          </div>

          <a
            href="#lancamento-manual"
            className="btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            <span>+ Novo Registro</span>
          </a>
        </div>
      </div>

      {sp.ok === "layout" ? (
        <div className="flash">Configuração de layout da balança salva com sucesso.</div>
      ) : sp.ok === "presets" ? (
        <div className="flash">Perfis homologados de balança (Coimma, Tru-Test e IdBeck) carregados com sucesso.</div>
      ) : sp.ok ? (
        <div className="flash">Operação concluída: {sp.ok} pesagem(ns) registrada(s) com sucesso.</div>
      ) : null}
      {Number(sp.av) > 0 && (
        <div className="flash bad" role="alert">
          Atenção: {sp.av} pesagem(ns) com variação brusca em relação à pesagem anterior. Confira os valores lançados.
        </div>
      )}
      {sp.erro && (
        <div className="flash bad" role="alert">
          {sp.erro === "animal_inativo"
            ? "Regra de Integridade: Animal vendido ou morto não recebe pesagem."
            : sp.erro === "pesagem_antes_nasc"
            ? "Regra de Integridade: A data da pesagem não pode ser anterior à data de nascimento do animal."
            : "Não foi possível concluir a operação. Verifique os dados informados."}
        </div>
      )}

      {/* GRID 2 COLUNAS FIEL ÀS IMAGENS 1 E 4 */}
      <div className="agropeso-grid">
        {/* COLUNA ESQUERDA: ÚLTIMAS PESAGENS + PRÉ-VISUALIZAÇÃO DA IMPORTAÇÃO + BOTÕES DUPLOS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Card 1: Últimas Pesagens */}
          <div className="card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                  Últimas Pesagens
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)" }} />
                  <span>Resumo das últimas pesagens realizadas.</span>
                </div>
              </div>

              <a
                href="#lancamento-manual"
                className="btn ghost"
                style={{ padding: "6px 12px", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>Ver todas</span>
                <span>↗</span>
              </a>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Brinco</th>
                    <th>Data</th>
                    <th>Hora ↕</th>
                    <th>Peso (kg) ↕</th>
                    <th>Ganho (kg) ↕</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                        <span className="muted">
                          Nenhuma pesagem registrada na fazenda <strong>{a.name}</strong> ainda. Utilize o lançamento manual abaixo ou importe da balança.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    recentRows.map((r) => {
                      const isPositive = r.gain >= 0;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700, color: "var(--ink)" }}>{r.ear_tag}</td>
                          <td>{r.date}</td>
                        <td>{r.time}</td>
                        <td style={{ fontWeight: 700 }}>
                          {r.weight.toFixed(1).replace(".", ",")}
                        </td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: isPositive ? "var(--brand)" : "var(--amber)",
                          }}
                        >
                          {isPositive ? `+${r.gain.toFixed(1).replace(".", ",")}` : r.gain.toFixed(1).replace(".", ",")}
                        </td>
                        <td>
                          {isPositive ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "3px 10px",
                                borderRadius: 999,
                                background: "var(--brand-light)",
                                color: "var(--brand)",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <span>Ganho Normal</span>
                              <span
                                style={{
                                  width: 15,
                                  height: 15,
                                  borderRadius: "50%",
                                  background: "var(--brand)",
                                  color: "#fff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 9.5,
                                }}
                              >
                                ✓
                              </span>
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "3px 10px",
                                borderRadius: 999,
                                background: "var(--amber-light)",
                                color: "var(--amber)",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <span>Perda</span>
                              <span>▾</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                fontSize: 12.5,
                color: "var(--muted)",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span>
                Mostrando {recentRows.length} de {rawRecent.length} registros ({a.name})
              </span>
              <Link href="/reports" className="btn ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
                Ver histórico completo →
              </Link>
            </div>
          </div>

          {/* Card 2: Pré-visualização da Importação (Fiel às Imagens 1 e 4) */}
          <div id="upload-balanca" className="card" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                  Pré-visualização da Importação
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)" }} />
                  <span>Dados lidos do arquivo TXT/CSV • Validação automática antes de gravar</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700 }}>
                <span style={{ color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 15, height: 15, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5 }}>✓</span>
                  OK
                </span>
                <span style={{ color: "var(--amber)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span>▲</span> Aviso
                </span>
                <span style={{ color: "var(--red)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 15, height: 15, borderRadius: "50%", background: "var(--red)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5 }}>✕</span>
                  Erro
                </span>
              </div>
            </div>

            {/* Upload Rápido de Arquivo da Balança */}
            {layoutList.length > 0 ? (
              <form
                action="/api/import/preview"
                method="post"
                encType="multipart/form-data"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--line)",
                  marginBottom: 14,
                }}
              >
                <label style={{ flex: 1, minWidth: 180, fontSize: 12.5 }}>
                  Perfil da Balança Eletrônica
                  <select name="layout_id" required style={{ marginTop: 4 }}>
                    {layoutList.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: 1.2, minWidth: 200, fontSize: 12.5 }}>
                  Arquivo da Balança (.txt ou .csv)
                  <input type="file" name="file" accept=".txt,.csv,text/plain,text/csv" required style={{ marginTop: 4 }} />
                </label>
                <button className="btn" style={{ padding: "9px 16px", fontSize: 13 }}>
                  Validar Arquivo
                </button>
              </form>
            ) : (
              <form action={createScalePresets} style={{ marginBottom: 14 }}>
                <input type="hidden" name="back" value="/weighings" />
                <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }}>
                  + Carregar Perfis Homologados (Coimma KM-3 / Tru-Test XR5000 / IdBeck)
                </button>
              </form>
            )}

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Brinco</th>
                    <th>Data</th>
                    <th>Hora</th>
                    <th>Peso (kg)</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 20 }}>
                        <span className="muted">
                          Nenhum lote de arquivo enviado ainda. Selecione um arquivo .txt ou .csv acima para validar os registros da balança.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((p: any) => {
                      const dt = p.weighed_at ? new Date(p.weighed_at) : null;
                      const dStr = dt ? dt.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "—";
                      const tStr = dt
                        ? dt.toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })
                        : "—";
                      return (
                        <tr key={p.id ?? p.line_no}>
                          <td>{p.line_no}</td>
                          <td style={{ fontWeight: 700 }}>{p.ear_tag ?? "—"}</td>
                          <td>{dStr}</td>
                          <td>{tStr}</td>
                          <td style={{ fontWeight: 600 }}>{p.weight_kg ?? "—"}</td>
                          <td>
                            {p.status === "ok" || p.status === "importada" ? (
                              <span style={{ color: "var(--brand)", fontWeight: 700, fontSize: 12.5 }}>✓ OK</span>
                            ) : p.status === "aviso" ? (
                              <span style={{ color: "var(--amber)", fontWeight: 700, fontSize: 12.5 }}>▲ Aviso</span>
                            ) : (
                              <span style={{ color: "var(--red)", fontWeight: 700, fontSize: 12.5 }}>✕ Erro</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12.5, color: "var(--ink-secondary)" }}>{p.message || "Registro validado"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                fontSize: 12.5,
                color: "var(--muted)",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span>
                {latestBatch
                  ? `Último arquivo (${latestBatch.file_name}): ${latestBatch.ok_rows ?? 0} OK • ${latestBatch.error_rows ?? 0} erro(s) • ${latestBatch.warn_rows ?? 0} aviso(s)`
                  : "0 lotes importados nesta fazenda"}
              </span>
              <Link href="/import" className="btn ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
                Ver histórico de lotes
              </Link>
            </div>
          </div>

          {/* 2 Cartões de Ação Inferiores Lado a Lado (Entrada Manual + Importar da Balança - Fiel às Imagens 1 e 4) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            <a
              href="#lancamento-manual"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 14,
                background: "var(--brand-light)",
                border: "1px solid var(--brand-border)",
                transition: "transform 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "var(--surface)",
                    color: "var(--brand)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                    Entrada Manual
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 2 }}>
                    Adicionar pesagem de um animal ou lote inteiro
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "var(--brand)", fontWeight: 700 }}>→</span>
            </a>

            <a
              href="#upload-balanca"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 14,
                background: "var(--amber-light)",
                border: "1px solid var(--amber-border)",
                transition: "transform 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "var(--surface)",
                    color: "var(--amber)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                    Importar da Balança
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 2 }}>
                    Ler arquivo TXT gerado pela balança
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "var(--amber)", fontWeight: 700 }}>→</span>
            </a>
          </div>
        </div>

        {/* COLUNA DIREITA: CONFIGURAÇÃO DO LAYOUT DE IMPORTAÇÃO (FIEL ÀS IMAGENS 1 E 4) */}
        <form action={createLayout} className="card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              Configuração do Layout de Importação
            </h2>
            <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 0" }}>
              Defina como os dados estão organizados no arquivo TXT.
            </p>
          </div>

          <input type="hidden" name="back" value="/weighings" />
          <input type="hidden" name="decimal_separator" value="," />
          <input type="hidden" name="col_animal" value="1" />
          <input type="hidden" name="col_date" value="2" />
          <input type="hidden" name="col_time" value="3" />
          <input type="hidden" name="col_weight" value="4" />
          <input type="hidden" name="has_header" value="on" />

          <label style={{ fontSize: 13 }}>
            Nome do perfil de importação
            <input
              name="name"
              required
              defaultValue={`Layout Curral ${layoutList.length + 1}`}
              placeholder="Ex.: Balança Curral Principal"
              style={{ marginTop: 4 }}
            />
          </label>

          <label style={{ fontSize: 13 }}>
            Delimitador de campos
            <select name="delimiter" defaultValue="ponto_e_virgula" style={{ marginTop: 4 }}>
              <option value="ponto_e_virgula">Ponto e vírgula ( ; )</option>
              <option value="virgula">Vírgula ( , )</option>
              <option value="tab">Tabulação ( TAB )</option>
              <option value="barra">Barra vertical ( | )</option>
            </select>
          </label>

          <label style={{ fontSize: 13 }}>
            Formato da data
            <select name="date_format" defaultValue="DD/MM/YYYY" style={{ marginTop: 4 }}>
              <option value="DD/MM/YYYY">DD/MM/AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              <option value="DD-MM-YYYY">DD-MM-AAAA</option>
            </select>
          </label>

          <label style={{ fontSize: 13 }}>
            Formato da hora
            <select name="default_time" defaultValue="08:00" style={{ marginTop: 4 }}>
              <option value="08:00">HH:MM (Padrão 08:00)</option>
              <option value="12:00">HH:MM (Padrão 12:00)</option>
            </select>
          </label>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
              Colunas disponíveis (ordem atual)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { pos: 1, label: "Brinco" },
                { pos: 2, label: "Data" },
                { pos: 3, label: "Hora" },
                { pos: 4, label: "Peso (kg)" },
                { pos: 5, label: "Observação" },
              ].map((col) => (
                <div
                  key={col.pos}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--line)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "var(--muted)", width: 14 }}>{col.pos}</span>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{col.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
                    <span>↑</span>
                    <span>🗑</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dica de formatação */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--bg-subtle)",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Dica de formatação</div>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
              Certifique-se de que o arquivo TXT segue a ordem e o formato das colunas selecionadas.
            </p>
            <details>
              <summary
                className="btn ghost"
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <span>👁 Ver exemplo de TXT</span>
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  fontSize: 11.5,
                  overflowX: "auto",
                }}
              >
{`BRINCO;DATA;HORA;PESO
1234;24/05/2024;10:35;482,5
1233;24/05/2024;10:28;461,0
1230;24/05/2024;10:07;496,0`}
              </pre>
            </details>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <Link href="/weighings" className="btn ghost" style={{ padding: "9px 14px", fontSize: 13 }}>
              Cancelar
            </Link>
            <button type="submit" className="btn" style={{ padding: "9px 16px", fontSize: 13 }}>
              ✓ Salvar Configuração
            </button>
          </div>
        </form>
      </div>

      {/* SEÇÃO DE LANÇAMENTO EM LOTE NO CURRAL (#lancamento-manual) */}
      <div id="lancamento-manual" style={{ marginTop: 8 }}>
        <form className="card filters" method="get" style={{ marginBottom: 14 }}>
          <label>
            Filtrar Lote de Manejo para Lançamento Manual
            <select name="lote" defaultValue={lote}>
              <option value="">Todos os lotes da fazenda</option>
              {(lots.data ?? []).map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">Carregar Lote</button>
          {lote && (
            <Link href="/weighings" className="btn ghost">
              Ver Todos
            </Link>
          )}
        </form>

        <form action={registerWeighings} className="card">
          <input type="hidden" name="back" value={back} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <strong style={{ fontSize: 16 }}>Entrada Manual de Pesagens por Lote</strong>
            <span className="badge neutral">
              {rows.length} de {animals.count ?? 0} animais ativos carregados
            </span>
          </div>

          <div
            className="form2"
            style={{
              background: "var(--bg-subtle)",
              padding: "14px 16px",
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <label>
              Data da Pesagem
              <input name="date" type="date" defaultValue={today} max={today} required />
            </label>
            <label>
              Horário da Pesagem
              <input name="time" type="time" defaultValue={now} required />
            </label>
          </div>

          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 16px" }}>
              <p className="muted" style={{ fontSize: 14.5 }}>
                Nenhum animal ativo cadastrado neste filtro. Cadastre animais em{" "}
                <Link href="/herd/new" style={{ color: "var(--brand)", fontWeight: 700 }}>
                  Animais
                </Link>{" "}
                ou envie um arquivo da balança acima.
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Brinco</th>
                    <th>Nome</th>
                    <th>Lote</th>
                    <th>Última Pesagem</th>
                    <th style={{ width: 170 }}>Novo Peso (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = wmap.get(r.id);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link
                            href={`/herd/${r.id}`}
                            style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14.5 }}
                          >
                            {r.ear_tag}
                          </Link>
                        </td>
                        <td style={{ color: r.name ? "var(--ink)" : "var(--muted)" }}>{r.name ?? "—"}</td>
                        <td>
                          <span className="badge neutral">{lotName(r.lot_id)}</span>
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {s ? (
                            `${Number(s.last_weight).toFixed(1).replace(".", ",")} kg`
                          ) : (
                            <span className="muted">Sem peso anterior</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              name={`peso_${r.id}`}
                              inputMode="decimal"
                              placeholder="0,0"
                              aria-label={`Peso de ${r.ear_tag}`}
                              style={{
                                width: 100,
                                textAlign: "right",
                                fontWeight: 700,
                                padding: "8px 10px",
                                borderColor: "var(--brand-border)",
                              }}
                            />
                            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>kg</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 18,
                flexWrap: "wrap",
                gap: 14,
              }}
            >
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Preencha apenas os animais que subiram na balança. Linhas em branco são ignoradas.
              </p>
              <ConfirmButton
                className="btn"
                label="Salvar Pesagens do Lote"
                message="Confirmar o registro das pesagens preenchidas?"
              />
            </div>
          )}
        </form>
      </div>
    </AppShell>
  );
}
