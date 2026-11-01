import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import PrintButton from "@/components/PrintButton";
import { fmtCell, parseDef, type Field } from "@/lib/reports";
import { loadCustomCatalog } from "@/lib/catalog";
import { saveReport } from "../actions";

export const instant = false;

const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunReportPage({
  searchParams,
}: {
  searchParams: Promise<{ def?: string; saved?: string; o?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  if (!a) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reports" };
  const supabase = await createClient();

  let def = parseDef(sp.def);
  let savedName: string | null = null;
  if (sp.saved && UUID.test(sp.saved)) {
    const { data } = await supabase.from("saved_reports").select("name, definition").eq("id", sp.saved).maybeSingle();
    if (data) {
      def = parseDef(JSON.stringify(data.definition));
      savedName = data.name;
    }
  }
  if (!def) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Consulta</h1>
        <div className="flash bad" role="alert">Consulta inválida ou não encontrada.</div>
        <Link href="/reports" className="btn ghost">Voltar</Link>
      </AppShell>
    );
  }

  const offset = Math.max(0, parseInt(sp.o ?? "0", 10) || 0);
  const [res, cat, permsRes] = await Promise.all([
    supabase.rpc("run_report", { p_farm: a.id, p_def: def, p_limit: PAGE, p_offset: offset }),
    supabase.from("report_fields").select("key, label, type").eq("source", "animals").order("position"),
    supabase.rpc("my_permissions", { p_farm: a.id }),
  ]);
  const canBuild = ((permsRes.data as string[] | null) ?? []).includes("reports.builder");
  const customCat = await loadCustomCatalog(supabase, a.id, a.role);
  const catalog = new Map([...((cat.data ?? []) as Field[]), ...customCat.fields].map((f) => [f.key, f]));
  const defJson = JSON.stringify(def);
  const self = (o: number) =>
    sp.saved ? `/reports/run?saved=${sp.saved}&o=${o}` : `/reports/run?def=${encodeURIComponent(defJson)}&o=${o}`;

  if (res.error) {
    const msg =
      res.error.code === "42501"
        ? "Seu perfil não tem permissão para executar relatórios."
        : res.error.code === "22P02" || res.error.code === "22007" || res.error.code === "22008"
          ? "Há um valor inválido em um dos filtros (número ou data)."
          : res.error.message.includes("invalid_")
            ? "A consulta tem um campo, filtro ou operador inválido."
            : "Não foi possível executar a consulta.";
    return (
      <AppShell {...shell}>
        <h1 className="title">Consulta</h1>
        <div className="flash bad" role="alert">{msg}</div>
        <Link href="/reports" className="btn ghost">Voltar</Link>
      </AppShell>
    );
  }

  const out = res.data as { total: number; rows: any[]; columns: string[] };
  const cols = out.columns;
  const pages = Math.max(1, Math.ceil(out.total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">{savedName ?? "Resultado da consulta"}</h1>
        <div className="noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/reports" className="btn ghost">Voltar</Link>
          {canBuild && <Link href={`/reports/new?def=${encodeURIComponent(defJson)}`} className="btn ghost">Editar consulta</Link>}
          <form action="/api/reports/export" method="post" style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="def" value={defJson} />
            <input type="hidden" name="title" value={savedName ?? "Resultado da consulta"} />
            <button className="btn ghost" name="format" value="xlsx">Exportar Excel</button>
            <button className="btn ghost" name="format" value="pdf">Exportar PDF</button>
            <button className="btn ghost" name="format" value="csv">Exportar CSV</button>
          </form>
          <PrintButton />
        </div>
      </div>
      <p className="muted">
        {a.code} · {a.name} · {out.total} registro(s) · gerado em{" "}
        {new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })}
      </p>

      <div className="card" style={{ overflowX: "auto" }}>
        {out.rows.length === 0 ? (
          <p className="muted">Nenhum registro encontrado.</p>
        ) : (
          <table className="table">
            <thead><tr>{cols.map((k) => <th key={k}>{catalog.get(k)?.label ?? k}</th>)}</tr></thead>
            <tbody>
              {out.rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((k) => <td key={k}>{fmtCell(r[k], catalog.get(k)?.type ?? "text", k)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pager noprint" style={{ marginTop: 12 }}>
          <span className="muted">Página {page} de {pages}</span>
          {offset > 0 && <Link href={self(Math.max(0, offset - PAGE))} className="btn ghost">Anterior</Link>}
          {offset + PAGE < out.total && <Link href={self(offset + PAGE)} className="btn ghost">Próxima</Link>}
        </div>
      </div>
      {out.total > 5000 && <p className="muted noprint">A exportação (Excel, PDF e CSV) leva no máximo 5.000 linhas. Refine os filtros para exportar o restante.</p>}

      {canBuild && !sp.saved && (
        <form action={saveReport} className="card noprint">
          <strong>Salvar em "Minhas consultas"</strong>
          <input type="hidden" name="def" value={defJson} />
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Nome da consulta<input name="name" required /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "end" }}>
              <input type="checkbox" name="shared" /> Compartilhar com quem pode ver relatórios
            </label>
            <div style={{ alignSelf: "end" }}><button className="btn">Salvar consulta</button></div>
          </div>
        </form>
      )}
    </AppShell>
  );
}
