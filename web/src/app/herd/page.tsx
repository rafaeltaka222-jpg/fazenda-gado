import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmButton from "@/components/ConfirmButton";
import SelectAll from "@/components/SelectAll";
import { moveAnimals } from "./actions";

export const instant = false;

const PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = { q?: string; sexo?: string; lote?: string; status?: string; pagina?: string; ok?: string; erro?: string };

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default async function HerdPage({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "herd" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Rebanho</h1>
        <div className="card">
          <p>Crie uma fazenda primeiro.</p>
          <Link href="/farms" className="btn">Ir para Fazendas</Link>
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const page = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  const from = (page - 1) * PAGE;
  const q = (sp.q ?? "").trim().replace(/[%_,()*\\]/g, "");
  const status = ["ativo", "vendido", "morto", "transferido"].includes(sp.status ?? "") ? sp.status! : "ativo";

  let query = supabase
    .from("animals")
    .select("id, ear_tag, name, sex, status, birth_date, breed_id, category_id, lot_id, pasture_id", { count: "exact" })
    .eq("farm_id", a.id)
    .eq("status", status)
    .order("ear_tag")
    .range(from, from + PAGE - 1);
  if (q) query = query.ilike("ear_tag", `%${q}%`);
  if (sp.sexo === "M" || sp.sexo === "F") query = query.eq("sex", sp.sexo);
  if (sp.lote && UUID.test(sp.lote)) query = query.eq("lot_id", sp.lote);

  const [animals, lots, pastures, breeds, cats] = await Promise.all([
    query,
    supabase.from("lots").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("breeds").select("id, name").eq("farm_id", a.id),
    supabase.from("categories").select("id, name").eq("farm_id", a.id),
  ]);

  const nm = (list: any[] | null, id: string | null) => (id ? (list ?? []).find((x) => x.id === id)?.name ?? "—" : "—");
  const ids = (animals.data ?? []).map((r: any) => r.id);
  const sums = ids.length ? await supabase.rpc("animal_weight_summary", { p_animal_ids: ids }) : { data: [] as any[] };
  const wmap = new Map<string, any>(((sums.data ?? []) as any[]).map((s) => [s.animal_id, s]));
  const kg = (s: any) => (s ? Number(s.last_weight).toFixed(1).replace(".", ",") : "—");
  const gmd = (s: any) => {
    if (!s || s.prev_weight == null) return "—";
    const days = (new Date(s.last_at).getTime() - new Date(s.prev_at).getTime()) / 86400000;
    return days > 0 ? ((s.last_weight - s.prev_weight) / days).toFixed(2).replace(".", ",") : "—";
  };
  const total = animals.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const params = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (sp.sexo) u.set("sexo", sp.sexo);
    if (sp.lote) u.set("lote", sp.lote);
    if (status !== "ativo") u.set("status", status);
    if (p > 1) u.set("pagina", String(p));
    return u.toString();
  };
  const href = (p: number) => `/herd${params(p) ? `?${params(p)}` : ""}`;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const activeLots = (lots.data ?? []).filter((l: any) => l.status === "ativo");
  const activePastures = (pastures.data ?? []).filter((p: any) => p.status !== "inativo");

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Rebanho</h1>
        <Link href="/herd/new" className="btn">Novo animal</Link>
      </div>

      {sp.ok && <div className="flash">Operação concluída: {sp.ok} animal(is).</div>}
      {sp.erro === "mov" && (
        <div className="flash bad" role="alert">
          Não foi possível registrar. Os animais devem estar ativos, a data não pode ser futura e a transferência precisa de um destino.
        </div>
      )}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Você não tem permissão para registrar movimentações.</div>}

      <form className="card filters" method="get">
        <label>Brinco<input name="q" defaultValue={q} placeholder="Buscar brinco" /></label>
        <label>Sexo
          <select name="sexo" defaultValue={sp.sexo ?? ""}>
            <option value="">Todos</option><option value="M">Macho</option><option value="F">Fêmea</option>
          </select>
        </label>
        <label>Lote
          <select name="lote" defaultValue={sp.lote ?? ""}>
            <option value="">Todos</option>
            {(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Situação
          <select name="status" defaultValue={status}>
            <option value="ativo">Ativos</option><option value="vendido">Vendidos</option><option value="morto">Mortos</option>
          </select>
        </label>
        <button className="btn">Filtrar</button>
        <Link href="/herd" className="btn ghost">Limpar</Link>
      </form>

      <form action={moveAnimals} className="card">
        <input type="hidden" name="back" value={href(page)} />
        {animals.error ? (
          <p role="alert" className="error">Não foi possível carregar o rebanho.</p>
        ) : (animals.data ?? []).length === 0 ? (
          <p className="muted">Nenhum animal encontrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th><SelectAll /></th><th>Brinco</th><th>Nome</th><th>Sexo</th><th>Raça</th><th>Categoria</th>
                  <th>Lote</th><th>Pasto</th><th>Nascimento</th><th>Peso atual (kg)</th><th>GMD (kg/dia)</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {(animals.data ?? []).map((r: any) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" name="ids" value={r.id} aria-label={`Selecionar ${r.ear_tag}`} /></td>
                    <td><Link href={`/herd/${r.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{r.ear_tag}</Link></td>
                    <td>{r.name ?? "—"}</td>
                    <td>{r.sex === "M" ? "Macho" : "Fêmea"}</td>
                    <td>{nm(breeds.data, r.breed_id)}</td>
                    <td>{nm(cats.data, r.category_id)}</td>
                    <td>{nm(lots.data, r.lot_id)}</td>
                    <td>{nm(pastures.data, r.pasture_id)}</td>
                    <td>{fmtDate(r.birth_date)}</td>
                    <td>{kg(wmap.get(r.id))}</td>
                    <td>{gmd(wmap.get(r.id))}</td>
                    <td><span className="badge">{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager" style={{ marginTop: 12 }}>
          <span className="muted">{total} animal(is) · página {page} de {pages}</span>
          {page > 1 && <Link href={href(page - 1)} className="btn ghost">Anterior</Link>}
          {page < pages && <Link href={href(page + 1)} className="btn ghost">Próxima</Link>}
        </div>

        {status === "ativo" && (animals.data ?? []).length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <strong>Operação nos animais selecionados</strong>
            <div className="form2" style={{ marginTop: 12 }}>
              <label>Operação
                <select name="op" defaultValue="transferencia">
                  <option value="transferencia">Transferir</option>
                  <option value="venda">Registrar venda</option>
                  <option value="morte">Registrar morte</option>
                </select>
              </label>
              <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Lote de destino
                <select name="lot_id" defaultValue=""><option value="">(manter)</option>
                  {activeLots.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label>Pasto de destino
                <select name="pasture_id" defaultValue=""><option value="">(manter)</option>
                  {activePastures.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>Observações<input name="notes" /></label>
              <div style={{ alignSelf: "end" }}><ConfirmButton label="Aplicar aos selecionados" /></div>
            </div>
            <p className="muted">Lote e pasto de destino só valem para transferências. Venda e morte encerram o animal no rebanho ativo.</p>
          </div>
        )}
      </form>
      <p className="muted">GMD = ganho médio diário entre as duas últimas pesagens válidas. Aparece depois de duas pesagens.</p>
    </AppShell>
  );
}
