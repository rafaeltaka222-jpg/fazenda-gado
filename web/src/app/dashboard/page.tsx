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
        <h1 className="title">Painel</h1>
        <div className="card">
          <p>Você ainda não tem acesso a nenhuma fazenda.</p>
          <Link href="/farms" className="btn">Criar a primeira fazenda</Link>
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
      <div className="head">
        <h1 className="title">Painel</h1>
        <span className="muted">{a.code} · {a.name} · <span className="cap">{a.role}</span></span>
      </div>

      {!sum ? (
        <div className="card">
          <p className="muted">Seu perfil não tem permissão para ver os indicadores do rebanho.</p>
        </div>
      ) : sum.active === 0 && sum.sold === 0 && sum.dead === 0 ? (
        <div className="card">
          <p>Nenhum animal cadastrado nesta fazenda ainda.</p>
          <Link href="/herd/new" className="btn">Cadastrar o primeiro animal</Link>
        </div>
      ) : (
        <>
          <div className="grid">
            <div className="card"><small className="muted">Animais ativos</small><div className="big">{sum.active}</div></div>
            <div className="card"><small className="muted">Machos</small><div className="big">{sum.males}</div></div>
            <div className="card"><small className="muted">Fêmeas</small><div className="big">{sum.females}</div></div>
            <div className="card"><small className="muted">Vendidos</small><div className="big">{sum.sold}</div></div>
            <div className="card"><small className="muted">Mortos</small><div className="big">{sum.dead}</div></div>
          </div>

          {canWeights ? (
            <div className="grid">
              <div className="card">
                <small className="muted">Peso médio (última pesagem)</small>
                <div className="big">{sum.avg_weight == null ? "—" : `${n1(sum.avg_weight)} kg`}</div>
                <div className="muted">{sum.weighed} de {sum.active} animais pesados</div>
              </div>
              <div className="card">
                <small className="muted">Ganho médio diário</small>
                <div className="big">{sum.avg_gmd == null ? "—" : `${n1(sum.avg_gmd, 2)} kg/dia`}</div>
                <div className="muted">Entre as duas últimas pesagens de cada animal</div>
              </div>
              <div className="card">
                <small className="muted">Alertas de pesagem</small>
                <div className="big">{sum.stale_60d + sum.never_weighed}</div>
                <div className="muted">
                  {sum.stale_60d} sem pesagem há mais de 60 dias · {sum.never_weighed} nunca pesado(s){" "}
                  {can("weighings.create") && <Link href="/weighings" style={{ color: "var(--green)", fontWeight: 600 }}>Pesar</Link>}
                </div>
              </div>
            </div>
          ) : (
            <div className="card"><p className="muted">Seu perfil não tem permissão para ver os indicadores de peso.</p></div>
          )}

          <div className="grid">
            <div className="card" style={{ gridColumn: "span 1" }}>
              <strong>Ativos por categoria</strong>
              {byCat.length === 0 ? (
                <p className="muted">Sem dados.</p>
              ) : (
                byCat.map((c) => (
                  <div key={c.name} style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{c.name}</span><strong>{c.count}</strong>
                    </div>
                    <div style={{ background: "#e7eae4", borderRadius: 6, height: 8 }}>
                      <div style={{ width: `${(c.count / maxCat) * 100}%`, background: "var(--green)", height: 8, borderRadius: 6 }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <strong>Ativos por lote</strong>
              <table className="table">
                <thead><tr><th>Lote</th><th>Animais</th>{canWeights && <th>Peso médio (kg)</th>}</tr></thead>
                <tbody>
                  {byLot.map((l) => (
                    <tr key={l.name}>
                      <td>{l.name}</td><td>{l.count}</td>{canWeights && <td>{n1(l.avg_weight)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {hs && (
        <div className="card">
          <strong>Sanidade</strong>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><small className="muted">Doses atrasadas</small><div className="big">{hs.overdue}</div></div>
            <div><small className="muted">A vencer em 30 dias</small><div className="big">{hs.upcoming}</div></div>
            <div><small className="muted">Animais em carência</small><div className="big">{hs.in_withdrawal}</div></div>
          </div>
          <p style={{ marginTop: 12 }}><Link href="/health" style={{ color: "var(--green)", fontWeight: 600 }}>Ver detalhes de sanidade</Link></p>
        </div>
      )}

      {st && (
        <div className="card">
          <strong>Estoque</strong>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><small className="muted">Itens abaixo do mínimo</small><div className="big">{st.low}</div></div>
            <div><small className="muted">Validade em até 30 dias</small><div className="big">{st.expiring}</div></div>
          </div>
          <p style={{ marginTop: 12 }}><Link href="/stock" style={{ color: "var(--green)", fontWeight: 600 }}>Ver estoque</Link></p>
        </div>
      )}

      {trend.length > 0 && (
        <div className="card">
          <strong>Peso médio por mês</strong>
          <LineChart points={trend} unit="kg" title="Evolução do peso médio das pesagens por mês" />
          <p className="muted">Média de todas as pesagens válidas de cada mês (últimos 6 meses).</p>
        </div>
      )}

      {tk && (
        <div className="card">
          <strong>Tarefas</strong>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><small className="muted">Atrasadas</small><div className="big">{tk.overdue}</div></div>
            <div><small className="muted">Para hoje</small><div className="big">{tk.today}</div></div>
            <div><small className="muted">Próximos 7 dias</small><div className="big">{tk.next7}</div></div>
            <div><small className="muted">Abertas</small><div className="big">{tk.open}</div></div>
          </div>
          <p style={{ marginTop: 12 }}><Link href="/tasks" style={{ color: "var(--green)", fontWeight: 600 }}>Ver tarefas</Link></p>
        </div>
      )}

      {rp && (
        <div className="card">
          <strong>Reprodução</strong>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><small className="muted">Prenhas</small><div className="big">{rp.prenha}</div></div>
            <div><small className="muted">Partos previstos em 30 dias</small><div className="big">{rp.calving_30d}</div></div>
            <div><small className="muted">Partos atrasados</small><div className="big">{rp.overdue_calving}</div></div>
            <div><small className="muted">Nascimentos em 30 dias</small><div className="big">{rp.births_30d}</div></div>
          </div>
          <p style={{ marginTop: 12 }}><Link href="/reproduction" style={{ color: "var(--green)", fontWeight: 600 }}>Ver reprodução</Link></p>
        </div>
      )}

      {sl && (
        <div className="card">
          <strong>Vendas no mês</strong>
          <div className="grid" style={{ marginTop: 12 }}>
            <div><small className="muted">Receita</small><div className="big">{Number(sl.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></div>
            <div><small className="muted">Animais vendidos</small><div className="big">{sl.animals}</div></div>
          </div>
          <p style={{ marginTop: 12 }}><Link href="/sales" style={{ color: "var(--green)", fontWeight: 600 }}>Ver vendas</Link></p>
        </div>
      )}

      {can("movements.view") && (
        <div className="card">
          <strong>Últimas movimentações</strong>
          {events.length === 0 ? (
            <p className="muted">Nenhuma movimentação registrada.</p>
          ) : (
            events.map((e) => (
              <div className="row" key={e.id}>
                <span>
                  <Link href={`/herd/${e.animal_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{tagById.get(e.animal_id) ?? "—"}</Link>
                  <span className="muted"> · {LABEL[e.event_type] ?? e.event_type}</span>
                </span>
                <span className="muted">{fmtDate(e.event_date)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <p className="muted">
        TODO: contas a pagar e a receber aparecem aqui quando esses módulos existirem.
        Nenhum número desta tela é inventado: tudo vem dos dados cadastrados.
      </p>
    </AppShell>
  );
}
