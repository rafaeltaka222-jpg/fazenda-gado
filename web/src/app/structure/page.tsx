import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { createLot, createPasture } from "./actions";

export const instant = false;

export default async function StructurePage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await connection();
  const { erro } = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "structure" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Lotes e pastos</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [lots, pastures] = await Promise.all([
    supabase.from("lots").select("id, name, status, notes").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name, area_ha, capacity_heads, status").eq("farm_id", a.id).order("name"),
  ]);

  return (
    <AppShell {...shell}>
      <h1 className="title">Lotes e pastos</h1>

      <div className="card">
        <strong>Lotes</strong>
        {(lots.data ?? []).length === 0 ? (
          <p className="muted">Nenhum lote cadastrado.</p>
        ) : (
          (lots.data ?? []).map((l: any) => (
            <div className="row" key={l.id}>
              <span>{l.name}</span>
              <span className="badge">{l.status}</span>
            </div>
          ))
        )}
        {erro === "lote" && <p role="alert" className="error">Não foi possível criar o lote. Verifique o nome (deve ser único) e a sua permissão.</p>}
        <form action={createLot} className="form2" style={{ marginTop: 12 }}>
          <label>Nome do lote<input name="name" required /></label>
          <label>Observações<input name="notes" /></label>
          <div style={{ alignSelf: "end" }}><button className="btn">Criar lote</button></div>
        </form>
      </div>

      <div className="card">
        <strong>Pastos</strong>
        {(pastures.data ?? []).length === 0 ? (
          <p className="muted">Nenhum pasto cadastrado.</p>
        ) : (
          (pastures.data ?? []).map((p: any) => (
            <div className="row" key={p.id}>
              <span>
                {p.name}
                <span className="muted">
                  {p.area_ha != null ? ` · ${p.area_ha} ha` : ""}
                  {p.capacity_heads != null ? ` · capacidade ${p.capacity_heads} cab.` : ""}
                </span>
              </span>
              <span className="badge">{String(p.status).replace("_", " ")}</span>
            </div>
          ))
        )}
        {erro === "pasto" && <p role="alert" className="error">Não foi possível criar o pasto. Verifique os dados, o nome (deve ser único) e a sua permissão.</p>}
        <form action={createPasture} className="form2" style={{ marginTop: 12 }}>
          <label>Nome do pasto<input name="name" required /></label>
          <label>Área (ha)<input name="area_ha" inputMode="decimal" /></label>
          <label>Capacidade (cabeças)<input name="capacity_heads" inputMode="numeric" /></label>
          <label>Observações<input name="notes" /></label>
          <div style={{ alignSelf: "end" }}><button className="btn">Criar pasto</button></div>
        </form>
      </div>
    </AppShell>
  );
}
