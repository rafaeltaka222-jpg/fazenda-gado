import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { createLayout } from "./actions";

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
const STATUS: Record<string, string> = { previa: "em prévia", confirmado: "confirmado", cancelado: "cancelado" };
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
        <h1 className="title">Importação</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [layouts, batches] = await Promise.all([
    supabase.from("import_layouts").select("id, name, delimiter, date_format, decimal_separator, has_header").eq("farm_id", a.id).order("name"),
    supabase.from("import_batches")
      .select("id, file_name, status, total_rows, imported_rows, error_rows, created_at")
      .eq("farm_id", a.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <AppShell {...shell}>
      <h1 className="title">Importação de pesagens</h1>
      {sp.ok === "layout" && <div className="flash">Layout criado.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERROS[sp.erro] ?? "Não foi possível concluir."}</div>}

      <div className="card">
        <strong>1. Enviar arquivo</strong>
        {(layouts.data ?? []).length === 0 ? (
          <p className="muted">Crie um layout abaixo antes de enviar o primeiro arquivo.</p>
        ) : (
          <form action="/api/import/preview" method="post" encType="multipart/form-data" className="form2" style={{ marginTop: 12 }}>
            <label>Layout
              <select name="layout_id" required>
                {(layouts.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Arquivo (.txt ou .csv, até 5 MB)<input type="file" name="file" accept=".txt,.csv,text/plain,text/csv" required /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Ler arquivo e ver prévia</button></div>
          </form>
        )}
        <p className="muted">Nada é gravado nesta etapa. Você revisa a prévia, corrige ou ignora as linhas com problema e só então confirma.</p>
      </div>

      <div className="card">
        <strong>Layouts de importação</strong>
        {(layouts.data ?? []).length === 0 ? (
          <p className="muted">Nenhum layout cadastrado.</p>
        ) : (
          (layouts.data ?? []).map((l: any) => (
            <div className="row" key={l.id}>
              <span>{l.name}</span>
              <span className="muted">{l.delimiter.replaceAll("_", " ")} · {l.date_format} · decimal "{l.decimal_separator}"{l.has_header ? " · com cabeçalho" : ""}</span>
            </div>
          ))
        )}
        <form action={createLayout} className="form2" style={{ marginTop: 12 }}>
          <label>Nome do layout<input name="name" required defaultValue="Padrão TXT" /></label>
          <label>Separador
            <select name="delimiter" defaultValue="ponto_e_virgula">
              <option value="ponto_e_virgula">Ponto e vírgula (;)</option>
              <option value="virgula">Vírgula (,)</option>
              <option value="tab">Tabulação</option>
              <option value="barra">Barra vertical (|)</option>
              <option value="espaco">Espaço</option>
            </select>
          </label>
          <label>Formato da data
            <select name="date_format" defaultValue="DD/MM/YYYY">
              <option value="DD/MM/YYYY">DD/MM/AAAA</option>
              <option value="DD-MM-YYYY">DD-MM-AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              <option value="MM/DD/YYYY">MM/DD/AAAA</option>
            </select>
          </label>
          <label>Separador decimal do peso
            <select name="decimal_separator" defaultValue=",">
              <option value=",">Vírgula (412,5)</option>
              <option value=".">Ponto (412.5)</option>
            </select>
          </label>
          <label>Coluna do brinco<input name="col_animal" defaultValue="1" inputMode="numeric" required /></label>
          <label>Coluna da data<input name="col_date" defaultValue="2" inputMode="numeric" required /></label>
          <label>Coluna da hora (vazio = usar horário padrão)<input name="col_time" defaultValue="3" inputMode="numeric" /></label>
          <label>Coluna do peso<input name="col_weight" defaultValue="4" inputMode="numeric" required /></label>
          <label>Horário padrão (se não houver coluna de hora)<input name="default_time" type="time" defaultValue="12:00" /></label>
          <label>Nome do equipamento (opcional)<input name="device_name" /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="has_header" defaultChecked /> A primeira linha é cabeçalho
          </label>
          <div style={{ alignSelf: "end" }}><button className="btn">Salvar layout</button></div>
        </form>
        <p className="muted">As colunas são contadas a partir de 1, da esquerda para a direita. O brinco identifica o animal.</p>
      </div>

      <div className="card">
        <strong>Histórico de importações</strong>
        {(batches.data ?? []).length === 0 ? (
          <p className="muted">Nenhuma importação ainda.</p>
        ) : (
          (batches.data ?? []).map((b: any) => (
            <div className="row" key={b.id}>
              <span>
                <Link href={`/import/${b.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{b.file_name}</Link>
                <span className="muted"> · {fmt(b.created_at)}</span>
              </span>
              <span className="muted">
                {STATUS[b.status] ?? b.status} · {b.total_rows} linha(s)
                {b.status === "confirmado" ? ` · ${b.imported_rows} importada(s)` : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
