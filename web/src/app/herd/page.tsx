import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import SelectAll from "@/components/SelectAll";
import ConfirmButton from "@/components/ConfirmButton";
import { moveAnimals } from "./actions";

export const instant = false;
const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default async function HerdPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sexo?: string;
    lote?: string;
    status?: string;
    pagina?: string;
    ok?: string;
    erro?: string;
  }>;
}) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "herd" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Rebanho</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const page = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();
  const status = sp.status === "vendido" || sp.status === "morto" ? sp.status : "ativo";

  let query = supabase
    .from("animals")
    .select("id, ear_tag, name, sex, birth_date, breed_id, category_id, lot_id, pasture_id, status", { count: "exact" })
    .eq("farm_id", a.id)
    .eq("status", status)
    .order("ear_tag")
    .range((page - 1) * PAGE, page * PAGE - 1);

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
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="title">Gestão do Rebanho</h1>
          <p className="muted" style={{ margin: "4px 0 0 0", fontSize: 14 }}>
            Controle individual de animais, identificação SISBOV, lotes, piquetes e pesagens.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="badge neutral" style={{ padding: "6px 12px", fontSize: 13 }}>
            Total: <strong>{total}</strong> animais
          </span>
          <Link href="/herd/new" className="btn" style={{ gap: 6 }}>
            <span>+</span> Novo animal
          </Link>
        </div>
      </div>

      {sp.ok && <div className="flash">Operação concluída com sucesso para {sp.ok} animal(is).</div>}
      {sp.erro === "mov" && (
        <div className="flash bad" role="alert">
          Não foi possível registrar a operação. Os animais devem estar ativos e a data não pode ser futura.
        </div>
      )}
      {sp.erro === "perm" && (
        <div className="flash bad" role="alert">
          Você não tem permissão para registrar movimentações.
        </div>
      )}

      {/* Barra de Filtros */}
      <form className="card filters" method="get">
        <label>
          Brinco
          <input name="q" defaultValue={q} placeholder="Número do brinco..." />
        </label>
        <label>
          Sexo
          <select name="sexo" defaultValue={sp.sexo ?? ""}>
            <option value="">Todos os sexos</option>
            <option value="M">Macho</option>
            <option value="F">Fêmea</option>
          </select>
        </label>
        <label>
          Lote
          <select name="lote" defaultValue={sp.lote ?? ""}>
            <option value="">Todos os lotes</option>
            {(lots.data ?? []).map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select name="status" defaultValue={status}>
            <option value="ativo">Ativos na fazenda</option>
            <option value="vendido">Vendidos</option>
            <option value="morto">Mortos / Baixas</option>
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" style={{ padding: "10px 18px" }}>Filtrar</button>
          <Link href="/herd" className="btn ghost" style={{ padding: "10px 14px" }}>Limpar</Link>
        </div>
      </form>

      {/* Tabela do Rebanho */}
      <form action={moveAnimals} className="card">
        <input type="hidden" name="back" value={href(page)} />
        {animals.error ? (
          <p role="alert" className="error">Não foi possível carregar o rebanho.</p>
        ) : (animals.data ?? []).length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <p className="muted" style={{ fontSize: 16 }}>Nenhum animal encontrado com os filtros selecionados.</p>
            <Link href="/herd" className="btn ghost" style={{ marginTop: 8 }}>Limpar filtros</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}><SelectAll /></th>
                  <th>Brinco</th>
                  <th>Nome</th>
                  <th>Sexo</th>
                  <th>Raça</th>
                  <th>Categoria</th>
                  <th>Lote</th>
                  <th>Pasto</th>
                  <th>Nascimento</th>
                  <th>Peso (kg)</th>
                  <th>GMD (kg/d)</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {(animals.data ?? []).map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" name="ids" value={r.id} aria-label={`Selecionar ${r.ear_tag}`} />
                    </td>
                    <td>
                      <Link href={`/herd/${r.id}`} style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14.5 }}>
                        {r.ear_tag}
                      </Link>
                    </td>
                    <td style={{ color: r.name ? "var(--ink)" : "var(--muted)" }}>{r.name ?? "—"}</td>
                    <td>
                      {r.sex === "M" ? (
                        <span className="badge blue" style={{ fontSize: 11, padding: "2px 8px" }}>Macho</span>
                      ) : (
                        <span className="badge" style={{ background: "#fdf2f8", color: "#db2777", borderColor: "#fbcfe8", fontSize: 11, padding: "2px 8px" }}>Fêmea</span>
                      )}
                    </td>
                    <td>{nm(breeds.data, r.breed_id)}</td>
                    <td>{nm(cats.data, r.category_id)}</td>
                    <td style={{ fontWeight: 500 }}>{nm(lots.data, r.lot_id)}</td>
                    <td>{nm(pastures.data, r.pasture_id)}</td>
                    <td style={{ color: "var(--muted)", fontSize: 13 }}>{fmtDate(r.birth_date)}</td>
                    <td style={{ fontWeight: 600 }}>{kg(wmap.get(r.id))}</td>
                    <td style={{ color: Number(gmd(wmap.get(r.id))) > 0 ? "var(--brand)" : "inherit" }}>
                      {gmd(wmap.get(r.id))}
                    </td>
                    <td>
                      <span className={"badge " + (r.status === "ativo" ? "" : r.status === "vendido" ? "neutral" : "red")}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        <div className="pager" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13.5 }}>
            Exibindo <strong>{animals.data?.length ?? 0}</strong> de <strong>{total}</strong> animais · Página {page} de {pages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {page > 1 && <Link href={href(page - 1)} className="btn ghost" style={{ padding: "6px 14px", fontSize: 13 }}>← Anterior</Link>}
            {page < pages && <Link href={href(page + 1)} className="btn ghost" style={{ padding: "6px 14px", fontSize: 13 }}>Próxima →</Link>}
          </div>
        </div>

        {/* Ações em Lote */}
        {status === "ativo" && (animals.data ?? []).length > 0 && (
          <div
            style={{
              marginTop: 24,
              padding: "18px 20px",
              background: "var(--brand-light)",
              border: "1px solid var(--brand-border)",
              borderRadius: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <strong style={{ color: "var(--brand-hover)", fontSize: 15 }}>Ação nos Animais Selecionados</strong>
            </div>
            <p className="muted" style={{ margin: "0 0 14px 0", fontSize: 13 }}>
              Selecione os animais pelas caixas de seleção acima e aplique uma operação em lote.
            </p>
            <div className="form2">
              <label>
                Operação de Manejo
                <select name="op" defaultValue="transferencia">
                  <option value="transferencia">Transferência de lote/pasto</option>
                  <option value="venda">Registrar saída por venda</option>
                  <option value="morte">Registrar baixa por morte</option>
                </select>
              </label>
              <label>
                Data do Manejo
                <input name="date" type="date" defaultValue={today} max={today} required />
              </label>
              <label>
                Lote de Destino
                <select name="lot_id" defaultValue="">
                  <option value="">(manter lote atual)</option>
                  {activeLots.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Pasto de Destino
                <select name="pasture_id" defaultValue="">
                  <option value="">(manter pasto atual)</option>
                  {activePastures.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Observações
                <input name="notes" placeholder="Motivo ou lote de pesagem..." />
              </label>
              <div style={{ alignSelf: "end" }}>
                <ConfirmButton label="Aplicar operação" />
              </div>
            </div>
          </div>
        )}
      </form>
    </AppShell>
  );
}
