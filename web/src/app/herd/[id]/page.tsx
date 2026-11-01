import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmButton from "@/components/ConfirmButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { moveAnimals, updateAnimal } from "../actions";
import { registerWeighings, voidWeighing } from "../../weighings/actions";
import { registerHealth, voidHealth } from "../../health/actions";
import CustomFields from "@/components/CustomFields";
import { loadAnimalDefs } from "@/lib/catalog";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const LABEL: Record<string, string> = { entrada: "Entrada", transferencia: "Transferência", venda: "Venda", morte: "Morte" };

export default async function AnimalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; av?: string }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const ctx = await getContext();
  const a = ctx.active;
  if (!a) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "herd" };

  const supabase = await createClient();
  const [animalRes, eventsRes, lots, pastures, breeds, cats] = await Promise.all([
    supabase.from("animals").select("id, farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id, birth_date, origin, status, entry_date, exit_date, notes, version").eq("id", id).eq("farm_id", a.id).maybeSingle(),
    supabase.from("animal_events").select("id, event_type, event_date, details, created_at").eq("animal_id", id)
      .order("event_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("lots").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const an: any = animalRes.data;
  if (!an) notFound();

  const wRes = await supabase
    .from("weighings")
    .select("id, weighed_at, weight_kg, notes, voided_at, void_reason")
    .eq("animal_id", id)
    .order("weighed_at", { ascending: false });
  const wAll: any[] = wRes.data ?? [];
  const wAct = wAll.filter((w) => !w.voided_at);
  const lastW = wAct[0];
  const prevW = wAct[1];
  const gmdDays = lastW && prevW ? (new Date(lastW.weighed_at).getTime() - new Date(prevW.weighed_at).getTime()) / 86400000 : 0;
  const gmdTxt = gmdDays > 0 ? ((lastW.weight_kg - prevW.weight_kg) / gmdDays).toFixed(2).replace(".", ",") : "—";
  const fmtKg = (v: number) => Number(v).toFixed(1).replace(".", ",");
  const fmtDT = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });

  const [customRes, allDefs, hevRes, hprodRes] = await Promise.all([
    supabase.rpc("get_animal_custom", { p_animal: id }),
    loadAnimalDefs(supabase, a.id, a.role, true),
    supabase.from("health_events").select("id, product_id, event_date, dose, next_due_date, withdrawal_until, voided_at, void_reason")
      .eq("animal_id", id).order("event_date", { ascending: false }),
    supabase.from("health_products").select("id, name, active").eq("farm_id", a.id).order("name"),
  ]);
  const custom: Record<string, any> = (customRes.data as Record<string, any> | null) ?? {};
  const formDefs = allDefs.filter((d) => d.status === "active");
  const shownDefs = allDefs.filter((d) => custom[d.field_key] !== undefined);
  const hEvents: any[] = hevRes.data ?? [];
  const hProds: any[] = hprodRes.data ?? [];
  const hName = (pid: string) => hProds.find((p) => p.id === pid)?.name ?? "—";
  const parentIds = [an.sire_id, an.dam_id].filter(Boolean);
  const [parentsRes, kidsRes, reproRes] = await Promise.all([
    parentIds.length ? supabase.from("animals").select("id, ear_tag").in("id", parentIds) : Promise.resolve({ data: [] as any[] }),
    supabase.from("animals").select("id, ear_tag, sex, birth_date").or(`dam_id.eq.${id},sire_id.eq.${id}`).is("deleted_at", null)
      .order("birth_date", { ascending: false }).limit(20),
    an.sex === "F"
      ? supabase.from("reproduction_events").select("id, event_type, event_date, result, male_id, calf_id").eq("female_id", id)
          .is("voided_at", null).order("event_date", { ascending: false }).limit(15)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const parentTag = (pid: string | null) => ((parentsRes.data ?? []) as any[]).find((p) => p.id === pid)?.ear_tag ?? "";
  const kids: any[] = kidsRes.data ?? [];
  const repro: any[] = reproRes.data ?? [];
  const REPRO: Record<string, string> = { cobertura: "Cobertura", inseminacao: "Inseminação", diagnostico: "Diagnóstico", parto: "Parto", aborto: "Aborto" };
  const fmtCustom = (d: any, v: any) => {
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (d.data_type === "date") return fmtDate(String(v));
    if (["decimal", "money", "percent", "integer"].includes(d.data_type)) return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
    return String(v);
  };

  const nm = (list: any[] | null, key: string | undefined) => (key ? (list ?? []).find((x) => x.id === key)?.name ?? "—" : "—");
  const describe = (e: any) => {
    const d = e.details ?? {};
    const parts: string[] = [];
    if (e.event_type === "entrada") {
      if (d.to_lot_id) parts.push(`Lote ${nm(lots.data, d.to_lot_id)}`);
      if (d.to_pasture_id) parts.push(`Pasto ${nm(pastures.data, d.to_pasture_id)}`);
    } else if (e.event_type === "transferencia") {
      if (d.to_lot_id && d.to_lot_id !== d.from_lot_id) parts.push(`Lote ${nm(lots.data, d.from_lot_id)} → ${nm(lots.data, d.to_lot_id)}`);
      if (d.to_pasture_id && d.to_pasture_id !== d.from_pasture_id) parts.push(`Pasto ${nm(pastures.data, d.from_pasture_id)} → ${nm(pastures.data, d.to_pasture_id)}`);
    }
    if (d.notes) parts.push(String(d.notes));
    return parts.join(" · ") || "—";
  };
  const opts = (rows: any[] | null, sel?: string | null) =>
    (rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Animal {an.ear_tag} <span className="badge">{an.status}</span></h1>
        <Link href="/herd" className="btn ghost">Voltar ao rebanho</Link>
      </div>

      {sp.ok && <div className="flash">Salvo com sucesso.</div>}
      {sp.erro === "conflito" && (
        <div className="flash bad" role="alert">
          Não foi possível salvar: o registro foi alterado por outra pessoa enquanto você editava, ou você não tem permissão. Recarregue a página e confira os dados.
        </div>
      )}
      {sp.erro === "dup" && <div className="flash bad" role="alert">Já existe outro animal com este brinco.</div>}
      {sp.erro === "peso" && <div className="flash bad" role="alert">Não foi possível registrar a pesagem. Informe um peso maior que zero, sem data futura e sem repetir o mesmo horário.</div>}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Você não tem permissão para esta operação.</div>}
      {Number(sp.av) > 0 && <div className="flash bad" role="alert">Atenção: variação brusca de peso em relação à pesagem anterior. Se houver erro de digitação, anule a pesagem.</div>}
      {sp.erro === "pai" && <div className="flash bad" role="alert">Pai ou mãe não encontrado (o pai deve ser macho e a mãe, fêmea).</div>}
      {sp.erro === "genealogia" && <div className="flash bad" role="alert">Genealogia inválida: confira o sexo do pai e da mãe.</div>}
      {sp.erro === "custom" && <div className="flash bad" role="alert">Os dados principais foram salvos, mas não foi possível salvar os campos personalizados. Confira os valores (listas, datas e números) e a sua permissão.</div>}
      {sp.erro === "obrigatorio" && <div className="flash bad" role="alert">Os dados principais foram salvos, mas há campo personalizado obrigatório sem preenchimento. Preencha em "Dados cadastrais" abaixo.</div>}
      {sp.erro === "vazio" && <div className="flash bad" role="alert">Informe o produto e a data.</div>}
      {sp.erro === "falha" && <div className="flash bad" role="alert">Não foi possível registrar a aplicação. Confira a data (não pode ser futura) e a próxima dose (deve ser depois da aplicação).</div>}
      {sp.erro && !["conflito", "dup", "peso", "perm", "custom", "obrigatorio", "vazio", "falha", "pai", "genealogia"].includes(sp.erro) && <div className="flash bad" role="alert">Não foi possível salvar. Verifique os dados.</div>}

      <div className="grid">
        <div className="card"><small className="muted">Lote atual</small><div className="big">{nm(lots.data, an.lot_id)}</div></div>
        <div className="card"><small className="muted">Pasto atual</small><div className="big">{nm(pastures.data, an.pasture_id)}</div></div>
        <div className="card"><small className="muted">Nascimento</small><div className="big">{fmtDate(an.birth_date)}</div></div>
        <div className="card"><small className="muted">Peso atual</small><div className="big">{lastW ? `${fmtKg(lastW.weight_kg)} kg` : "—"}</div></div>
        <div className="card"><small className="muted">Ganho médio diário</small><div className="big">{gmdTxt === "—" ? "—" : `${gmdTxt} kg/dia`}</div></div>
      </div>

      <div className="card">
        <strong>Histórico</strong>
        {(eventsRes.data ?? []).length === 0 ? (
          <p className="muted">Sem eventos.</p>
        ) : (
          (eventsRes.data ?? []).map((e: any) => (
            <div className="event" key={e.id}>
              <span><strong>{LABEL[e.event_type] ?? e.event_type}</strong> · {fmtDate(e.event_date)}</span>
              <span className="muted">{describe(e)}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <strong>Pesagens</strong>
        {wAll.length === 0 ? (
          <p className="muted">Nenhuma pesagem registrada.</p>
        ) : (
          wAll.map((w) => (
            <div className="row" key={w.id} style={w.voided_at ? { opacity: 0.6 } : undefined}>
              <span>
                {fmtDT(w.weighed_at)} · <strong>{fmtKg(w.weight_kg)} kg</strong>
                {w.voided_at ? ` · anulada (${w.void_reason ?? ""})` : ""}
                {w.notes ? ` · ${w.notes}` : ""}
              </span>
              {!w.voided_at && (
                <form action={voidWeighing} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="back" value={`/herd/${an.id}`} />
                  <input name="reason" required minLength={3} placeholder="Motivo da anulação" aria-label="Motivo da anulação" style={{ width: 190 }} />
                  <ConfirmSubmit label="Anular" message="Anular esta pesagem? Ela deixa de contar nos cálculos, mas continua no histórico." />
                </form>
              )}
            </div>
          ))
        )}
        {an.status === "ativo" && (
          <form action={registerWeighings} className="form2" style={{ marginTop: 12 }}>
            <input type="hidden" name="back" value={`/herd/${an.id}`} />
            <label>Peso (kg)<input name={`peso_${an.id}`} inputMode="decimal" required /></label>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Horário<input name="time" type="time" defaultValue={new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })} required /></label>
            <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Lançar pesagem" message="Registrar esta pesagem?" /></div>
          </form>
        )}
      </div>

      <div className="card">
        <strong>Genealogia</strong>
        <div className="row"><span className="muted">Pai</span>
          <span>{an.sire_id ? <Link href={`/herd/${an.sire_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{parentTag(an.sire_id) || "—"}</Link> : "—"}</span></div>
        <div className="row"><span className="muted">Mãe</span>
          <span>{an.dam_id ? <Link href={`/herd/${an.dam_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{parentTag(an.dam_id) || "—"}</Link> : "—"}</span></div>
        <div className="row"><span className="muted">Filhos cadastrados</span>
          <span>{kids.length === 0 ? "—" : kids.map((k, i) => (
            <span key={k.id}>{i > 0 ? ", " : ""}<Link href={`/herd/${k.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{k.ear_tag}</Link></span>
          ))}</span></div>
      </div>

      {an.sex === "F" && (
        <div className="card">
          <strong>Reprodução</strong>
          {repro.length === 0 ? <p className="muted">Nenhum evento reprodutivo registrado.</p> : repro.map((e) => (
            <div className="row" key={e.id}>
              <span><strong>{REPRO[e.event_type] ?? e.event_type}</strong>{e.result ? <span className="muted"> · {e.result}</span> : null}</span>
              <span className="muted">{fmtDate(e.event_date)}</span>
            </div>
          ))}
          <p style={{ marginTop: 12 }}><Link href="/reproduction" style={{ color: "var(--green)", fontWeight: 600 }}>Registrar eventos na página Reprodução</Link></p>
        </div>
      )}

      <div className="card">
        <strong>Sanidade</strong>
        {hEvents.length === 0 ? (
          <p className="muted">Nenhuma aplicação registrada.</p>
        ) : (
          hEvents.map((e) => (
            <div className="row" key={e.id} style={e.voided_at ? { opacity: 0.6 } : undefined}>
              <span>
                {fmtDate(e.event_date)} · <strong>{hName(e.product_id)}</strong>
                {e.dose ? ` · ${e.dose}` : ""}
                {e.next_due_date ? ` · próxima: ${fmtDate(e.next_due_date)}` : ""}
                {e.withdrawal_until ? ` · carência até ${fmtDate(e.withdrawal_until)}` : ""}
                {e.voided_at ? ` · anulada (${e.void_reason ?? ""})` : ""}
              </span>
              {!e.voided_at && (
                <form action={voidHealth} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="back" value={`/herd/${an.id}`} />
                  <input name="reason" required minLength={3} placeholder="Motivo da anulação" aria-label="Motivo da anulação" style={{ width: 190 }} />
                  <ConfirmSubmit label="Anular" message="Anular esta aplicação? Ela deixa de contar nos alertas, mas continua no histórico." />
                </form>
              )}
            </div>
          ))
        )}
        {an.status === "ativo" && hProds.some((p) => p.active) && (
          <form action={registerHealth} className="form2" style={{ marginTop: 12 }}>
            <input type="hidden" name="ids" value={an.id} />
            <input type="hidden" name="back" value={`/herd/${an.id}`} />
            <label>Produto
              <select name="product_id" required defaultValue="">
                <option value="" disabled>Selecione</option>
                {hProds.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Próxima dose<input name="next" type="date" /></label>
            <label>Dose<input name="dose" placeholder="ex.: 2 ml" /></label>
            <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Registrar aplicação" message="Registrar esta aplicação?" /></div>
          </form>
        )}
      </div>

      {shownDefs.length > 0 && (
        <div className="card">
          <strong>Campos personalizados</strong>
          {shownDefs.map((d) => (
            <div className="row" key={d.field_key}>
              <span className="muted">{d.label}{d.status === "inactive" ? " (campo desativado)" : ""}</span>
              <span>{fmtCustom(d, custom[d.field_key])}</span>
            </div>
          ))}
        </div>
      )}

      {an.status === "ativo" && (
        <form action={moveAnimals} className="card">
          <strong>Movimentar este animal</strong>
          <input type="hidden" name="ids" value={an.id} />
          <input type="hidden" name="back" value={`/herd/${an.id}`} />
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
                {opts((lots.data ?? []).filter((l: any) => l.status === "ativo"))}
              </select>
            </label>
            <label>Pasto de destino
              <select name="pasture_id" defaultValue=""><option value="">(manter)</option>
                {opts((pastures.data ?? []).filter((p: any) => p.status !== "inativo"))}
              </select>
            </label>
            <label>Observações<input name="notes" /></label>
            <div style={{ alignSelf: "end" }}><ConfirmButton label="Registrar" /></div>
          </div>
        </form>
      )}

      <form action={updateAnimal} className="card">
        <strong>Dados cadastrais</strong>
        <input type="hidden" name="id" value={an.id} />
        <input type="hidden" name="version" value={an.version} />
        <div className="form2" style={{ marginTop: 12 }}>
          <label>Brinco *<input name="ear_tag" required defaultValue={an.ear_tag} /></label>
          <label>Nome<input name="name" defaultValue={an.name ?? ""} /></label>
          <label>Sexo *
            <select name="sex" required defaultValue={an.sex}>
              <option value="M">Macho</option><option value="F">Fêmea</option>
            </select>
          </label>
          <label>Raça<select name="breed_id" defaultValue={an.breed_id ?? ""}><option value="">—</option>{opts(breeds.data)}</select></label>
          <label>Categoria<select name="category_id" defaultValue={an.category_id ?? ""}><option value="">—</option>{opts(cats.data)}</select></label>
          <label>Data de nascimento<input name="birth_date" type="date" defaultValue={an.birth_date ?? ""} /></label>
          <label>Data de entrada<input name="entry_date" type="date" defaultValue={an.entry_date ?? ""} /></label>
          <label>Origem<input name="origin" defaultValue={an.origin ?? ""} /></label>
          <label>Observações<input name="notes" defaultValue={an.notes ?? ""} /></label>
          <label>Brinco do pai<input name="sire_tag" defaultValue={parentTag(an.sire_id)} /></label>
          <label>Brinco da mãe<input name="dam_tag" defaultValue={parentTag(an.dam_id)} /></label>
          <CustomFields defs={formDefs} values={custom} role={a.role} isNew={false} />
          <div style={{ alignSelf: "end" }}><button className="btn">Salvar alterações</button></div>
        </div>
      </form>
    </AppShell>
  );
}
