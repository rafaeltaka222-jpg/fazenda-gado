import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmButton from "@/components/ConfirmSubmit";
import { registerWeighings } from "./actions";

export const instant = false;

const LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = { lote?: string; ok?: string; av?: string; erro?: string };

export default async function WeighingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "weighings" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Pesagens</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const lote = sp.lote && UUID.test(sp.lote) ? sp.lote : "";
  let q = supabase
    .from("animals")
    .select("id, ear_tag, name, sex, lot_id", { count: "exact" })
    .eq("farm_id", a.id)
    .eq("status", "ativo")
    .order("ear_tag")
    .limit(LIMIT);
  if (lote) q = q.eq("lot_id", lote);

  const [animals, lots] = await Promise.all([
    q,
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const rows: any[] = animals.data ?? [];
  const ids = rows.map((r) => r.id);
  const sums = ids.length ? await supabase.rpc("animal_weight_summary", { p_animal_ids: ids }) : { data: [] as any[] };
  const wmap = new Map<string, any>(((sums.data ?? []) as any[]).map((s) => [s.animal_id, s]));
  const lotName = (id: string | null) => (id ? (lots.data ?? []).find((l: any) => l.id === id)?.name ?? "—" : "—");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const now = new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const back = lote ? `/weighings?lote=${lote}` : "/weighings";

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="title">Lançamento de Pesagens</h1>
          <p className="muted" style={{ margin: "4px 0 0 0", fontSize: 14 }}>
            Manejo de pesagem em lote no curral/brete com cálculo automático de GMD e alertas de variação.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/import" className="btn ghost" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Importar da Balança (TXT/CSV)</span>
          </Link>
        </div>
      </div>

      {sp.ok && <div className="flash">Operação concluída: {sp.ok} pesagem(ns) registrada(s) com sucesso.</div>}
      {Number(sp.av) > 0 && (
        <div className="flash bad" role="alert">
          Atenção: {sp.av} pesagem(ns) com variação brusca em relação à pesagem anterior. Confira os valores lançados.
        </div>
      )}
      {sp.erro === "dup" && (
        <div className="flash bad" role="alert">
          Já existe uma pesagem para um dos animais no mesmo dia e horário.
        </div>
      )}
      {sp.erro === "perm" && (
        <div className="flash bad" role="alert">
          Você não tem permissão para lançar pesagens.
        </div>
      )}
      {sp.erro === "peso" && (
        <div className="flash bad" role="alert">
          Não foi possível registrar. Preencha pelo menos um peso válido com data/hora válidas.
        </div>
      )}

      {/* Filtro de Lote */}
      <form className="card filters" method="get">
        <label>
          Filtrar por Lote de Manejo
          <select name="lote" defaultValue={lote}>
            <option value="">Todos os lotes da fazenda</option>
            {(lots.data ?? []).map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <button className="btn">Carregar Lote</button>
        {lote && <Link href="/weighings" className="btn ghost">Ver Todos</Link>}
      </form>

      {/* Formulário de Pesagem em Lote */}
      <form action={registerWeighings} className="card">
        <input type="hidden" name="back" value={back} />
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <strong style={{ fontSize: 16 }}>Dados do Manejo</strong>
          <span className="badge neutral">
            {rows.length} de {animals.count ?? 0} animais carregados
          </span>
        </div>

        <div className="form2" style={{ background: "var(--bg-subtle)", padding: "14px 16px", borderRadius: 12, marginBottom: 16 }}>
          <label>
            Data da Pesagem
            <input name="date" type="date" defaultValue={today} max={today} required />
          </label>
          <label>
            Horário da Pesagem
            <input name="time" type="time" defaultValue={now} required />
          </label>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <p className="muted" style={{ fontSize: 15 }}>Nenhum animal ativo encontrado neste lote.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Brinco</th>
                  <th>Nome</th>
                  <th>Lote</th>
                  <th>Última Pesagem</th>
                  <th style={{ width: 170 }}>Novo Peso (kg)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = wmap.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/herd/${r.id}`} style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14.5 }}>
                          {r.ear_tag}
                        </Link>
                      </td>
                      <td style={{ color: r.name ? "var(--ink)" : "var(--muted)" }}>{r.name ?? "—"}</td>
                      <td><span className="badge neutral">{lotName(r.lot_id)}</span></td>
                      <td style={{ fontWeight: 500 }}>
                        {s ? `${Number(s.last_weight).toFixed(1).replace(".", ",")} kg` : <span className="muted">Sem peso anterior</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            name={`peso_${r.id}`}
                            inputMode="decimal"
                            placeholder="0,0"
                            aria-label={`Peso de ${r.ear_tag}`}
                            style={{
                              width: 100,
                              textAlign: "right",
                              fontWeight: 700,
                              padding: "8px 10px",
                              borderColor: "var(--brand-border)",
                            }}
                          />
                          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>kg</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, flexWrap: "wrap", gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 600 }}>
            Observação de manejo: preencha apenas os animais que subiram na balança. As linhas vazias são ignoradas e não afetam o histórico anterior.
          </p>
          {rows.length > 0 && (
            <ConfirmButton
              className="btn"
              label="Salvar Pesagens do Lote"
              message="Confirmar o registro das pesagens preenchidas? O peso e GMD de cada animal serão recalculados imediatamente."
            />
          )}
        </div>
      </form>
    </AppShell>
  );
}
