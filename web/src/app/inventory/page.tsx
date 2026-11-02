import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createCount } from "./actions";

export const instant = false;

const SCOPE: Record<string, string> = { fazenda: "Fazenda Toda", lote: "Lote Específico", pasto: "Pasto / Piquete" };
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
        <h1 className="title">Inventário & Contagem do Rebanho</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("counts.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Inventário & Contagem do Rebanho</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver as contagens de inventário.</p></div>
      </AppShell>
    );
  }

  const [counts, lots, pastures] = await Promise.all([
    supabase.from("inventory_counts").select("id, count_date, scope, lot_id, pasture_id, expected_total, counted_total, missing_total, extra_total")
      .eq("farm_id", a.id).order("created_at", { ascending: false }).limit(25),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const nameOf = (list: any[] | null, id: string | null) => (id ? (list ?? []).find((x) => x.id === id)?.name ?? "—" : "");

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Inventário de Campo & Auditoria de Rebanho</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Conferência física de animais no curral contra o saldo de estoque do sistema
          </p>
        </div>
      </div>

      {sp.erro && <div className="flash bad" role="alert">Não foi possível registrar. Informe os brincos, o lote/pasto (se for o caso) e uma data válida.</div>}

      {/* Formulário de Nova Contagem */}
      {perms.includes("counts.create") && (
        <form action={createCount} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>Realizar Nova Auditoria / Contagem de Curral</strong>
            <span className="badge">Auditoria sem impacto cadastral</span>
          </div>
          <div className="form2">
            <label>Data da Leitura em Campo *<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Abrangência da Contagem *
              <select name="scope" defaultValue="lote">
                <option value="fazenda">Fazenda Toda (Geral)</option>
                <option value="lote">Lote Específico</option>
                <option value="pasto">Pasto / Piquete</option>
              </select>
            </label>
            <label>Lote Alvo (se por lote)
              <select name="lot_id" defaultValue=""><option value="">—</option>{(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label>Pasto Alvo (se por pasto)
              <select name="pasture_id" defaultValue=""><option value="">—</option>{(pastures.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Brincos Lidos no Curral (leitor bastão RFID ou digitação manual, separados por vírgula, espaço ou linha) *
              <textarea name="tags" rows={5} required placeholder="Ex: 000101, 000102, 000103, 000104..." style={{ fontFamily: "monospace" }} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Observações da Auditoria<input name="notes" placeholder="Ex: Contagem de conferência semestral pós-vacinação" /></label>
            <div style={{ alignSelf: "end", gridColumn: "1 / -1" }}>
              <ConfirmSubmit className="btn" label="Processar Comparação com Sistema" message="Registrar esta contagem? O sistema apontará divergências (animais faltantes ou sobrando) sem alterar os cadastros." />
            </div>
          </div>
        </form>
      )}

      {/* Histórico de Auditorias */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Histórico de Auditorias Realizadas ({((counts.data ?? []) as any[]).length})</strong>
          <span className="badge neutral">Conferência Física</span>
        </div>

        {(counts.data ?? []).length === 0 ? (
          <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>Nenhuma contagem física registrada até o momento.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data da Contagem</th>
                  <th>Escopo / Local</th>
                  <th>Esperado</th>
                  <th>Contado</th>
                  <th>Faltantes</th>
                  <th>Sobrando</th>
                  <th style={{ textAlign: "right" }}>Relatório</th>
                </tr>
              </thead>
              <tbody>
                {(counts.data as any[]).map((c) => (
                  <tr key={c.id}>
                    <td><strong>{fmtDate(c.count_date)}</strong></td>
                    <td>
                      <span className="badge neutral">{SCOPE[c.scope]}</span>{" "}
                      {nameOf(c.scope === "lote" ? lots.data : pastures.data, c.lot_id ?? c.pasture_id)}
                    </td>
                    <td>{c.expected_total} cab.</td>
                    <td><strong>{c.counted_total} cab.</strong></td>
                    <td>
                      {c.missing_total > 0 ? (
                        <span className="badge red">{c.missing_total} falta(m)</span>
                      ) : (
                        <span className="badge">0</span>
                      )}
                    </td>
                    <td>
                      {c.extra_total > 0 ? (
                        <span className="badge amber">{c.extra_total} sobra(m)</span>
                      ) : (
                        <span className="badge">0</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/inventory/${c.id}`} className="btn ghost" style={{ padding: "5px 12px", fontSize: 12.5 }}>
                        Ver Detalhes →
                      </Link>
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