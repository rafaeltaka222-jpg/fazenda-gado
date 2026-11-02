import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LineChart from "@/components/LineChart";

export const instant = false;

const LABEL: Record<string, string> = { entrada: "Entrada", transferencia: "Transferência", venda: "Venda", morte: "Morte" };
const n1 = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (d: string) => d.split("-").reverse().join("/");

export default async function DashboardPage() {
  await connection();
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "dashboard" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Painel Geral</h1>
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: 16, color: "var(--muted)" }}>Você ainda não tem acesso a nenhuma fazenda.</p>
          <Link href="/farms" className="btn" style={{ marginTop: 12 }}>Criar a primeira fazenda</Link>
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const permsRes = await supabase.rpc("my_permissions", { p_farm: a.id });
  const perms: string[] = (permsRes.data as string[] | null) ?? [];
  const can = (p: string) => perms.includes(p);

  const sum: any = can("animals.view") ? (await supabase.rpc("dashboard_summary", { p_farm: a.id })).data : null;
  const hs: any = can("health.view") ? (await supabase.rpc("health_alerts", { p_farm: a.id })).data : null;
  const st: any = can("inventory.view") ? (await supabase.rpc("stock_alerts", { p_farm: a.id })).data : null;

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const rp: any = can("reproduction.view") ? (await supabase.rpc("reproduction_alerts", { p_farm: a.id })).data : null;
  const sl: any = can("trade.view")
    ? (await supabase.rpc("sales_summary", { p_farm: a.id, p_from: todayStr.slice(0, 8) + "01", p_to: todayStr })).data
    : null;

  const trendRes = can("weighings.view") ? await supabase.rpc("weight_trend", { p_farm: a.id, p_months: 6 }) : null;
  const trend = ((trendRes?.data ?? []) as any[]).map((t) => ({
    label: `${t.month.slice(5, 7)}/${t.month.slice(2, 4)}`,
    value: Number(t.avg_weight),
  }));
  const tk: any = can("tasks.view") ? (await supabase.rpc("tasks_summary", { p_farm: a.id })).data : null;

  let events: any[] = [];
  let tagById = new Map<string, string>();
  if (can("movements.view")) {
    const ev = await supabase
      .from("animal_events")
      .select("id, animal_id, event_type, event_date, created_at")
      .eq("farm_id", a.id)
      .order("created_at", { ascending: false })
      .limit(8);
    events = ev.data ?? [];
    const ids = [...new Set(events.map((e) => e.animal_id))];
    if (ids.length) {
      const an = await supabase.from("animals").select("id, ear_tag").in("id", ids);
      tagById = new Map((an.data ?? []).map((x: any) => [x.id, x.ear_tag]));
    }
  }

  const byCat: { name: string; count: number }[] = sum?.by_category ?? [];
  const byLot: { name: string; count: number; avg_weight: number | null }[] = sum?.by_lot ?? [];
  const maxCat = Math.max(1, ...byCat.map((c) => c.count));
  const canWeights = can("weighings.view");

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="title">Painel Operacional</h1>
          <p className="muted" style={{ margin: "4px 0 0 0", fontSize: 14 }}>
            Visão consolidada do rebanho, sanidade, pesagens e finanças da fazenda.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669" }} />
            {a.code} · {a.name}
          </span>
          <span className="badge neutral cap">{a.role}</span>
        </div>
      </div>

      {!sum ? (
        <div className="card">
          <p className="muted">Seu perfil não tem permissão para ver os indicadores do rebanho.</p>
        </div>
      ) : sum.active === 0 && sum.sold === 0 && sum.dead === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🐂</div>
          <p style={{ fontWeight: 600, fontSize: 16 }}>Nenhum animal cadastrado nesta fazenda ainda.</p>
          <p className="muted" style={{ maxWidth: 420, margin: "4px auto 16px" }}>
            Comece cadastrando animais individualmente ou importe uma planilha com o histórico de pesagens.
          </p>
          <Link href="/herd/new" className="btn">Cadastrar o primeiro animal</Link>
        </div>
      ) : (
        <>
          {/* Faixa de KPIs Primários do Rebanho */}
          <div className="grid">
            <div className="card interactive card-metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Rebanho Ativo</small>
                <span style={{ fontSize: 18 }}>🐂</span>
              </div>
              <div className="big">{sum.active}</div>
              <small className="muted" style={{ marginTop: 4 }}>cabeças na fazenda</small>
            </div>

            <div className="card interactive card-metric accent-blue">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Machos</small>
                <span style={{ fontSize: 18 }}>♂️</span>
              </div>
              <div className="big">{sum.males}</div>
              <small className="muted" style={{ marginTop: 4 }}>
                {sum.active > 0 ? `${((sum.males / sum.active) * 100).toFixed(0)}% do rebanho` : "—"}
              </small>
            </div>

            <div className="card interactive card-metric accent-purple">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Fêmeas</small>
                <span style={{ fontSize: 18 }}>♀️</span>
              </div>
              <div className="big">{sum.females}</div>
              <small className="muted" style={{ marginTop: 4 }}>
                {sum.active > 0 ? `${((sum.females / sum.active) * 100).toFixed(0)}% do rebanho` : "—"}
              </small>
            </div>

            <div className="card interactive card-metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Vendidos</small>
                <span style={{ fontSize: 18 }}>🏷️</span>
              </div>
              <div className="big">{sum.sold}</div>
              <small className="muted" style={{ marginTop: 4 }}>baixas por venda</small>
            </div>

            <div className="card interactive card-metric accent-amber">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Mortalidade</small>
                <span style={{ fontSize: 18 }}>⚠️</span>
              </div>
              <div className="big">{sum.dead}</div>
              <small className="muted" style={{ marginTop: 4 }}>
                {sum.active + sum.dead > 0 ? `${((sum.dead / (sum.active + sum.dead)) * 100).toFixed(1)}% taxa acumulada` : "0%"}
              </small>
            </div>
          </div>

          {/* Performance de Pesagem e Ganho de Peso */}
          {canWeights ? (
            <div className="grid">
              <div className="card interactive card-metric accent-blue">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <small className="muted" style={{ fontWeight: 600 }}>Peso Médio do Rebanho</small>
                  <span style={{ fontSize: 18 }}>⚖️</span>
                </div>
                <div className="big">{sum.avg_weight == null ? "—" : `${n1(sum.avg_weight)} kg`}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  <strong>{sum.weighed}</strong> de {sum.active} animais com pesagem registrada
                </div>
              </div>

              <div className="card interactive card-metric">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <small className="muted" style={{ fontWeight: 600 }}>GMD (Ganho Médio Diário)</small>
                  <span style={{ fontSize: 18 }}>📈</span>
                </div>
                <div className="big" style={{ color: Number(sum.avg_gmd) > 0 ? "#059669" : "inherit" }}>
                  {sum.avg_gmd == null ? "—" : `+${n1(sum.avg_gmd, 2)} kg/dia`}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  Cálculo entre as duas últimas pesagens individuais
                </div>
              </div>

              <div className="card interactive card-metric accent-amber">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <small className="muted" style={{ fontWeight: 600 }}>Alertas de Manejo de Peso</small>
                  <span style={{ fontSize: 18 }}>🔔</span>
                </div>
                <div className="big" style={{ color: (sum.stale_60d + sum.never_weighed) > 0 ? "#d97706" : "inherit" }}>
                  {sum.stale_60d + sum.never_weighed}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{sum.stale_60d} há &gt;60d · {sum.never_weighed} sem peso</span>
                  {can("weighings.create") && (
                    <Link href="/weighings" className="btn link" style={{ fontWeight: 700, fontSize: 13 }}>
                      Pesar agora →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card"><p className="muted">Seu perfil não tem permissão para ver os indicadores de peso.</p></div>
          )}

          {/* Distribuição por Categoria e por Lote */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <strong>Rebanho por Categoria</strong>
                <span className="badge neutral">{byCat.length} categorias</span>
              </div>
              {byCat.length === 0 ? (
                <p className="muted">Sem dados cadastrados.</p>
              ) : (
                byCat.map((c) => (
                  <div key={c.name} style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <strong>{c.count} cab.</strong>
                    </div>
                    <div style={{ background: "var(--bg-subtle)", borderRadius: 999, height: 7, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(c.count / maxCat) * 100}%`,
                          background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                          height: 7,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <strong>Ocupação por Lote</strong>
                <Link href="/structure" className="btn link" style={{ fontSize: 13 }}>Gerenciar lotes →</Link>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Animais</th>
                      {canWeights && <th>Peso Médio</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {byLot.map((l) => (
                      <tr key={l.name}>
                        <td style={{ fontWeight: 600 }}>{l.name}</td>
                        <td>{l.count} cab.</td>
                        {canWeights && <td>{n1(l.avg_weight)} kg</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Gráfico de Evolução Ponderal */}
      {trend.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <strong style={{ fontSize: 16 }}>Evolução do Peso Médio</strong>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                Acompanhamento ponderal das pesagens válidas nos últimos 6 meses.
              </p>
            </div>
            <Link href="/weighings" className="btn ghost" style={{ fontSize: 13 }}>
              Histórico de pesagens
            </Link>
          </div>
          <LineChart points={trend} unit="kg" title="Evolução do peso médio das pesagens por mês" />
        </div>
      )}

      {/* Painéis de Operação (Sanidade, Estoque, Tarefas, Reprodução) */}
      <div className="grid">
        {hs && (
          <div className="card interactive card-metric accent-amber">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>💉</span> Sanidade
              </strong>
              <Link href="/health" className="btn link" style={{ fontSize: 12.5 }}>Ver detalhes →</Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div>
                <small className="muted">Doses atrasadas</small>
                <div className="big" style={{ color: hs.overdue > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>{hs.overdue}</div>
              </div>
              <div>
                <small className="muted">A vencer (30d)</small>
                <div className="big" style={{ fontSize: 24 }}>{hs.upcoming}</div>
              </div>
              <div>
                <small className="muted">Em carência</small>
                <div className="big" style={{ color: hs.in_withdrawal > 0 ? "#d97706" : "inherit", fontSize: 24 }}>{hs.in_withdrawal}</div>
              </div>
            </div>
          </div>
        )}

        {st && (
          <div className="card interactive card-metric accent-blue">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>📦</span> Estoque e Insumos
              </strong>
              <Link href="/stock" className="btn link" style={{ fontSize: 12.5 }}>Ver estoque →</Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div>
                <small className="muted">Abaixo do mínimo</small>
                <div className="big" style={{ color: st.low > 0 ? "#d97706" : "inherit", fontSize: 24 }}>{st.low}</div>
              </div>
              <div>
                <small className="muted">Vencimento em 30d</small>
                <div className="big" style={{ fontSize: 24 }}>{st.expiring}</div>
              </div>
            </div>
          </div>
        )}

        {rp && (
          <div className="card interactive card-metric accent-purple">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>🧬</span> Reprodução
              </strong>
              <Link href="/reproduction" className="btn link" style={{ fontSize: 12.5 }}>Ver manejo →</Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div>
                <small className="muted">Prenhas</small>
                <div className="big" style={{ fontSize: 24, color: "#059669" }}>{rp.prenha}</div>
              </div>
              <div>
                <small className="muted">Previstos 30d</small>
                <div className="big" style={{ fontSize: 24 }}>{rp.calving_30d}</div>
              </div>
              <div>
                <small className="muted">Atrasados</small>
                <div className="big" style={{ color: rp.overdue_calving > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>{rp.overdue_calving}</div>
              </div>
              <div>
                <small className="muted">Nascidos 30d</small>
                <div className="big" style={{ fontSize: 24 }}>{rp.births_30d}</div>
              </div>
            </div>
          </div>
        )}

        {tk && (
          <div className="card interactive card-metric">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>📋</span> Agenda e Tarefas
              </strong>
              <Link href="/tasks" className="btn link" style={{ fontSize: 12.5 }}>Ver agenda →</Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div>
                <small className="muted">Atrasadas</small>
                <div className="big" style={{ color: tk.overdue > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>{tk.overdue}</div>
              </div>
              <div>
                <small className="muted">Para hoje</small>
                <div className="big" style={{ fontSize: 24 }}>{tk.today}</div>
              </div>
              <div>
                <small className="muted">Próx. 7 dias</small>
                <div className="big" style={{ fontSize: 24 }}>{tk.next7}</div>
              </div>
              <div>
                <small className="muted">Abertas</small>
                <div className="big" style={{ fontSize: 24 }}>{tk.open}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vendas e Histórico de Movimentações */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {sl && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>💰</span> Comercialização (Mês Atual)
              </strong>
              <Link href="/sales" className="btn link" style={{ fontSize: 13 }}>Histórico de vendas →</Link>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="card" style={{ background: "var(--brand-light)", border: "1px solid var(--brand-border)" }}>
                <small style={{ color: "var(--brand-hover)", fontWeight: 600 }}>Faturamento do Mês</small>
                <div className="big" style={{ color: "#065f46" }}>
                  {Number(sl.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
              <div className="card" style={{ background: "var(--bg-subtle)", border: "1px solid var(--line)" }}>
                <small className="muted" style={{ fontWeight: 600 }}>Animais Comercializados</small>
                <div className="big">{sl.animals} cab.</div>
              </div>
            </div>
          </div>
        )}

        {can("movements.view") && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>🔄</span> Últimas Movimentações
              </strong>
              <Link href="/herd" className="btn link" style={{ fontSize: 13 }}>Ver rebanho →</Link>
            </div>
            {events.length === 0 ? (
              <p className="muted">Nenhuma movimentação registrada.</p>
            ) : (
              events.map((e) => (
                <div className="row" key={e.id} style={{ padding: "10px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge neutral">Brinco</span>
                    <Link href={`/herd/${e.animal_id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
                      {tagById.get(e.animal_id) ?? "—"}
                    </Link>
                    <span className="muted" style={{ fontSize: 13 }}>· {LABEL[e.event_type] ?? e.event_type}</span>
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(e.event_date)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
