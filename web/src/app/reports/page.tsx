import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { STANDARD, defUrl } from "@/lib/reports";
import { deleteReport } from "./actions";

export const instant = false;

const money = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reports" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Relatórios & Inteligência</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const permsRes = await supabase.rpc("my_permissions", { p_farm: a.id });
  const perms: string[] = (permsRes.data as string[] | null) ?? [];
  const canView = perms.includes("reports.view");
  const canBuild = perms.includes("reports.builder");

  if (!canView) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Relatórios & Inteligência</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver relatórios.</p></div>
      </AppShell>
    );
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const monthStart = today.slice(0, 8) + "01";

  const [savedRes, dashSum, healthSum, salesSum, costRes, weighCountRes, movCountRes] = await Promise.all([
    supabase.from("saved_reports").select("id, name, shared, created_by").eq("farm_id", a.id).order("name"),
    supabase.rpc("dashboard_summary", { p_farm: a.id }),
    supabase.rpc("health_alerts", { p_farm: a.id }),
    supabase.rpc("sales_summary", { p_farm: a.id, p_from: monthStart, p_to: today }),
    supabase.from("costs").select("amount").eq("farm_id", a.id).is("voided_at", null).gte("occurred_on", monthStart),
    supabase.from("weighings").select("id", { count: "exact", head: true }).eq("farm_id", a.id).is("voided_at", null),
    supabase.from("animal_events").select("id", { count: "exact", head: true }).eq("farm_id", a.id),
  ]);

  const saved = savedRes.data ?? [];
  const ds: any = dashSum.data ?? {};
  const hs: any = healthSum.data ?? {};
  const sl: any = salesSum.data ?? {};
  const monthCosts = (costRes.data ?? []).reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0);
  const totalWeighings = weighCountRes.count ?? 0;
  const totalMovements = movCountRes.count ?? 0;

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Relatórios Gerenciais & Exportação Corporativa</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Consolidação executiva de rebanho, pesagens, movimentações, sanidade, comercial e custos — exportação nativa em Excel (.xlsx), PDF e CSV
          </p>
        </div>
        {canBuild && (
          <Link href="/reports/new" className="btn">
            Montar Nova Consulta Personalizada
          </Link>
        )}
      </div>

      {sp.ok === "salva" && <div className="flash">Consulta salva com sucesso em Minhas Consultas.</div>}
      {sp.ok === "excluida" && <div className="flash">Consulta excluída com sucesso.</div>}
      {sp.erro && <div className="flash bad" role="alert">Não foi possível salvar. Informe um nome único e confira sua permissão.</div>}

      {/* Painel Consolidado das 5 Fontes Operacionais (Pesagens, Movimentações, Vacinação, Vendas e Custos) */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #059669" }}>
          <small className="muted">1. Fonte: Pesagens & GMD</small>
          <div className="big" style={{ color: "var(--brand)" }}>{totalWeighings}</div>
          <small className="muted">
            Pesagens válidas · Peso médio: <strong>{ds.avg_weight ? `${Number(ds.avg_weight).toFixed(1)} kg` : "—"}</strong>
          </small>
          <div style={{ marginTop: 10 }}>
            <Link href="/weighings" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand)" }}>
              Abrir Livro de Pesagens →
            </Link>
          </div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #0284c7" }}>
          <small className="muted">2. Fonte: Movimentações & Trânsito</small>
          <div className="big" style={{ color: "#0284c7" }}>{totalMovements}</div>
          <small className="muted">
            Eventos auditados (entradas, transferências, baixas)
          </small>
          <div style={{ marginTop: 10 }}>
            <Link href="/herd" style={{ fontSize: 12.5, fontWeight: 700, color: "#0284c7" }}>
              Auditar Movimentações por Lote →
            </Link>
          </div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #10b981" }}>
          <small className="muted">3. Fonte: Vacinação & Sanidade</small>
          <div className="big" style={{ color: "#10b981" }}>
            {Number(hs.overdue_count ?? 0) === 0 ? "100% em dia" : `${hs.overdue_count} pend.`}
          </div>
          <small className="muted">
            {Number(hs.withdrawal_count ?? 0)} animal(is) em carência ativa
          </small>
          <div style={{ marginTop: 10 }}>
            <Link href="/health" style={{ fontSize: 12.5, fontWeight: 700, color: "#10b981" }}>
              Abrir Relatório Sanitário →
            </Link>
          </div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <small className="muted">4. Fonte: Vendas & Faturamento (Mês)</small>
          <div className="big" style={{ color: "var(--amber)" }}>{money(sl.total)}</div>
          <small className="muted">
            {sl.animals ?? 0} cabeça(s) em {sl.sales ?? 0} operação(ões)
          </small>
          <div style={{ marginTop: 10 }}>
            <Link href="/sales" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)" }}>
              Abrir Livro Comercial & GTA →
            </Link>
          </div>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #6366f1" }}>
          <small className="muted">5. Fonte: Custos & Despesas (Mês)</small>
          <div className="big" style={{ color: "#6366f1" }}>{money(monthCosts)}</div>
          <small className="muted">
            Rateio operacional e nutricional acumulado
          </small>
          <div style={{ marginTop: 10 }}>
            <Link href="/costs" style={{ fontSize: 12.5, fontWeight: 700, color: "#6366f1" }}>
              Abrir Demonstrativo de Custos →
            </Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Relatórios Padrão Homologados (Exportação Excel, PDF e CSV)</strong>
          <span className="badge">JR Comércio e Exportação de Café</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Relatório Corporativo</th>
                <th>Escopo e Critérios</th>
                <th style={{ textAlign: "right" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={defUrl(r.def)} style={{ color: "var(--brand)", fontWeight: 700 }}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="muted">{r.desc}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={defUrl(r.def)} className="btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }}>
                      Executar & Exportar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Minhas Consultas Personalizadas ({saved.length})</strong>
          <span className="badge neutral">Construtor Dinâmico</span>
        </div>
        {saved.length === 0 ? (
          <p className="muted">Nenhuma consulta salva. Monte uma em "Montar Nova Consulta Personalizada" e salve na tela de resultado.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome da Consulta</th>
                  <th>Visibilidade</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/reports/run?saved=${s.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
                        {s.name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge neutral">
                        {s.shared ? "Compartilhada na Fazenda" : "Privada"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <Link href={`/reports/run?saved=${s.id}`} className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }}>
                        Abrir
                      </Link>
                      {s.created_by === ctx.user.id && (
                        <form action={deleteReport}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmit className="btn ghost" label="Excluir" message="Excluir esta consulta salva?" />
                        </form>
                      )}
                    </td>
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
