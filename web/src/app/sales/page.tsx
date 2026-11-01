import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createSale } from "./actions";

export const instant = false;

const ERR: Record<string, string> = {
  tags: "Algum brinco não foi encontrado entre os animais ativos.", comprador: "Comprador inválido (precisa ter o papel Comprador).",
  perm: "Você não tem permissão para registrar vendas.", falha: "Não foi possível registrar. Confira brincos, data (não pode ser futura) e valor.",
};
const money = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; de?: string; ate?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "sales" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Vendas</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("trade.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Vendas</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver as vendas.</p></div>
      </AppShell>
    );
  }
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const de = sp.de && DATE.test(sp.de) ? sp.de : today.slice(0, 8) + "01";
  const ate = sp.ate && DATE.test(sp.ate) ? sp.ate : today;
  const [sum, list, buyers] = await Promise.all([
    supabase.rpc("sales_summary", { p_farm: a.id, p_from: de, p_to: ate }),
    supabase.from("sales").select("id, sale_date, buyer_id, total_amount, animal_count, document").eq("farm_id", a.id)
      .gte("sale_date", de).lte("sale_date", ate).order("sale_date", { ascending: false }).limit(30),
    supabase.from("people").select("id, name").eq("farm_id", a.id).eq("active", true).contains("person_roles", ["comprador"]).order("name"),
  ]);
  const s: any = sum.data ?? { total: 0, sales: 0, animals: 0, avg_per_head: null, by_buyer: [] };
  const rows: any[] = list.data ?? [];
  const buyerName = (id: string | null) => (id ? (buyers.data ?? []).find((b: any) => b.id === id)?.name ?? "—" : "—");
  const canCreate = perms.includes("trade.create");

  return (
    <AppShell {...shell}>
      <h1 className="title">Vendas</h1>
      {sp.ok && <div className="flash">Venda registrada.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}
      <form className="card filters" method="get">
        <label>De<input type="date" name="de" defaultValue={de} /></label>
        <label>Até<input type="date" name="ate" defaultValue={ate} /></label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="grid">
        <div className="card"><small className="muted">Receita no período</small><div className="big">{money(s.total)}</div></div>
        <div className="card"><small className="muted">Animais vendidos</small><div className="big">{s.animals}</div></div>
        <div className="card"><small className="muted">Valor médio por cabeça</small><div className="big">{s.avg_per_head == null ? "—" : money(s.avg_per_head)}</div></div>
      </div>
      {canCreate && (
        <form action={createSale} className="card">
          <strong>Registrar venda</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Brincos vendidos (separados por vírgula ou espaço) *<textarea name="tags" rows={3} required /></label>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Comprador
              <select name="buyer_id" defaultValue=""><option value="">(não informado)</option>
                {(buyers.data ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Valor total (R$) *<input name="total" inputMode="decimal" required /></label>
            <label>Documento (NF / GTA)<input name="document" placeholder="Ex: NF 1042 / GTA 98321" /></label>
            <label>Observações<input name="notes" /></label>
            <div style={{ alignSelf: "end" }}>
              <ConfirmSubmit className="btn" label="Registrar venda" message="Registrar a venda? Os animais saem do rebanho ativo. Esta operação não pode ser desfeita pela tela." />
            </div>
          </div>
          <p className="muted">Cadastre o comprador em Pessoas (papel Comprador). Informe a GTA ou NF no campo de documento.</p>
        </form>
      )}
      <div className="card">
        <strong>Vendas do período</strong>
        {rows.length === 0 ? <p className="muted">Nenhuma venda no período.</p> : rows.map((r) => (
          <div className="row" key={r.id}>
            <span>{fmtDate(r.sale_date)} · {r.animal_count} animal(is) · {buyerName(r.buyer_id)}{r.document ? ` · Doc: ${r.document}` : ""}</span>
            <strong>{money(r.total_amount)}</strong>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
