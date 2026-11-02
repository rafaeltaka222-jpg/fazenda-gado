import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { createLot, createPasture } from "./actions";

export const instant = false;

export default async function StructurePage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  await connection();
  const { erro, ok } = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "structure" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Estrutura de Pastos & Lotes</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [lotsRes, pasturesRes, animalsRes] = await Promise.all([
    supabase.from("lots").select("id, name, status, notes").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name, area_ha, capacity_heads, status").eq("farm_id", a.id).order("name"),
    supabase.from("animals").select("lot_id, pasture_id").eq("farm_id", a.id).eq("status", "ativo"),
  ]);

  const lots = lotsRes.data ?? [];
  const pastures = pasturesRes.data ?? [];
  const animals = animalsRes.data ?? [];

  const countByLot = new Map<string, number>();
  const countByPasture = new Map<string, number>();
  animals.forEach((x: any) => {
    if (x.lot_id) countByLot.set(x.lot_id, (countByLot.get(x.lot_id) || 0) + 1);
    if (x.pasture_id) countByPasture.set(x.pasture_id, (countByPasture.get(x.pasture_id) || 0) + 1);
  });

  const totalArea = pastures.reduce((acc, p) => acc + (Number(p.area_ha) || 0), 0);
  const totalCapacity = pastures.reduce((acc, p) => acc + (Number(p.capacity_heads) || 0), 0);

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Estrutura da Propriedade: Lotes & Pastos</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Organização espacial, piquetes de pastejo rotacionado e lotes de manejo
          </p>
        </div>
      </div>

      {ok && <div className="flash">Estrutura cadastrada com sucesso.</div>}
      {erro === "lote" && <div className="flash bad" role="alert">Não foi possível criar o lote. Verifique se o nome é único e sua permissão.</div>}
      {erro === "pasto" && <div className="flash bad" role="alert">Não foi possível criar o pasto. Verifique os dados informados.</div>}

      {/* Grid de Resumo Estrutural */}
      <div className="grid">
        <div className="card">
          <small className="muted">Total de Pastos / Piquetes</small>
          <div className="big">{pastures.length}</div>
          <small className="muted">{totalArea > 0 ? `${totalArea.toFixed(1)} ha mapeados` : "Área não informada"}</small>
        </div>

        <div className="card">
          <small className="muted">Capacidade Suportada</small>
          <div className="big" style={{ color: "var(--brand)" }}>{totalCapacity} <span style={{ fontSize: 16 }}>cab.</span></div>
          <small className="muted">{animals.length} animais alojados atualmente</small>
        </div>

        <div className="card">
          <small className="muted">Lotes de Manejo</small>
          <div className="big">{lots.length}</div>
          <small className="muted">Grupos nutricionais/operacionais</small>
        </div>
      </div>

      {/* Seção 1: Pastos e Lotação */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong>Pastos & Piquetes de Pastejo ({pastures.length})</strong>
          <span className="badge neutral">Manejo Rotacionado</span>
        </div>

        {pastures.length === 0 ? (
          <p className="muted" style={{ padding: "16px 0" }}>Nenhum pasto cadastrado nesta fazenda.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {pastures.map((p) => {
              const headCount = countByPasture.get(p.id) || 0;
              const cap = Number(p.capacity_heads) || 0;
              const pct = cap > 0 ? Math.min(Math.round((headCount / cap) * 100), 100) : 0;
              const fillClass = pct > 95 ? "meter-fill danger" : pct > 80 ? "meter-fill warning" : "meter-fill";

              return (
                <div key={p.id} style={{
                  padding: 16, borderRadius: 14, background: "var(--surface)",
                  border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{p.name}</span>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {p.area_ha != null ? `${p.area_ha} ha` : "Área s/ cadastro"}
                        {p.capacity_heads != null ? ` · Cap: ${p.capacity_heads} cab.` : ""}
                      </div>
                    </div>
                    <span className="badge">
                      {String(p.status).replace("_", " ")}
                    </span>
                  </div>

                  {cap > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500 }}>
                        <span className="muted">Ocupação: <strong>{headCount}</strong> cab.</span>
                        <span style={{ color: pct > 95 ? "var(--red)" : "var(--brand)", fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div className="meter-bar">
                        <div className={fillClass} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  {cap === 0 && (
                    <div style={{ marginTop: 10, fontSize: 12.5 }} className="muted">
                      Animais presentes: <strong>{headCount}</strong> cab.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cadastro de Novo Pasto */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-secondary)" }}>+ Cadastrar Novo Pasto / Piquete</span>
          <form action={createPasture} className="form2" style={{ marginTop: 10 }}>
            <label>Identificação do Pasto *<input name="name" required placeholder="Ex: Piquete 04 - Mombaça" /></label>
            <label>Área em Hectares (ha)<input name="area_ha" inputMode="decimal" placeholder="Ex: 12.5" /></label>
            <label>Capacidade Recomendada (cabeças)<input name="capacity_heads" inputMode="numeric" placeholder="Ex: 35" /></label>
            <label>Observações / Tipo de Pastagem<input name="notes" placeholder="Ex: Braquiária brizantha, bebedouro central" /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Adicionar Pasto</button></div>
          </form>
        </div>
      </div>

      {/* Seção 2: Lotes de Manejo */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong>Lotes de Manejo do Rebanho ({lots.length})</strong>
          <span className="badge neutral">Agrupamento Operacional</span>
        </div>

        {lots.length === 0 ? (
          <p className="muted" style={{ padding: "16px 0" }}>Nenhum lote cadastrado.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome do Lote</th>
                  <th>Animais Alocados</th>
                  <th>Observações / Finalidade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l: any) => {
                  const count = countByLot.get(l.id) || 0;
                  return (
                    <tr key={l.id}>
                      <td><strong>{l.name}</strong></td>
                      <td>
                        <span className="badge" style={{ fontWeight: 700 }}>
                          {count} animal(is)
                        </span>
                      </td>
                      <td className="muted">{l.notes || "—"}</td>
                      <td>
                        <span className={`badge ${l.status === "ativo" ? "" : "neutral"}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cadastro de Novo Lote */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-secondary)" }}>+ Criar Novo Lote de Manejo</span>
          <form action={createLot} className="form2" style={{ marginTop: 10 }}>
            <label>Nome do Lote *<input name="name" required placeholder="Ex: Novilhas IATF 2026" /></label>
            <label>Finalidade / Observações<input name="notes" placeholder="Ex: Suplementação mineral protéica" /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Criar Lote</button></div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}