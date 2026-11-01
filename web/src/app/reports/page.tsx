import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { STANDARD, defUrl } from "@/lib/reports";
import { deleteReport } from "./actions";

export const instant = false;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reports" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Relatórios</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const permsRes = await supabase.rpc("my_permissions", { p_farm: a.id });
  const perms: string[] = (permsRes.data as string[] | null) ?? [];
  const canView = perms.includes("reports.view");
  const canBuild = perms.includes("reports.builder");
  const saved = canView
    ? (await supabase.from("saved_reports").select("id, name, shared, created_by").eq("farm_id", a.id).order("name")).data ?? []
    : [];

  if (!canView) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Relatórios</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver relatórios.</p></div>
      </AppShell>
    );
  }

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Relatórios e consultas</h1>
        {canBuild && <Link href="/reports/new" className="btn">Nova consulta</Link>}
      </div>
      {sp.ok === "salva" && <div className="flash">Consulta salva em "Minhas consultas".</div>}
      {sp.ok === "excluida" && <div className="flash">Consulta excluída.</div>}
      {sp.erro && <div className="flash bad" role="alert">Não foi possível salvar. Informe um nome (único) e confira a sua permissão.</div>}

      <div className="card">
        <strong>Relatórios padrão</strong>
        {STANDARD.map((r) => (
          <div className="row" key={r.id}>
            <span>
              <Link href={defUrl(r.def)} style={{ color: "var(--green)", fontWeight: 600 }}>{r.name}</Link>
              <span className="muted"> · {r.desc}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Minhas consultas</strong>
        {saved.length === 0 ? (
          <p className="muted">Nenhuma consulta salva. Monte uma em "Nova consulta" e salve na tela de resultado.</p>
        ) : (
          saved.map((s: any) => (
            <div className="row" key={s.id}>
              <span>
                <Link href={`/reports/run?saved=${s.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{s.name}</Link>
                {s.shared && <span className="muted"> · compartilhada</span>}
                {s.created_by !== ctx.user.id && <span className="muted"> · de outro usuário</span>}
              </span>
              {s.created_by === ctx.user.id && (
                <form action={deleteReport}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmSubmit label="Excluir" message="Excluir esta consulta salva?" />
                </form>
              )}
            </div>
          ))
        )}
      </div>
      <p className="muted">
        Exportação em Excel (.xlsx), PDF e CSV, além de impressão. TODO: relatórios de pesagens, movimentações, vacinação, vendas e custos
        como fontes próprias, e totais e subtotais.
      </p>
    </AppShell>
  );
}
