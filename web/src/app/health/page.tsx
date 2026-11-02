import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createProduct, registerHealth } from "./actions";

export const instant = false;

const ERR: Record<string, string> = {
  vazio: "Informe o produto, a data e os animais (brincos ou lote).",
  tags: "Algum dos brincos informados não foi encontrado entre os animais ativos. Confira a lista.",
  perm: "Você não tem permissão para esta operação.",
  falha: "Não foi possível registrar. Confira a data (não pode ser futura), a próxima dose (deve ser depois da aplicação) e os animais (devem estar ativos).",
  produto: "Não foi possível cadastrar o produto. Confira o nome (deve ser único) e a carência (0 a 365 dias).",
};
const fmtDate = (d: string) => d.split("-").reverse().join("/");

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "health" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Controle Sanitário & Vacinas</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("health.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Controle Sanitário & Vacinas</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver a sanidade do rebanho.</p></div>
      </AppShell>
    );
  }
  const canCreate = perms.includes("health.create");

  const [alerts, products, lots, recent] = await Promise.all([
    supabase.rpc("health_alerts", { p_farm: a.id }),
    supabase.from("health_products").select("id, name, kind, withdrawal_days, active").eq("farm_id", a.id).order("name"),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("health_events").select("id, animal_id, product_id, event_date, next_due_date")
      .eq("farm_id", a.id).is("voided_at", null).order("created_at", { ascending: false }).limit(15),
  ]);
  const al: any = alerts.data ?? { overdue: 0, upcoming: 0, in_withdrawal: 0, items: [] };
  const prods: any[] = products.data ?? [];
  const recentRows: any[] = recent.data ?? [];
  const ids = [...new Set(recentRows.map((e) => e.animal_id))];
  const tagById = new Map<string, string>();
  if (ids.length) {
    const an = await supabase.from("animals").select("id, ear_tag").in("id", ids);
    (an.data ?? []).forEach((x: any) => tagById.set(x.id, x.ear_tag));
  }
  const prodName = (id: string) => prods.find((p) => p.id === id)?.name ?? "—";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Controle Sanitário & Vacinas</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Gestão de protocolos profiláticos, vacinações em lote e períodos de carência
          </p>
        </div>
      </div>

      {sp.ok === "produto" && <div className="flash">Produto cadastrado com sucesso no catálogo.</div>}
      {sp.ok && sp.ok !== "produto" && sp.ok !== "anulada" && <div className="flash">Aplicação registrada com sucesso em {sp.ok} animal(is).</div>}
      {sp.ok === "anulada" && <div className="flash">Aplicação anulada com sucesso.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      {/* Grid de Alertas Sanitários */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Doses Atrasadas</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="big" style={{ color: al.overdue > 0 ? "var(--red)" : "var(--ink)" }}>{al.overdue}</div>
          <small className="muted">Exigem atenção imediata</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">A Vencer (Próximos 30d)</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="big" style={{ color: al.upcoming > 0 ? "var(--amber)" : "var(--ink)" }}>{al.upcoming}</div>
          <small className="muted">Planejamento sanitário</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #059669" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Animais em Carência</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--brand)" }}>{al.in_withdrawal}</div>
          <small className="muted">Retenção de abate/venda</small>
        </div>
      </div>

      {/* Próximas Doses & Alertas */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Próximas Aplicações & Vacinas Agendadas</strong>
          <span className="badge neutral">{(al.items ?? []).length} pendência(s)</span>
        </div>
        {(al.items ?? []).length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ margin: 0, fontSize: 14 }}>Tudo em dia! Nenhuma dose atrasada ou a vencer nos próximos 30 dias.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Animal</th>
                  <th>Produto</th>
                  <th>Data de Vencimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(al.items as any[]).map((i, k) => (
                  <tr key={k}>
                    <td>
                      <Link href={`/herd/${i.animal_id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
                        Brinco #{i.ear_tag}
                      </Link>
                    </td>
                    <td><strong>{i.product}</strong></td>
                    <td>{fmtDate(i.due)}</td>
                    <td>
                      <span className={`badge ${i.status === "atrasada" ? "red" : "amber"}`}>
                        {i.status === "atrasada" ? `Atrasada desde ${fmtDate(i.due)}` : `Vence em ${fmtDate(i.due)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formulário de Aplicação em Lote */}
      {canCreate && (
        <form action={registerHealth} className="card">
          <strong>Lançar Aplicação Sanitária (Individual ou por Lote)</strong>
          <p className="muted" style={{ margin: "4px 0 16px", fontSize: 13.5 }}>
            Registre vacinas, vermífugos ou medicamentos. O sistema calcula a carência e atualiza a ficha de cada animal.
          </p>
          <input type="hidden" name="back" value="/health" />
          <div className="form2">
            <label>Produto Veterinário *
              <select name="product_id" required defaultValue="">
                <option value="" disabled>Selecione o produto</option>
                {prods.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.kind === "vacina" ? "Vacina" : "Medicamento"}{p.withdrawal_days > 0 ? ` · ${p.withdrawal_days}d carência` : ""})
                  </option>
                ))}
              </select>
            </label>
            <label>Data da Aplicação *<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Dose Aplicada<input name="dose" placeholder="Ex: 5 ml, 2 comprimidos" /></label>
            <label>Previsão da Próxima Dose<input name="next" type="date" /></label>
            <label>Lote do Fabricante / Partida<input name="product_lot" placeholder="Ex: LOTE-2026/A" /></label>
            <label>Observações do Procedimento<input name="notes" placeholder="Ex: Vacinação semestral contra febre aftosa" /></label>
            <label>Aplicar em Lote Inteiro
              <select name="lot_id" defaultValue="">
                <option value="">(Selecione um lote ou digite os brincos ao lado)</option>
                {(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>Todos os ativos do {l.name}</option>)}
              </select>
            </label>
            <label>Ou Brincos Específicos (separados por vírgula)
              <input name="tags" placeholder="Ex: 000101, 000102, 000103" />
            </label>
            <div style={{ alignSelf: "end" }}>
              <ConfirmSubmit className="btn" label="Registrar Aplicação" message="Registrar a aplicação nos animais selecionados? Cada animal terá o registro gravado em seu histórico." />
            </div>
          </div>
        </form>
      )}

      {/* Histórico Recente e Catálogo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 18 }}>
        {/* Histórico Recente */}
        <div className="card">
          <strong>Histórico Recente de Aplicações</strong>
          {recentRows.length === 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>Nenhuma aplicação recente registrada.</p>
          ) : (
            <div className="table-container" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Animal</th>
                    <th>Produto</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/herd/${e.animal_id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                          #{tagById.get(e.animal_id) ?? "—"}
                        </Link>
                      </td>
                      <td><strong>{prodName(e.product_id)}</strong></td>
                      <td>{fmtDate(e.event_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Catálogo de Produtos e Cadastro */}
        <div className="card">
          <strong>Catálogo de Produtos Sanitários</strong>
          <div className="table-container" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Carência</th>
                </tr>
              </thead>
              <tbody>
                {prods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {!p.active && <span className="muted"> (inativo)</span>}
                    </td>
                    <td><span className="badge neutral">{p.kind}</span></td>
                    <td>
                      {p.withdrawal_days > 0 ? (
                        <span className="badge amber">{p.withdrawal_days} dias</span>
                      ) : (
                        <span className="badge">Isento</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canCreate && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-secondary)" }}>+ Cadastrar Novo Medicamento / Vacina</span>
              <form action={createProduct} className="form2" style={{ marginTop: 10 }}>
                <label>Nome Comercial *<input name="name" required placeholder="Ex: Ivermectina 1%" /></label>
                <label>Classificação
                  <select name="kind" defaultValue="vacina">
                    <option value="vacina">Vacina</option>
                    <option value="medicamento">Medicamento / Vermífugo</option>
                  </select>
                </label>
                <label>Carência Sanitária (dias)<input name="withdrawal_days" inputMode="numeric" defaultValue="0" placeholder="0 se sem carência" /></label>
                <div style={{ alignSelf: "end" }}><button className="btn">Adicionar ao Catálogo</button></div>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}