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
        <h1 className="title">Sanidade</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("health.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Sanidade</h1>
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
      .eq("farm_id", a.id).is("voided_at", null).order("created_at", { ascending: false }).limit(10),
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
      <h1 className="title">Sanidade</h1>
      {sp.ok === "produto" && <div className="flash">Produto cadastrado.</div>}
      {sp.ok && sp.ok !== "produto" && sp.ok !== "anulada" && <div className="flash">Registrado em {sp.ok} animal(is).</div>}
      {sp.ok === "anulada" && <div className="flash">Aplicação anulada.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      <div className="grid">
        <div className="card"><small className="muted">Doses atrasadas</small><div className="big">{al.overdue}</div></div>
        <div className="card"><small className="muted">A vencer em 30 dias</small><div className="big">{al.upcoming}</div></div>
        <div className="card"><small className="muted">Animais em carência</small><div className="big">{al.in_withdrawal}</div></div>
      </div>

      <div className="card">
        <strong>Próximas doses</strong>
        {(al.items ?? []).length === 0 ? (
          <p className="muted">Nenhuma dose atrasada ou a vencer nos próximos 30 dias.</p>
        ) : (
          (al.items as any[]).map((i, k) => (
            <div className="row" key={k}>
              <span>
                <Link href={`/herd/${i.animal_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{i.ear_tag}</Link>
                <span className="muted"> · {i.product}</span>
              </span>
              <span className={i.status === "atrasada" ? "error" : "muted"}>
                {i.status === "atrasada" ? "atrasada desde " : "vence em "}{fmtDate(i.due)}
              </span>
            </div>
          ))
        )}
      </div>

      {canCreate && (
        <form action={registerHealth} className="card">
          <strong>Registrar aplicação (vacina ou medicamento)</strong>
          <input type="hidden" name="back" value="/health" />
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Produto
              <select name="product_id" required defaultValue="">
                <option value="" disabled>Selecione</option>
                {prods.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}
              </select>
            </label>
            <label>Data da aplicação<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Próxima dose (opcional)<input name="next" type="date" /></label>
            <label>Dose<input name="dose" placeholder="ex.: 2 ml" /></label>
            <label>Lote do produto<input name="product_lot" /></label>
            <label>Observações<input name="notes" /></label>
            <label>Brincos (separados por vírgula ou espaço)<input name="tags" placeholder="000123, 000124" /></label>
            <label>ou todos os ativos de um lote
              <select name="lot_id" defaultValue=""><option value="">—</option>
                {(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <div style={{ alignSelf: "end" }}>
              <ConfirmSubmit className="btn" label="Registrar" message="Registrar a aplicação nos animais informados? Cada aplicação entra no histórico do animal." />
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <strong>Últimos registros</strong>
        {recentRows.length === 0 ? (
          <p className="muted">Nenhuma aplicação registrada.</p>
        ) : (
          recentRows.map((e) => (
            <div className="row" key={e.id}>
              <span>
                <Link href={`/herd/${e.animal_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{tagById.get(e.animal_id) ?? "—"}</Link>
                <span className="muted"> · {prodName(e.product_id)}</span>
              </span>
              <span className="muted">{fmtDate(e.event_date)}{e.next_due_date ? ` · próxima ${fmtDate(e.next_due_date)}` : ""}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <strong>Produtos</strong>
        {prods.map((p) => (
          <div className="row" key={p.id}>
            <span>{p.name} <span className="muted">· {p.kind}</span></span>
            <span className="muted">{p.withdrawal_days > 0 ? `carência ${p.withdrawal_days} dia(s)` : "sem carência"}{p.active ? "" : " · inativo"}</span>
          </div>
        ))}
        {canCreate && (
          <form action={createProduct} className="form2" style={{ marginTop: 12 }}>
            <label>Nome do produto<input name="name" required /></label>
            <label>Tipo
              <select name="kind" defaultValue="vacina"><option value="vacina">Vacina</option><option value="medicamento">Medicamento</option></select>
            </label>
            <label>Carência (dias)<input name="withdrawal_days" inputMode="numeric" defaultValue="0" /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Cadastrar produto</button></div>
          </form>
        )}
        <p className="muted">Ajuste a carência conforme a bula de cada produto. O sistema não traz valores prontos de carência.</p>
      </div>
      <p className="muted">TODO: tratamentos com diagnóstico, calendário sanitário por categoria e alertas por e-mail ou WhatsApp.</p>
    </AppShell>
  );
}
