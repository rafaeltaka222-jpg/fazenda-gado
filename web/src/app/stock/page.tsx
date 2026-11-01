import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createItem, registerStock, voidStock } from "./actions";

export const instant = false;

const ERR: Record<string, string> = {
  perm: "Você não tem permissão para esta operação.",
  saldo: "Saldo insuficiente para esta saída.",
  negativo: "Não é possível anular: o saldo ficaria negativo.",
  item: "Não foi possível cadastrar o item. Confira o nome (deve ser único).",
  falha: "Não foi possível registrar. Confira quantidade, data (não pode ser futura) e demais campos.",
};
const KIND: Record<string, string> = { entrada: "Entrada", saida: "Saída", ajuste_mais: "Ajuste (+)", ajuste_menos: "Ajuste (−)" };
const CAT: Record<string, string> = { racao: "Ração", sal_mineral: "Sal mineral", medicamento: "Medicamento", vacina: "Vacina", combustivel: "Combustível", outro: "Outro" };
const n3 = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const money = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmtDate = (d: string) => d.split("-").reverse().join("/");

export default async function StockPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "stock" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Estoque</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("inventory.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Estoque</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver o estoque.</p></div>
      </AppShell>
    );
  }
  const canCreate = perms.includes("inventory.create");
  const canUpdate = perms.includes("inventory.update");
  const [bal, alerts, moves, lots] = await Promise.all([
    supabase.rpc("stock_balances", { p_farm: a.id }),
    supabase.rpc("stock_alerts", { p_farm: a.id }),
    supabase.from("stock_movements").select("id, item_id, kind, quantity, unit_cost, movement_date, expiry_date, voided_at, void_reason")
      .eq("farm_id", a.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const items: any[] = bal.data ?? [];
  const al: any = alerts.data ?? { low: 0, expiring: 0, low_items: [], expiring_items: [] };
  const mv: any[] = moves.data ?? [];
  const itemName = (id: string) => items.find((i) => i.item_id === id)?.name ?? "—";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  return (
    <AppShell {...shell}>
      <h1 className="title">Estoque</h1>
      {sp.ok && <div className="flash">Operação concluída.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      <div className="grid">
        <div className="card"><small className="muted">Itens abaixo do mínimo</small><div className="big">{al.low}</div></div>
        <div className="card"><small className="muted">Itens com validade em até 30 dias</small><div className="big">{al.expiring}</div></div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>Saldos</strong>
        {items.length === 0 ? (
          <p className="muted">Nenhum item cadastrado.</p>
        ) : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Item</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Custo médio</th><th>Situação</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.item_id}>
                  <td>{i.name}</td><td>{CAT[i.category] ?? i.category}</td>
                  <td>{n3(i.balance)} {i.unit}</td><td>{n3(i.min_quantity)} {i.unit}</td><td>{money(i.avg_cost)}</td>
                  <td><span className="badge" style={i.below_min ? { background: "#f8e3e1", color: "#a8261d" } : undefined}>{i.below_min ? "abaixo do mínimo" : "ok"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(al.expiring_items ?? []).length > 0 && (
          <p className="muted">Validade próxima: {(al.expiring_items as any[]).map((e) => `${e.name} (${fmtDate(e.expiry)})`).join(" · ")}</p>
        )}
      </div>

      {canCreate && (
        <>
          <form action={registerStock} className="card">
            <strong>Registrar movimentação</strong>
            <div className="form2" style={{ marginTop: 12 }}>
              <label>Item
                <select name="item_id" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {items.filter((i) => i.active).map((i) => <option key={i.item_id} value={i.item_id}>{i.name} ({i.unit})</option>)}
                </select>
              </label>
              <label>Tipo
                <select name="kind" defaultValue="entrada">
                  <option value="entrada">Entrada (compra)</option><option value="saida">Saída (consumo)</option>
                  <option value="ajuste_mais">Ajuste de inventário (+)</option><option value="ajuste_menos">Ajuste de inventário (−)</option>
                </select>
              </label>
              <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>
              <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Custo unitário (entrada)<input name="unit_cost" inputMode="decimal" /></label>
              <label>Validade (entrada)<input name="expiry" type="date" /></label>
              <label>Lote de destino (saída)
                <select name="lot_id" defaultValue=""><option value="">—</option>
                  {(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label>Fornecedor<input name="supplier" /></label>
              <label>Documento<input name="document" /></label>
              <label>Observações<input name="notes" /></label>
              <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Registrar" message="Registrar esta movimentação de estoque? Saídas com custo médio conhecido geram custo automaticamente." /></div>
            </div>
          </form>
          <form action={createItem} className="card">
            <strong>Novo item de estoque</strong>
            <div className="form2" style={{ marginTop: 12 }}>
              <label>Nome<input name="name" required /></label>
              <label>Unidade (kg, saco, dose...)<input name="unit" required maxLength={12} /></label>
              <label>Categoria
                <select name="category" defaultValue="outro">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label>Estoque mínimo<input name="min_quantity" inputMode="decimal" defaultValue="0" /></label>
              <div style={{ alignSelf: "end" }}><button className="btn">Cadastrar item</button></div>
            </div>
          </form>
        </>
      )}

      <div className="card">
        <strong>Últimas movimentações</strong>
        {mv.length === 0 ? <p className="muted">Nenhuma movimentação.</p> : mv.map((m) => (
          <div className="row" key={m.id} style={m.voided_at ? { opacity: 0.6 } : undefined}>
            <span>
              {fmtDate(m.movement_date)} · <strong>{KIND[m.kind]}</strong> · {itemName(m.item_id)} · {n3(m.quantity)}
              {m.unit_cost != null ? ` · ${money(m.unit_cost)}/un` : ""}{m.voided_at ? ` · anulada (${m.void_reason ?? ""})` : ""}
            </span>
            {canUpdate && !m.voided_at && (
              <form action={voidStock} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="id" value={m.id} />
                <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo da anulação" style={{ width: 160 }} />
                <ConfirmSubmit label="Anular" message="Anular esta movimentação? O custo gerado por ela também é anulado." />
              </form>
            )}
          </div>
        ))}
      </div>
      <p className="muted">
        Custo da saída = custo médio das entradas. Validade: o alerta considera o item com saldo, não o lote físico. TODO: baixa por lote físico (PEPS).
      </p>
    </AppShell>
  );
}
