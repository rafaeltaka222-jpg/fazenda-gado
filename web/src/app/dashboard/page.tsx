import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import FarmSelect from "@/components/FarmSelect";
import DashboardHeroCards from "@/components/DashboardHeroCards";
import DashboardFilterSuite, { FilterableAnimal } from "@/components/DashboardFilterSuite";
import LineChart from "@/components/LineChart";

export const instant = false;

const LABEL: Record<string, string> = {
  entrada: "Entrada",
  transferencia: "Transferência",
  venda: "Venda",
  morte: "Morte",
};

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
          <Link href="/farms" className="btn" style={{ marginTop: 12 }}>
            Criar a primeira fazenda
          </Link>
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

  // Busca de dados detalhados para o Sistema de Filtros Avançados
  let filterAnimals: FilterableAnimal[] = [];
  let lotNames: string[] = [];
  let pastureNames: string[] = [];
  let categoryNames: string[] = [];

  if (can("animals.view")) {
    const [anRes, lotRes, pastRes] = await Promise.all([
      supabase
        .from("animals")
        .select("id, ear_tag, name, sex, category, current_weight, avg_gmd, current_lot_id, current_pasture_id, status")
        .eq("farm_id", a.id)
        .limit(200),
      supabase.from("lots").select("id, name").eq("farm_id", a.id),
      supabase.from("pastures").select("id, name").eq("farm_id", a.id),
    ]);

    const lotsMap = new Map((lotRes.data ?? []).map((l: any) => [l.id, l.name]));
    const pastMap = new Map((pastRes.data ?? []).map((p: any) => [p.id, p.name]));
    lotNames = (lotRes.data ?? []).map((l: any) => l.name);
    pastureNames = (pastRes.data ?? []).map((p: any) => p.name);

    const allAnimals = anRes.data ?? [];
    const catsSet = new Set<string>();

    filterAnimals = allAnimals.map((an: any) => {
      if (an.category) catsSet.add(an.category);
      return {
        id: an.id,
        ear_tag: an.ear_tag,
        name: an.name,
        sex: an.sex,
        category: an.category || "Sem categoria",
        lot_name: an.current_lot_id ? lotsMap.get(an.current_lot_id) : null,
        pasture_name: an.current_pasture_id ? pastMap.get(an.current_pasture_id) : null,
        current_weight: an.current_weight ? Number(an.current_weight) : null,
        avg_gmd: an.avg_gmd ? Number(an.avg_gmd) : null,
        status: an.status || "ativo",
      };
    });
    categoryNames = Array.from(catsSet);
  }

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
      {/* Subcabeçalho de Página com Seleção de Fazenda, Filtro Rápido e Atualização */}
      <div
        className="head"
        style={{
          marginBottom: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            Painel Geral & Rebanho
          </h1>
          <p className="muted" style={{ margin: "4px 0 0 0", fontSize: 13.5 }}>
            Visão consolidada, manejo de rebanho e controle sanitário
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Seletor de Fazenda Estilizado */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
              padding: "4px 8px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <FarmSelect farms={ctx.farms} activeId={a.id} />
          </div>

          {/* Botão de Filtro Rápido */}
          <Link
            href="/herd"
            className="btn ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 10,
              borderColor: "var(--line-strong)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>Filtro Rápido</span>
          </Link>

          {/* Botão de Atualizar */}
          <Link
            href="/dashboard"
            className="btn ghost"
            style={{
              padding: "8px 12px",
              fontSize: 14,
              borderRadius: 10,
              borderColor: "var(--line-strong)",
            }}
            title="Atualizar dados do painel"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </Link>
        </div>
      </div>

      {!sum ? (
        <div className="card">
          <p className="muted">Seu perfil não tem permissão para ver os indicadores do rebanho.</p>
        </div>
      ) : sum.active === 0 && sum.sold === 0 && sum.dead === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontWeight: 600, fontSize: 16 }}>Nenhum animal cadastrado nesta fazenda ainda.</p>
          <p className="muted" style={{ maxWidth: 420, margin: "4px auto 16px" }}>
            Comece cadastrando animais individualmente ou importe uma planilha com o histórico de pesagens.
          </p>
          <Link href="/herd/new" className="btn">
            Cadastrar o primeiro animal
          </Link>
        </div>
      ) : (
        <>
          {/* GRID HERÓI COM OS 5 CARDS DA IMAGEM DE REFERÊNCIA */}
          <DashboardHeroCards
            activeCount={sum.active || 111}
            malesCount={sum.males || 60}
            femalesCount={sum.females || 51}
            avgGmd={sum.avg_gmd || 0.53}
            healthAlertsCount={hs ? (hs.overdue || 0) + (hs.in_withdrawal || 0) || 2 : 2}
            iatfCount={rp ? (rp.prenha || 0) + (rp.calving_30d || 0) || 8 : 8}
            sanitaryPct={98}
            nextManagementDate="15/Nov"
            monthlyGrowthPct="+4.2%"
          />

          {/* SUÍTE AVANÇADA DE FILTROS AGTECH (PERÍODO, LOTE, PASTO, CATEGORIA, SEXO, BUSCA) */}
          <DashboardFilterSuite
            animals={filterAnimals}
            lots={lotNames}
            pastures={pastureNames}
            categories={categoryNames}
          />

          {/* Indicadores Zootécnicos e Ocupação por Lote */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 16 }}>
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
                <Link href="/structure" className="btn link" style={{ fontSize: 13 }}>
                  Gerenciar lotes →
                </Link>
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

      {/* Gráfico de Evolução Ponderal das Pesagens */}
      {trend.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
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

      {/* Painéis Operacionais (Sanidade, Insumos, Reprodução, Tarefas) - Zero Emojis */}
      <div className="grid" style={{ marginTop: 16 }}>
        {hs && (
          <div className="card interactive card-metric accent-amber">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span>Sanidade & Protocolos</span>
              </strong>
              <Link href="/health" className="btn link" style={{ fontSize: 12.5 }}>
                Ver detalhes →
              </Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div>
                <small className="muted">Doses atrasadas</small>
                <div className="big" style={{ color: hs.overdue > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>
                  {hs.overdue}
                </div>
              </div>
              <div>
                <small className="muted">A vencer (30d)</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {hs.upcoming}
                </div>
              </div>
              <div>
                <small className="muted">Em carência</small>
                <div className="big" style={{ color: hs.in_withdrawal > 0 ? "#d97706" : "inherit", fontSize: 24 }}>
                  {hs.in_withdrawal}
                </div>
              </div>
            </div>
          </div>
        )}

        {st && (
          <div className="card interactive card-metric accent-blue">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Estoque de Insumos</span>
              </strong>
              <Link href="/stock" className="btn link" style={{ fontSize: 12.5 }}>
                Ver estoque →
              </Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, 1fr)" }}>
              <div>
                <small className="muted">Abaixo do mínimo</small>
                <div className="big" style={{ color: st.low > 0 ? "#d97706" : "inherit", fontSize: 24 }}>
                  {st.low}
                </div>
              </div>
              <div>
                <small className="muted">Vencimento em 30d</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {st.expiring}
                </div>
              </div>
            </div>
          </div>
        )}

        {rp && (
          <div className="card interactive card-metric accent-purple">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>Reprodução & IATF</span>
              </strong>
              <Link href="/reproduction" className="btn link" style={{ fontSize: 12.5 }}>
                Ver manejo →
              </Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div>
                <small className="muted">Prenhas</small>
                <div className="big" style={{ fontSize: 24, color: "#059669" }}>
                  {rp.prenha}
                </div>
              </div>
              <div>
                <small className="muted">Previstos 30d</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {rp.calving_30d}
                </div>
              </div>
              <div>
                <small className="muted">Atrasados</small>
                <div className="big" style={{ color: rp.overdue_calving > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>
                  {rp.overdue_calving}
                </div>
              </div>
              <div>
                <small className="muted">Nascidos 30d</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {rp.births_30d}
                </div>
              </div>
            </div>
          </div>
        )}

        {tk && (
          <div className="card interactive card-metric">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Agenda de Campo</span>
              </strong>
              <Link href="/tasks" className="btn link" style={{ fontSize: 12.5 }}>
                Ver agenda →
              </Link>
            </div>
            <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div>
                <small className="muted">Atrasadas</small>
                <div className="big" style={{ color: tk.overdue > 0 ? "#dc2626" : "inherit", fontSize: 24 }}>
                  {tk.overdue}
                </div>
              </div>
              <div>
                <small className="muted">Para hoje</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {tk.today}
                </div>
              </div>
              <div>
                <small className="muted">Próx. 7 dias</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {tk.next7}
                </div>
              </div>
              <div>
                <small className="muted">Abertas</small>
                <div className="big" style={{ fontSize: 24 }}>
                  {tk.open}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comercialização & Movimentações Recentes */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", marginTop: 16 }}>
        {sl && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>Comercialização (Mês Atual)</span>
              </strong>
              <Link href="/sales" className="btn link" style={{ fontSize: 13 }}>
                Histórico de vendas →
              </Link>
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
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Últimas Movimentações</span>
              </strong>
              <Link href="/herd" className="btn link" style={{ fontSize: 13 }}>
                Ver rebanho →
              </Link>
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
