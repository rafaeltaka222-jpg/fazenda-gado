import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createCount } from "./actions";

export const instant = false;

const SCOPE: Record<string, string> = { fazenda: "Fazenda toda", lote: "Lote", pasto: "Pasto" };
const fmtDate = (d: string) => d.split("-").reverse().join("/");

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "inventory" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Contagem do rebanho</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("counts.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Contagem do rebanho</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver as contagens.</p></div>
      </AppShell>
    );
  }
  const [counts, lots, pastures] = await Promise.all([
    supabase.from("inventory_counts").select("id, count_date, scope, lot_id, pasture_id, expected_total, counted_total, missing_total, extra_total")
      .eq("farm_id", a.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const nameOf = (list: any[] | null, id: string | null) => (id ? (list ?? []).find((x) => x.id === id)?.name ?? "—" : "");

  return (
    <AppShell {...shell}>
      <h1 className="title">Contagem do rebanho</h1>
      {sp.erro && <div className="flash bad" role="alert">Não foi possível registrar. Informe os brincos, o lote/pasto (se for o caso) e uma data que não seja futura.</div>}
      {perms.includes("counts.create") && (
        <form action={createCount} className="card">
          <strong>Nova contagem</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Onde foi contado
              <select name="scope" defaultValue="lote"><option value="fazenda">Fazenda toda</option><option value="lote">Um lote</option><option value="pasto">Um pasto</option></select>
            </label>
            <label>Lote (se "um lote")
              <select name="lot_id" defaultValue=""><option value="">—</option>{(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label>Pasto (se "um pasto")
              <select name="pasture_id" defaultValue=""><option value="">—</option>{(pastures.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label>Brincos encontrados (separados por vírgula, espaço ou linha) *<textarea name="tags" rows={5} required /></label>
            <label>Observações<input name="notes" /></label>
            <div style={{ alignSelf: "end" }}>
              <ConfirmSubmit className="btn" label="Comparar com o sistema" message="Registrar esta contagem? Ela não altera o cadastro: só aponta as diferenças." />
            </div>
          </div>
          <p className="muted">A contagem compara os brincos que você encontrou com os animais ativos do sistema naquele local e mostra o que falta e o que sobra.</p>
        </form>
      )}
      <div className="card">
        <strong>Contagens anteriores</strong>
        {(counts.data ?? []).length === 0 ? <p className="muted">Nenhuma contagem registrada.</p> : (counts.data as any[]).map((c) => (
          <div className="row" key={c.id}>
            <span>
              <Link href={`/inventory/${c.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{fmtDate(c.count_date)}</Link>
              <span className="muted"> · {SCOPE[c.scope]} {nameOf(c.scope === "lote" ? lots.data : pastures.data, c.lot_id ?? c.pasture_id)}</span>
            </span>
            <span className="muted">esperado {c.expected_total} · contado {c.counted_total} · faltam {c.missing_total} · sobram {c.extra_total}</span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
