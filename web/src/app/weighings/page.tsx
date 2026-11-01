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
      <h1 className="title">Pesagens</h1>

      {sp.ok && <div className="flash">{sp.ok} pesagem(ns) registrada(s).</div>}
      {Number(sp.av) > 0 && (
        <div className="flash bad" role="alert">
          Atenção: {sp.av} pesagem(ns) com variação brusca em relação à anterior. Confira os valores na ficha dos animais; se houver erro, anule a pesagem.
        </div>
      )}
      {sp.erro === "dup" && <div className="flash bad" role="alert">Já existe uma pesagem para um dos animais nesse mesmo dia e horário.</div>}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Você não tem permissão para lançar pesagens.</div>}
      {sp.erro === "peso" && (
        <div className="flash bad" role="alert">
          Não foi possível registrar. Preencha pelo menos um peso válido (maior que zero), com data e horário que não sejam futuros, em animais ativos.
        </div>
      )}

      <form className="card filters" method="get">
        <label>Lote
          <select name="lote" defaultValue={lote}>
            <option value="">Todos</option>
            {(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className="btn">Filtrar</button>
        <Link href="/weighings" className="btn ghost">Limpar</Link>
      </form>

      <form action={registerWeighings} className="card">
        <input type="hidden" name="back" value={back} />
        <div className="form2">
          <label>Data da pesagem<input name="date" type="date" defaultValue={today} max={today} required /></label>
          <label>Horário<input name="time" type="time" defaultValue={now} required /></label>
        </div>
        {rows.length === 0 ? (
          <p className="muted">Nenhum animal ativo encontrado.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Brinco</th><th>Nome</th><th>Lote</th><th>Última pesagem (kg)</th><th>Novo peso (kg)</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const s = wmap.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/herd/${r.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{r.ear_tag}</Link></td>
                      <td>{r.name ?? "—"}</td>
                      <td>{lotName(r.lot_id)}</td>
                      <td>{s ? Number(s.last_weight).toFixed(1).replace(".", ",") : "—"}</td>
                      <td><input name={`peso_${r.id}`} inputMode="decimal" aria-label={`Peso de ${r.ear_tag}`} style={{ width: 110 }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          {animals.count ?? 0} animal(is) ativo(s){(animals.count ?? 0) > LIMIT ? ` · mostrando os ${LIMIT} primeiros (use o filtro de lote)` : ""}.
          Só os animais com peso preenchido são lançados. O horário é interpretado como horário de Brasília.
        </p>
        {rows.length > 0 && (
          <ConfirmButton className="btn" label="Registrar pesagens" message="Registrar as pesagens preenchidas? Cada uma entra no histórico do animal." />
        )}
      </form>
    </AppShell>
  );
}
