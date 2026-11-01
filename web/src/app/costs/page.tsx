import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createCost, voidCost } from "./actions";

export const instant = false;

const CAT: Record<string, string> = { racao: "Ração e suplementos", sanidade: "Sanidade", mao_de_obra: "Mão de obra", combustivel: "Combustível", manutencao: "Manutenção", outros: "Outros" };
const TARGET: Record<string, string> = { fazenda: "Fazenda (geral)", lote: "Lote", pasto: "Pasto", animal: "Animal" };
const ERR: Record<string, string> = {
  perm: "Você não tem permissão para esta operação.", animal: "Brinco não encontrado nesta fazenda.",
  alvo: "Escolha o lote ou o pasto do custo.", falha: "Não foi possível registrar. Confira valor, data e descrição.",
};
const money = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; de?: string; ate?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "costs" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Custos</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("costs.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Custos</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver os custos.</p></div>
      </AppShell>
    );
  }
  const canCreate = perms.includes("costs.create");
  const canUpdate = perms.includes("costs.update");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const de = sp.de && DATE.test(sp.de) ? sp.de : today.slice(0, 8) + "01";
  const ate = sp.ate && DATE.test(sp.ate) ? sp.ate : today;

  const [sum, list, lots, pastures] = await Promise.all([
    supabase.rpc("cost_summary", { p_farm: a.id, p_from: de, p_to: ate }),
    supabase.from("cost_entries").select("id, cost_date, description, category, amount, target_type, stock_movement_id")
      .eq("farm_id", a.id).is("voided_at", null).gte("cost_date", de).lte("cost_date", ate).order("cost_date", { ascending: false }).limit(30),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const s: any = sum.data ?? { total: 0, by_category: [], by_lot: [], by_pasture: [], by_target: [] };

  return (
    <AppShell {...shell}>
      <h1 className="title">Custos</h1>
      {sp.ok && <div className="flash">Operação concluída.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      <form className="card filters" method="get">
        <label>De<input type="date" name="de" defaultValue={de} /></label>
        <label>Até<input type="date" name="ate" defaultValue={ate} /></label>
        <button className="btn">Filtrar</button>
      </form>

      <div className="grid">
        <div className="card"><small className="muted">Total no período</small><div className="big">{money(s.total)}</div></div>
        {(s.by_category as any[]).map((c) => (
          <div className="card" key={c.category}><small className="muted">{CAT[c.category] ?? c.category}</small><div className="big">{money(c.amount)}</div></div>
        ))}
      </div>

      <div className="grid">
        <div className="card" style={{ overflowX: "auto" }}>
          <strong>Custo por lote</strong>
          {(s.by_lot as any[]).length === 0 ? <p className="muted">Sem custos lançados em lotes.</p> : (
            <table className="table"><thead><tr><th>Lote</th><th>Total</th><th>Animais ativos</th><th>Por cabeça</th></tr></thead>
              <tbody>{(s.by_lot as any[]).map((l) => (
                <tr key={l.lot}><td>{l.lot}</td><td>{money(l.amount)}</td><td>{l.heads}</td><td>{l.per_head == null ? "—" : money(l.per_head)}</td></tr>
              ))}</tbody></table>
          )}
          <p className="muted">Por cabeça = custo do lote ÷ animais ativos hoje no lote (aproximação).</p>
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <strong>Custo por pasto</strong>
          {(s.by_pasture as any[]).length === 0 ? <p className="muted">Sem custos lançados em pastos.</p> : (
            <table className="table"><thead><tr><th>Pasto</th><th>Total</th></tr></thead>
              <tbody>{(s.by_pasture as any[]).map((p) => <tr key={p.pasture}><td>{p.pasture}</td><td>{money(p.amount)}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>

      {canCreate && (
        <form action={createCost} className="card">
          <strong>Lançar custo</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Descrição<input name="description" required /></label>
            <label>Categoria
              <select name="category" defaultValue="outros">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label>Valor (R$)<input name="amount" inputMode="decimal" required /></label>
            <label>Atribuir a
              <select name="target_type" defaultValue="fazenda">{Object.entries(TARGET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label>Lote (se atribuído a lote)
              <select name="lot_id" defaultValue=""><option value="">—</option>{(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label>Pasto (se atribuído a pasto)
              <select name="pasture_id" defaultValue=""><option value="">—</option>{(pastures.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label>Brinco (se atribuído a animal)<input name="ear_tag" /></label>
            <label>Observações<input name="notes" /></label>
            <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Lançar" message="Lançar este custo?" /></div>
          </div>
        </form>
      )}

      <div className="card">
        <strong>Lançamentos do período</strong>
        {(list.data ?? []).length === 0 ? <p className="muted">Nenhum lançamento.</p> : (list.data as any[]).map((c) => (
          <div className="row" key={c.id}>
            <span>{fmtDate(c.cost_date)} · {c.description} <span className="muted">· {CAT[c.category]} · {TARGET[c.target_type]}{c.stock_movement_id ? " · gerado pelo estoque" : ""}</span></span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>{money(c.amount)}</strong>
              {canUpdate && !c.stock_movement_id && (
                <form action={voidCost} style={{ display: "flex", gap: 8 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo da anulação" style={{ width: 140 }} />
                  <ConfirmSubmit label="Anular" message="Anular este custo?" />
                </form>
              )}
            </span>
          </div>
        ))}
        <p className="muted">Custos gerados por saída de estoque são anulados anulando a movimentação de estoque. TODO: contas a pagar e a receber.</p>
      </div>
    </AppShell>
  );
}
