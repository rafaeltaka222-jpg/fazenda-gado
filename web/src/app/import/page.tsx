import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { createLayout, createScalePresets } from "./actions";

export const instant = false;

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
const STATUS: Record<string, string> = { previa: "Em Prévia", confirmado: "Confirmado", cancelado: "Cancelado" };
const fmt = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "import" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Importação de Balanças</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [layouts, batches] = await Promise.all([
    supabase.from("import_layouts").select("id, name, delimiter, date_format, decimal_separator, has_header, device_name").eq("farm_id", a.id).order("name"),
    supabase
      .from("import_batches")
      .select("id, file_name, status, total_rows, imported_rows, error_rows, created_at")
      .eq("farm_id", a.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const layoutList = layouts.data ?? [];
  const batchList = batches.data ?? [];
  const totalImportedRows = batchList
    .filter((b: any) => b.status === "confirmado")
    .reduce((acc: number, b: any) => acc + Number(b.imported_rows ?? 0), 0);

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Importação de Pesagens & Balanças Eletrônicas</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Integração de arquivos TXT/CSV de indicadores eletrônicos (Coimma KM-3 Plus, Tru-Test XR5000, IdBeck) com validação prévia
          </p>
        </div>
        <form action={createScalePresets}>
          <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Carregar Presets Homologados (Coimma / Tru-Test)
          </button>
        </form>
      </div>

      {sp.ok === "layout" && <div className="flash">Layout de importação salvo com sucesso.</div>}
      {sp.ok === "presets" && (
        <div className="flash">
          Layouts homologados (Coimma KM-3 Plus, Tru-Test XR5000 e IdBeck 3.0) adicionados à unidade.
        </div>
      )}
      {sp.erro && <div className="flash bad" role="alert">{ERROS[sp.erro] ?? "Não foi possível concluir."}</div>}

      {/* KPIs de Importação */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #059669" }}>
          <small className="muted">Layouts de Balança Ativos</small>
          <div className="big" style={{ color: "var(--brand)" }}>{layoutList.length}</div>
          <small className="muted">Padrões configurados na fazenda</small>
        </div>
        <div className="card" style={{ borderLeft: "4px solid #0284c7" }}>
          <small className="muted">Arquivos Processados</small>
          <div className="big" style={{ color: "#0284c7" }}>{batchList.length}</div>
          <small className="muted">Lotes enviados para validação</small>
        </div>
        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <small className="muted">Pesagens Efetivadas via Arquivo</small>
          <div className="big" style={{ color: "var(--amber)" }}>{totalImportedRows}</div>
          <small className="muted">Registros confirmados sem duplicidade</small>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>1. Enviar Arquivo da Balança (.txt ou .csv)</strong>
          <span className="badge">Validação com Prévia</span>
        </div>
        {layoutList.length === 0 ? (
          <p className="muted">
            Clique em <strong>Carregar Presets Homologados</strong> no topo da página ou cadastre um layout personalizado abaixo antes de enviar o primeiro arquivo.
          </p>
        ) : (
          <form action="/api/import/preview" method="post" encType="multipart/form-data" className="form2" style={{ marginTop: 12 }}>
            <label>Layout da Balança
              <select name="layout_id" required>
                {layoutList.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Arquivo (.txt ou .csv, até 5 MB)<input type="file" name="file" accept=".txt,.csv,text/plain,text/csv" required /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Ler Arquivo e Gerar Prévia</button></div>
          </form>
        )}
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Nada é gravado nesta etapa: o sistema analisa cada linha, aponta variações bruscas de peso ou brincos inexistentes e permite corrigir antes de confirmar.
        </p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>2. Layouts de Importação Cadastrados ({layoutList.length})</strong>
          <span className="badge neutral">Configuração de Colunas</span>
        </div>
        {layoutList.length === 0 ? (
          <p className="muted">Nenhum layout cadastrado.</p>
        ) : (
          <div className="table-container" style={{ marginBottom: 20 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome do Layout</th>
                  <th>Equipamento</th>
                  <th>Separador</th>
                  <th>Formato de Data</th>
                  <th>Decimal</th>
                  <th>Cabeçalho</th>
                </tr>
              </thead>
              <tbody>
                {layoutList.map((l: any) => (
                  <tr key={l.id}>
                    <td><strong>{l.name}</strong></td>
                    <td>{l.device_name || "Genérico"}</td>
                    <td>{l.delimiter.replaceAll("_", " ")}</td>
                    <td><span className="badge neutral">{l.date_format}</span></td>
                    <td><code>{l.decimal_separator}</code></td>
                    <td>{l.has_header ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={createLayout} className="form2" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <label>Nome do Novo Layout<input name="name" required defaultValue="Padrão Curral TXT" /></label>
          <label>Separador de Colunas
            <select name="delimiter" defaultValue="ponto_e_virgula">
              <option value="ponto_e_virgula">Ponto e vírgula (;)</option>
              <option value="virgula">Vírgula (,)</option>
              <option value="tab">Tabulação (TAB)</option>
              <option value="barra">Barra vertical (|)</option>
              <option value="espaco">Espaço</option>
            </select>
          </label>
          <label>Formato da Data
            <select name="date_format" defaultValue="DD/MM/YYYY">
              <option value="DD/MM/YYYY">DD/MM/AAAA</option>
              <option value="DD-MM-YYYY">DD-MM-AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              <option value="MM/DD/YYYY">MM/DD/AAAA</option>
            </select>
          </label>
          <label>Separador Decimal do Peso
            <select name="decimal_separator" defaultValue=",">
              <option value=",">Vírgula (412,5)</option>
              <option value=".">Ponto (412.5)</option>
            </select>
          </label>
          <label>Coluna do Brinco<input name="col_animal" defaultValue="1" inputMode="numeric" required /></label>
          <label>Coluna da Data<input name="col_date" defaultValue="2" inputMode="numeric" required /></label>
          <label>Coluna da Hora (opcional)<input name="col_time" defaultValue="3" inputMode="numeric" /></label>
          <label>Coluna do Peso (kg)<input name="col_weight" defaultValue="4" inputMode="numeric" required /></label>
          <label>Horário Padrão<input name="default_time" type="time" defaultValue="12:00" /></label>
          <label>Equipamento / Modelo<input name="device_name" placeholder="Ex: Coimma KM-3 Plus" /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="has_header" defaultChecked /> A primeira linha é cabeçalho
          </label>
          <div style={{ alignSelf: "end" }}><button className="btn">Salvar Novo Layout</button></div>
        </form>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>3. Histórico de Lotes Importados ({batchList.length})</strong>
          <span className="badge neutral">Auditoria de Arquivos</span>
        </div>
        {batchList.length === 0 ? (
          <p className="muted">Nenhuma importação realizada ainda.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Data de Envio</th>
                  <th>Status</th>
                  <th>Total de Linhas</th>
                  <th>Linhas Efetivadas</th>
                </tr>
              </thead>
              <tbody>
                {batchList.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/import/${b.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
                        {b.file_name}
                      </Link>
                    </td>
                    <td>{fmt(b.created_at)}</td>
                    <td>
                      <span className={"badge " + (b.status === "confirmado" ? "" : b.status === "cancelado" ? "red" : "amber")}>
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
        )}
      </div>
    </AppShell>
  );
}
