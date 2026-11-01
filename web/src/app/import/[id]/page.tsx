import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { cancelImport, confirmImport } from "../actions";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOW = 1000;
const COLORS: Record<string, [string, string]> = {
  ok: ["#e3eee6", "#1f3b2c"],
  importada: ["#e3eee6", "#1f3b2c"],
  aviso: ["#fbf0d4", "#6b4a00"],
  erro: ["#f8e3e1", "#a8261d"],
  duplicada: ["#ececec", "#4a5a50"],
  ignorada: ["#ececec", "#4a5a50"],
};
const LABEL: Record<string, string> = { ok: "OK", aviso: "Aviso", erro: "Erro", duplicada: "Duplicada", ignorada: "Ignorada", importada: "Importada" };
const fmtDT = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const ctx = await getContext();
  const a = ctx.active;
  if (!a) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "import" };

  const supabase = await createClient();
  const { data: batch } = await supabase.from("import_batches").select("*").eq("id", id).eq("farm_id", a.id).maybeSingle();
  if (!batch) notFound();
  const [rowsRes, sameFile] = await Promise.all([
    supabase.from("import_rows").select("*").eq("batch_id", id).order("line_no").limit(SHOW),
    supabase.from("import_batches").select("id, confirmed_at").eq("farm_id", a.id).eq("file_hash", batch.file_hash)
      .eq("status", "confirmado").neq("id", id).limit(1),
  ]);
  const rows: any[] = rowsRes.data ?? [];
  const pending = batch.status === "previa";
  const errorsLeft = rows.filter((r) => r.status === "erro").length;

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Importação: {batch.file_name}</h1>
        <Link href="/import" className="btn ghost">Voltar</Link>
      </div>

      {sp.ok && <div className="flash">Importação confirmada: {batch.imported_rows} pesagem(ns) gravada(s).</div>}
      {sp.erro === "pendente" && (
        <div className="flash bad" role="alert">Nada foi gravado: ainda há linhas com erro. Corrija o brinco ou o peso, ou marque "Ignorar" em cada uma.</div>
      )}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Você não tem permissão para confirmar importações.</div>}
      {sp.erro === "falha" && <div className="flash bad" role="alert">Não foi possível confirmar. Nada foi gravado. Atualize a página e tente de novo.</div>}
      {(sameFile.data ?? []).length > 0 && pending && (
        <div className="flash bad" role="alert">Atenção: este mesmo arquivo já foi importado antes. Pesagens que já existem serão marcadas como duplicadas e ignoradas.</div>
      )}

      <div className="grid">
        <div className="card"><small className="muted">Linhas lidas</small><div className="big">{batch.total_rows}</div></div>
        <div className="card"><small className="muted">OK</small><div className="big">{batch.ok_rows}</div></div>
        <div className="card"><small className="muted">Avisos</small><div className="big">{batch.warn_rows}</div></div>
        <div className="card"><small className="muted">Erros</small><div className="big">{batch.error_rows}</div></div>
        <div className="card"><small className="muted">Duplicadas</small><div className="big">{batch.dup_rows}</div></div>
      </div>

      <form action={confirmImport} className="card">
        <input type="hidden" name="batch" value={batch.id} />
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Linha</th><th>Brinco</th><th>Data e hora</th><th>Peso (kg)</th><th>Situação</th><th>Mensagem</th>{pending && <th>Ignorar</th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [bg, fg] = COLORS[r.status] ?? COLORS.ok;
                const editable = pending && r.status === "erro";
                return (
                  <tr key={r.id}>
                    <td>{r.line_no}</td>
                    <td>
                      {editable ? (
                        <input name={`ear_${r.id}`} defaultValue={r.ear_tag ?? ""} aria-label={`Brinco da linha ${r.line_no}`} style={{ width: 120 }} />
                      ) : (r.ear_tag ?? "—")}
                    </td>
                    <td>{fmtDT(r.weighed_at)}</td>
                    <td>
                      {editable ? (
                        <input name={`w_${r.id}`} defaultValue={r.weight_kg ?? ""} inputMode="decimal" aria-label={`Peso da linha ${r.line_no}`} style={{ width: 100 }} />
                      ) : (r.weight_kg ?? "—")}
                    </td>
                    <td><span className="badge" style={{ background: bg, color: fg }}>{LABEL[r.status] ?? r.status}</span></td>
                    <td>{r.message ?? ""}</td>
                    {pending && (
                      <td>{r.status === "duplicada" ? "" : <input type="checkbox" name={`ign_${r.id}`} aria-label={`Ignorar linha ${r.line_no}`} />}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {batch.total_rows > SHOW && <p className="muted">Mostrando as {SHOW} primeiras linhas de {batch.total_rows}.</p>}

        {pending ? (
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <ConfirmSubmit
              className="btn"
              label="Confirmar importação"
              message="Gravar as pesagens válidas? As linhas com erro precisam estar corrigidas ou ignoradas, senão nada é gravado. Esta operação é auditada."
            />
            <span className="muted">
              {errorsLeft > 0
                ? `${errorsLeft} linha(s) com erro: corrija o brinco ou o peso, ou marque "Ignorar".`
                : "Nenhum erro pendente."}
            </span>
          </div>
        ) : (
          <p className="muted">Situação do lote: {batch.status}. {batch.confirmed_at ? `Confirmado em ${fmtDT(batch.confirmed_at)}.` : ""}</p>
        )}
      </form>

      {pending && (
        <form action={cancelImport}>
          <input type="hidden" name="batch" value={batch.id} />
          <ConfirmSubmit label="Cancelar importação" message="Cancelar esta importação? Nada será gravado." />
        </form>
      )}
    </AppShell>
  );
}
