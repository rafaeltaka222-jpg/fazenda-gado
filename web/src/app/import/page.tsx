import Link from "next/link";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { createLayout, createScalePresets } from "./actions";

const ERROS: Record<string, string> = {
  arquivo: "Escolha um layout e um arquivo.",
  grande: "O arquivo é maior que 5 MB.",
  layout: "Layout não encontrado nesta fazenda.",
  vazio: "Não encontrei nenhuma linha de dados no arquivo. Confira o layout (separador e se há linha de cabeçalho).",
  linhas: "O arquivo tem mais de 5.000 linhas. Divida em arquivos menores.",
  perm: "Você não tem permissão para importar arquivos.",
  arq: "Não foi possível ler o arquivo. Confira o layout escolhido.",
  layoutinvalido: "Layout inválido. Confira o nome (deve ser único) e as colunas (devem ser diferentes entre si).",
};

const STATUS: Record<string, string> = {
  previa: "Em Prévia",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
};

const fmt = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    dateStyle: "short",
    timeStyle: "short",
  });

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, getContext()]);
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "import" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Importação de Balança</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [layouts, batches] = await Promise.all([
    supabase
      .from("import_layouts")
      .select("id, name, delimiter, date_format, decimal_separator, has_header, device_name")
      .eq("farm_id", a.id)
      .order("name"),
    supabase
      .from("import_batches")
      .select("id, file_name, status, total_rows, imported_rows, error_rows, created_at")
      .eq("farm_id", a.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const layoutList = layouts.data ?? [];
  const batchList = batches.data ?? [];
  const nowStr = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AppShell {...shell}>
      {/* Top Header matching Images 1 & 4 (AgroPeso) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
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
              Módulo de Importação da Balança
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
              Leitura validada de arquivos TXT/CSV e configuração de layouts (Coimma, Tru-Test, IdBeck)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            {nowStr.replace(",", " •")}
          </div>

          <form action={createScalePresets}>
            <button type="submit" className="btn">
              + Carregar Presets Homologados
            </button>
          </form>
        </div>
      </div>

      {sp.ok === "layout" && (
        <div className="flash">Layout de importação salvo com sucesso.</div>
      )}
      {sp.ok === "presets" && (
        <div className="flash">
          Layouts homologados (Coimma KM-3 Plus, Tru-Test XR5000 e IdBeck 3.0) adicionados à unidade.
        </div>
      )}
      {sp.erro && (
        <div className="flash bad" role="alert">
          {ERROS[sp.erro] ?? "Não foi possível concluir."}
        </div>
      )}

      {/* 2-Column AgroPeso Grid matching Images 1 & 4 */}
      <div className="agropeso-grid">
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Card 1: Enviar Arquivo da Balança */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  Importar Arquivo da Balança (.txt / .csv)
                </h2>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--muted)",
                    marginTop: 3,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--brand)",
                      display: "inline-block",
                    }}
                  />
                  Selecione o layout do indicador eletrônico e envie o arquivo para pré-visualização.
                </div>
              </div>
              <span className="badge">{layoutList.length} layouts ativos</span>
            </div>

            {layoutList.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "var(--bg-elevated)",
                  border: "1px dashed var(--line-strong)",
                }}
              >
                <p className="muted" style={{ margin: 0 }}>
                  Clique em <strong>+ Carregar Presets Homologados</strong> no topo da página ou salve a configuração ao lado antes de enviar o primeiro arquivo.
                </p>
              </div>
            ) : (
              <form
                action="/api/import/preview"
                method="post"
                encType="multipart/form-data"
                className="form2"
              >
                <label>
                  Layout da Balança
                  <select name="layout_id" required>
                    {layoutList.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.device_name || "Padrão TXT"})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Arquivo (.txt ou .csv, até 5 MB)
                  <input
                    type="file"
                    name="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    required
                  />
                </label>
                <div style={{ alignSelf: "end" }}>
                  <button className="btn" type="submit">
                    Ler Arquivo e Gerar Pré-visualização
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Card 2: Pré-visualização da Importação (Modelo Visual AgroPeso) */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  Pré-visualização da Importação
                </h2>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--muted)",
                    marginTop: 3,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--brand)",
                      display: "inline-block",
                    }}
                  />
                  Validação automática de linhas, brincos e variações de peso antes de gravar
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, fontWeight: 700 }}>
                <span style={{ color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "var(--brand)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                    }}
                  >
                    ✓
                  </span>
                  OK
                </span>
                <span style={{ color: "var(--amber)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  ▲ Aviso
                </span>
                <span style={{ color: "var(--red)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  ✕ Erro
                </span>
              </div>
            </div>

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
                  {[
                    { line: 1, tag: "1234", date: "24/05/2024", time: "10:35", weight: "482.5", status: "OK", msg: "Registro válido" },
                    { line: 2, tag: "1233", date: "24/05/2024", time: "10:28", weight: "461.0", status: "OK", msg: "Registro válido" },
                    { line: 3, tag: "1232", date: "24/05/2024", time: "10:21", weight: "ABC", status: "Erro", msg: "Peso inválido" },
                    { line: 4, tag: "12A5", date: "24/05/2024", time: "10:15", weight: "438.5", status: "Erro", msg: "Brinco inválido" },
                    { line: 5, tag: "1230", date: "24/05/2024", time: "10:07", weight: "496.0", status: "OK", msg: "Registro válido" },
                    { line: 6, tag: "1236", date: "24/05/2024", time: "10:50", weight: "470.0", status: "Aviso", msg: "Variação atípica" },
                  ].map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>
                        <strong>{r.tag}</strong>
                      </td>
                      <td>{r.date}</td>
                      <td>{r.time}</td>
                      <td>{r.weight}</td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (r.status === "OK" ? "" : r.status === "Aviso" ? "amber" : "red")
                          }
                        >
                          {r.status === "OK" ? "✓ OK" : r.status === "Aviso" ? "▲ Aviso" : "✕ Erro"}
                        </span>
                      </td>
                      <td className="muted">{r.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Historical Batches if any */}
            {batchList.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <strong style={{ display: "block", marginBottom: 10, fontSize: 13.5 }}>
                  Histórico de Lotes Importados ({batchList.length})
                </strong>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Arquivo</th>
                        <th>Data de Envio</th>
                        <th>Status</th>
                        <th>Linhas</th>
                        <th>Efetivadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchList.map((b: any) => (
                        <tr key={b.id}>
                          <td>
                            <Link
                              href={`/import/${b.id}`}
                              style={{ color: "var(--brand)", fontWeight: 700 }}
                            >
                              {b.file_name}
                            </Link>
                          </td>
                          <td>{fmt(b.created_at)}</td>
                          <td>
                            <span
                              className={
                                "badge " +
                                (b.status === "confirmado"
                                  ? ""
                                  : b.status === "cancelado"
                                  ? "red"
                                  : "amber")
                              }
                            >
                              {STATUS[b.status] ?? b.status}
                            </span>
                          </td>
                          <td>{b.total_rows}</td>
                          <td>{b.status === "confirmado" ? <strong>{b.imported_rows}</strong> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Bottom 2 Action Cards matching Images 1 & 4 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Link
              href="/weighings"
              className="card"
              style={{
                marginBottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                textDecoration: "none",
                background: "var(--brand-light)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand)",
                    flexShrink: 0,
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <path d="M9 6h6M9 10h6M9 14h4" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)" }}>Entrada Manual</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                    Adicionar pesagem de um animal individualmente
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "var(--ink)" }}>→</span>
            </Link>

            <div
              className="card"
              style={{
                marginBottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                background: "#fdf6ec",
                border: "1px solid #f0dfc4",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "#f8e8cd",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9a6728",
                    flexShrink: 0,
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v18M5 8l7-5 7 5M5 16h14" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#2d2417" }}>Importar da Balança</div>
                  <div style={{ fontSize: 12.5, color: "#705d43", marginTop: 2 }}>
                    Ler arquivo TXT gerado pela balança
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#2d2417" }}>→</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Configuração do Layout de Importação matching Images 1 & 4 */}
        <div className="card" style={{ marginBottom: 0, padding: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>
            Configuração do Layout de Importação
          </h2>
          <p className="muted" style={{ margin: "4px 0 16px", fontSize: 12.5 }}>
            Defina como os dados estão organizados no arquivo TXT.
          </p>

          <form action={createLayout} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input type="hidden" name="back" value="/import" />
            <input type="hidden" name="decimal_separator" value="," />
            <input type="hidden" name="col_animal" value="1" />
            <input type="hidden" name="col_date" value="2" />
            <input type="hidden" name="col_time" value="3" />
            <input type="hidden" name="col_weight" value="4" />
            <input type="hidden" name="default_time" value="10:30" />
            <input type="hidden" name="has_header" value="on" />

            <label style={{ margin: 0 }}>
              Nome do perfil de importação
              <input
                name="name"
                required
                defaultValue={`Layout Curral ${layoutList.length + 1}`}
                placeholder="Ex.: Balança Curral Principal"
              />
            </label>

            <label style={{ margin: 0 }}>
              Delimitador de campos
              <select name="delimiter" defaultValue="ponto_e_virgula">
                <option value="ponto_e_virgula">Ponto e vírgula ( ; )</option>
                <option value="virgula">Vírgula ( , )</option>
                <option value="tab">Tabulação ( TAB )</option>
                <option value="barra">Barra vertical ( | )</option>
                <option value="espaco">Espaço</option>
              </select>
            </label>

            <label style={{ margin: 0 }}>
              Formato da data
              <select name="date_format" defaultValue="DD/MM/YYYY">
                <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                <option value="DD-MM-YYYY">DD-MM-AAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              </select>
            </label>

            <label style={{ margin: 0 }}>
              Formato da hora
              <select name="time_format" defaultValue="HH:MM">
                <option value="HH:MM">HH:MM</option>
                <option value="HH:MM:SS">HH:MM:SS</option>
              </select>
            </label>

            {/* Colunas disponíveis (ordem atual) matching Images 1 & 4 */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Colunas disponíveis (ordem atual)
              </div>
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "var(--bg-elevated)",
                }}
              >
                {[
                  { pos: 1, name: "Brinco" },
                  { pos: 2, name: "Data" },
                  { pos: 3, name: "Hora" },
                  { pos: 4, name: "Peso (kg)" },
                  { pos: 5, name: "Observação" },
                ].map((c, idx) => (
                  <div
                    key={c.pos}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "9px 12px",
                      fontSize: 13,
                      borderBottom: idx < 4 ? "1px solid var(--line)" : "none",
                      background: "var(--surface)",
                    }}
                  >
                    <span>
                      <strong style={{ marginRight: 10, color: "var(--muted)" }}>{c.pos}</strong>
                      {c.name}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 12, display: "flex", gap: 10 }}>
                      <span>↑</span>
                      <span>🗑</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dica de formatação */}
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "var(--bg-elevated)",
                border: "1px solid var(--line)",
                fontSize: 12,
              }}
            >
              <strong style={{ display: "block", marginBottom: 4, color: "var(--ink)" }}>
                Dica de formatação
              </strong>
              <p className="muted" style={{ margin: "0 0 10px" }}>
                Certifique-se de que o arquivo TXT segue a ordem e o formato das colunas selecionadas.
              </p>
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 700,
                    color: "var(--ink)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                  }}
                >
                  👁 Ver exemplo de TXT
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    fontSize: 11,
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

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <Link
                href="/weighings"
                className="btn ghost"
                style={{ flex: 1, textAlign: "center" }}
              >
                Cancelar
              </Link>
              <button type="submit" className="btn" style={{ flex: 1.4 }}>
                ✓ Salvar Configuração
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
