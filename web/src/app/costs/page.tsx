import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createCost, voidCost } from "./actions";


const CAT: Record<string, string> = {
  racao: "Ração e Suplementos",
  sanidade: "Sanidade & Medicamentos",
  mao_de_obra: "Mão de Obra",
  combustivel: "Combustível",
  manutencao: "Manutenção & Benfeitorias",
  outros: "Outros Custos Operacionais",
};
const TARGET: Record<string, string> = { fazenda: "Fazenda (Geral)", lote: "Lote Específico", pasto: "Pasto / Piquete", animal: "Animal Individual" };
const ERR: Record<string, string> = {
  perm: "Você não tem permissão para esta operação.",
  animal: "Brinco informado não foi encontrado nesta fazenda.",
  alvo: "Escolha o lote ou o pasto correspondente ao custo.",
  falha: "Não foi possível registrar o custo. Confira valor, data e descrição.",
};
const money = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "costs" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Gestão Financeira & Custos</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("costs.view")) {
    redirect("/dashboard?erro=sem_permissao");
  }
  const canCreate = perms.includes("costs.create");
  const canUpdate = perms.includes("costs.update");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const de = sp.de && DATE.test(sp.de) ? sp.de : today.slice(0, 8) + "01";
  const ate = sp.ate && DATE.test(sp.ate) ? sp.ate : today;

  const [sum, list, lots, pastures] = await Promise.all([
    supabase.rpc("cost_summary", { p_farm: a.id, p_from: de, p_to: ate }),
    supabase.from("cost_entries").select("id, cost_date, description, category, amount, target_type, stock_movement_id")
      .eq("farm_id", a.id).is("voided_at", null).gte("cost_date", de).lte("cost_date", ate).order("cost_date", { ascending: false }).limit(40),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const s: any = sum.data ?? { total: 0, by_category: [], by_lot: [], by_pasture: [], by_target: [] };

  return (
    <AppShell {...shell}>
      <div className="head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Gestão Financeira: Custos & Despesas
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Apropriação de despesas por lote, pasto ou animal, e apuração de custo por cabeça
            </p>
          </div>
        </div>
      </div>

      {sp.ok && <div className="flash">Lançamento financeiro concluído com sucesso.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      {/* Filtro de Período */}
      <form className="card filters" method="get" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <label>Data Inicial<input type="date" name="de" defaultValue={de} /></label>
          <label>Data Final<input type="date" name="ate" defaultValue={ate} /></label>
          <button className="btn" style={{ height: 42 }}>Filtrar Período</button>
        </div>
      </form>

      {/* Grid de Resumo Financeiro */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Custo Total no Período</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--red)" }}>{money(s.total)}</div>
          <small className="muted">Despesas operacionais acumuladas</small>
        </div>

        {(s.by_category as any[]).slice(0, 4).map((c) => (
          <div className="card" key={c.category}>
            <small className="muted">{CAT[c.category] ?? c.category}</small>
            <div className="big">{money(c.amount)}</div>
            <small className="muted">
              {s.total > 0 ? `${Math.round((c.amount / s.total) * 100)}% do total` : "—"}
            </small>
          </div>
        ))}
      </div>

      {/* Detalhamento por Lote e Pasto */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>Custo Apropriado por Lote</strong>
            <span className="badge neutral">Por Cabeça</span>
          </div>
          {(s.by_lot as any[]).length === 0 ? (
            <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>Sem custos diretos alocados a lotes no período.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Total</th>
                    <th>Animais</th>
                    <th style={{ textAlign: "right" }}>R$ / Cabeça</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.by_lot as any[]).map((l) => (
                    <tr key={l.lot}>
                      <td><strong>{l.lot}</strong></td>
                      <td>{money(l.amount)}</td>
                      <td>{l.heads} cab.</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{l.per_head == null ? "—" : money(l.per_head)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>Custo Apropriado por Pasto</strong>
            <span className="badge neutral">Manejo de Solo & Pasto</span>
          </div>
          {(s.by_pasture as any[]).length === 0 ? (
            <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>Sem custos alocados a pastos no período.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Pasto / Piquete</th>
                    <th style={{ textAlign: "right" }}>Total Aplicado</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.by_pasture as any[]).map((p) => (
                    <tr key={p.pasture}>
                      <td><strong>{p.pasture}</strong></td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lançamento de Novo Custo */}
      {canCreate && (
        <form action={createCost} className="card">
          <strong>+ Lançar Nova Despesa Operacional</strong>
          <div className="form2" style={{ marginTop: 14 }}>
            <label>Data de Competência *<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Descrição do Custo *<input name="description" required placeholder="Ex: Compra de sal mineral proteinado 30kg" /></label>
            <label>Categoria de Despesa
              <select name="category" defaultValue="racao">
                {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Valor Total (R$) *<input name="amount" inputMode="decimal" required placeholder="Ex: 3450.00" /></label>
            <label>Centro de Custo / Alocação
              <select name="target_type" defaultValue="lote">
                {Object.entries(TARGET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Lote Alvo (se aplicável)
              <select name="lot_id" defaultValue=""><option value="">—</option>{(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label>Pasto Alvo (se aplicável)
              <select name="pasture_id" defaultValue=""><option value="">—</option>{(pastures.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label>Brinco (se custo individual)<input name="ear_tag" placeholder="Brinco do animal" /></label>
            <label style={{ gridColumn: "1 / -1" }}>Observações Adicionais<input name="notes" placeholder="Fornecedor, nota fiscal, etc." /></label>
            <div style={{ alignSelf: "end", gridColumn: "1 / -1" }}>
              <ConfirmSubmit className="btn" label="Lançar Despesa" message="Confirmar o lançamento financeiro?" />
            </div>
          </div>
        </form>
      )}

      {/* Livro Razão de Lançamentos */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Lançamentos do Período ({((list.data ?? []) as any[]).length})</strong>
        </div>
        {((list.data ?? []) as any[]).length === 0 ? (
          <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>Nenhum custo lançado no período.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Alocação</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {((list.data ?? []) as any[]).map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.cost_date)}</td>
                    <td><strong>{c.description}</strong></td>
                    <td><span className="badge neutral">{CAT[c.category] ?? c.category}</span></td>
                    <td><span className="muted">{TARGET[c.target_type]}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--red)" }}>{money(c.amount)}</td>
                    <td style={{ textAlign: "right" }}>
                      {canUpdate && !c.stock_movement_id && (
                        <form action={voidCost} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="id" value={c.id} />
                          <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo anulação" style={{ width: 120, padding: "5px 8px", fontSize: 12.5 }} />
                          <ConfirmSubmit className="btn ghost" label="Anular" message="Anular este lançamento de custo?" />
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