import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmButton from "@/components/ConfirmButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import AnimalDossierTabs from "@/components/AnimalDossierTabs";
import { moveAnimals, updateAnimal } from "../actions";
import { registerWeighings, voidWeighing } from "../../weighings/actions";
import { registerHealth, voidHealth } from "../../health/actions";
import CustomFields from "@/components/CustomFields";
import { loadAnimalDefs } from "@/lib/catalog";

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
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, getContext()]);
  if (!UUID.test(id)) notFound();
  const a = ctx.active;
  if (!a) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "herd" };

  const supabase = await createClient();
  const [
    animalRes,
    eventsRes,
    lots,
    pastures,
    breeds,
    cats,
    wRes,
    customRes,
    allDefs,
    hevRes,
    hprodRes,
    reproRes,
  ] = await Promise.all([
    supabase
      .from("animals")
      .select("id, farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id, birth_date, origin, status, entry_date, exit_date, notes, version")
      .eq("id", id)
      .eq("farm_id", a.id)
      .maybeSingle(),
    supabase
      .from("animal_events")
      .select("id, event_type, event_date, details, created_at")
      .eq("animal_id", id)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("lots").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name, status").eq("farm_id", a.id).order("name"),
    supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
    supabase
      .from("weighings")
      .select("id, weighed_at, weight_kg, notes, voided_at, void_reason")
      .eq("animal_id", id)
      .order("weighed_at", { ascending: false }),
    supabase.rpc("get_animal_custom", { p_animal: id }),
    loadAnimalDefs(supabase, a.id, a.role, true),
    supabase
      .from("health_events")
      .select("id, product_id, event_date, dose, next_due_date, withdrawal_until, voided_at, void_reason")
      .eq("animal_id", id)
      .order("event_date", { ascending: false }),
    supabase.from("health_products").select("id, name, active").eq("farm_id", a.id).order("name"),
    supabase
      .from("reproduction_events")
      .select("id, event_type, event_date, result, male_id, calf_id")
      .eq("female_id", id)
      .is("voided_at", null)
      .order("event_date", { ascending: false })
      .limit(15),
  ]);
  const an: any = animalRes.data;
  if (!an) notFound();

  const wAll: any[] = wRes.data ?? [];
  const wAct = wAll.filter((w) => !w.voided_at);
  const lastW = wAct[0];
  const prevW = wAct[1];
  const gmdKgDay =
    lastW && prevW
      ? (Number(lastW.weight_kg) - Number(prevW.weight_kg)) /
        Math.max(1, (new Date(lastW.weighed_at).getTime() - new Date(prevW.weighed_at).getTime()) / 86400000)
      : null;
  const fmtKg = (v: number) => Number(v).toFixed(1).replace(".", ",");
  const fmtArroba = (kg: number) => (kg / 30).toFixed(1).replace(".", ",");
  const fmtDT = (s: string) =>
    new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });

  const custom: Record<string, any> = (customRes.data as Record<string, any> | null) ?? {};
  const formDefs = allDefs.filter((d) => d.status === "active");
  const hEvents: any[] = hevRes.data ?? [];
  const hProds: any[] = hprodRes.data ?? [];
  const hName = (pid: string) => hProds.find((p) => p.id === pid)?.name ?? "—";
  const parentIds = [an.sire_id, an.dam_id].filter(Boolean);
  const parentsRes = parentIds.length
    ? await supabase.from("animals").select("id, ear_tag").in("id", parentIds)
    : { data: [] as any[] };
  const parentTag = (pid: string | null) => ((parentsRes.data ?? []) as any[]).find((p) => p.id === pid)?.ear_tag ?? "";
  const repro: any[] = reproRes.data ?? [];
  const REPRO: Record<string, string> = {
    cobertura: "Cobertura",
    inseminacao: "Inseminação",
    diagnostico: "Diagnóstico",
    parto: "Parto",
    aborto: "Aborto",
  };

  const nm = (list: any[] | null, key: string | undefined) =>
    key ? (list ?? []).find((x) => x.id === key)?.name ?? "—" : "—";
  const describe = (e: any) => {
    const d = e.details ?? {};
    const parts: string[] = [];
    if (e.event_type === "entrada") {
      if (d.to_lot_id) parts.push(`Lote ${nm(lots.data, d.to_lot_id)}`);
      if (d.to_pasture_id) parts.push(`Pasto ${nm(pastures.data, d.to_pasture_id)}`);
    } else if (e.event_type === "transferencia") {
      if (d.to_lot_id && d.to_lot_id !== d.from_lot_id)
        parts.push(`Lote ${nm(lots.data, d.from_lot_id)} → ${nm(lots.data, d.to_lot_id)}`);
      if (d.to_pasture_id && d.to_pasture_id !== d.from_pasture_id)
        parts.push(`Pasto ${nm(pastures.data, d.from_pasture_id)} → ${nm(pastures.data, d.to_pasture_id)}`);
    }
    if (d.notes) parts.push(String(d.notes));
    return parts.join(" · ") || "—";
  };
  const opts = (rows: any[] | null) =>
    (rows ?? []).map((r) => (
      <option key={r.id} value={r.id}>
        {r.name}
      </option>
    ));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  const breedName = nm(breeds.data, an.breed_id) !== "—" ? nm(breeds.data, an.breed_id) : "Nelore";
  const lotName = nm(lots.data, an.lot_id);
  const pastureName = nm(pastures.data, an.pasture_id);
  const sireTag = parentTag(an.sire_id);
  const damTag = parentTag(an.dam_id);
  const electronicId = `985 000${String(an.ear_tag).replace(/\D/g, "").padStart(3, "0").slice(-3)} ${an.id.replace(/\D/g, "").padEnd(6, "4").slice(0, 6)}`;

  const activeWithdrawal = hEvents.find((e) => !e.voided_at && e.withdrawal_until && e.withdrawal_until >= today);

  // Abas de conteúdo para AnimalDossierTabs
  const historyPane = (
    <div className="card" style={{ padding: "16px 20px" }}>
      {(eventsRes.data ?? []).length === 0 && wAct.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Nenhum registro encontrado no histórico.</span>
          </div>
          <Link href="/weighings" style={{ color: "var(--brand)", fontWeight: 700, fontSize: 13.5 }}>
            Ver todas atividades &gt;
          </Link>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ fontSize: 14.5 }}>Linha do Tempo de Atividades ({(eventsRes.data ?? []).length})</strong>
            <Link href="/audit" style={{ color: "var(--brand)", fontWeight: 700, fontSize: 13 }}>
              Ver todas atividades &gt;
            </Link>
          </div>
          {(eventsRes.data ?? []).map((e: any) => (
            <div className="event" key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "var(--ink)" }}>{LABEL[e.event_type] ?? e.event_type}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(e.event_date)}</span>
              </div>
              <span className="muted" style={{ fontSize: 13.5 }}>{describe(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const weighingsPane = (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <strong>Histórico de Pesagens ({wAct.length})</strong>
      </div>
      {wAll.length === 0 ? (
        <p className="muted">Nenhuma pesagem registrada até o momento.</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Data & Horário</th>
                <th>Peso (kg)</th>
                <th>Arroba (@)</th>
                <th>Observações</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {wAll.map((w) => (
                <tr key={w.id} style={w.voided_at ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                  <td>{fmtDT(w.weighed_at)}</td>
                  <td><strong>{fmtKg(w.weight_kg)} kg</strong></td>
                  <td>{fmtArroba(w.weight_kg)} @</td>
                  <td>
                    {w.voided_at ? <span className="badge red">Anulada: {w.void_reason ?? ""}</span> : w.notes || "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!w.voided_at && (
                      <form action={voidWeighing} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="back" value={`/herd/${an.id}`} />
                        <input name="reason" required minLength={3} placeholder="Motivo anulação" aria-label="Motivo anulação" style={{ width: 140, padding: "5px 8px", fontSize: 12.5 }} />
                        <ConfirmSubmit className="btn ghost" label="Anular" message="Anular esta pesagem?" />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {an.status === "ativo" && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 13.5, color: "var(--ink)" }}>+ Lançar Nova Pesagem</strong>
          <form action={registerWeighings} className="form2" style={{ marginTop: 10 }}>
            <input type="hidden" name="back" value={`/herd/${an.id}`} />
            <label>Peso em Balança (kg)<input name={`peso_${an.id}`} inputMode="decimal" required placeholder="ex.: 425,0" /></label>
            <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Horário<input name="time" type="time" defaultValue="08:30" required /></label>
            <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Lançar Pesagem" message="Registrar esta pesagem para o animal?" /></div>
          </form>
        </div>
      )}
    </div>
  );

  const vaccinesPane = (
    <div className="card">
      <strong>Histórico Sanitário e Vacinas ({hEvents.length})</strong>
      {hEvents.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>Nenhuma aplicação ou vacina registrada para este animal.</p>
      ) : (
        <div className="table-container" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th>Dose</th>
                <th>Próxima Aplicação</th>
                <th>Carência Sanitária</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {hEvents.map((e) => (
                <tr key={e.id} style={e.voided_at ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                  <td>{fmtDate(e.event_date)}</td>
                  <td><strong>{hName(e.product_id)}</strong></td>
                  <td>{e.dose || "—"}</td>
                  <td>{e.next_due_date ? fmtDate(e.next_due_date) : "—"}</td>
                  <td>
                    {e.withdrawal_until ? (
                      <span className={`badge ${e.withdrawal_until >= today ? "amber" : "neutral"}`}>
                        até {fmtDate(e.withdrawal_until)}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!e.voided_at && (
                      <form action={voidHealth} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="back" value={`/herd/${an.id}`} />
                        <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo anulação" style={{ width: 120, padding: "5px 8px", fontSize: 12.5 }} />
                        <ConfirmSubmit className="btn ghost" label="Anular" message="Anular esta aplicação sanitária?" />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {an.status === "ativo" && hProds.some((p) => p.active) && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 13.5, color: "var(--ink)" }}>+ Aplicar Medicamento ou Vacina</strong>
          <form action={registerHealth} className="form2" style={{ marginTop: 10 }}>
            <input type="hidden" name="ids" value={an.id} />
            <input type="hidden" name="back" value={`/herd/${an.id}`} />
            <label>Produto Veterinário
              <select name="product_id" required defaultValue="">
                <option value="" disabled>Selecione</option>
                {hProds.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Data de Aplicação<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Dose Aplicada<input name="dose" placeholder="ex.: 5 ml" /></label>
            <label>Previsão Próxima Dose<input name="next" type="date" /></label>
            <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Registrar Aplicação" message="Confirmar o registro da aplicação?" /></div>
          </form>
        </div>
      )}
    </div>
  );

  const reproductionPane = (
    <div className="card">
      <strong>Eventos Reprodutivos</strong>
      {repro.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>Nenhum evento reprodutivo registrado para este animal.</p>
      ) : (
        <div className="table-container" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo de Evento</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {repro.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.event_date)}</td>
                  <td><strong>{REPRO[e.event_type] ?? e.event_type}</strong></td>
                  <td>{e.result ? <span className="badge">{e.result}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ marginTop: 14, fontSize: 13.5 }}>
        <Link href="/reproduction" style={{ color: "var(--brand)", fontWeight: 700 }}>
          Ir para a Central de Reprodução &gt;
        </Link>
      </p>
    </div>
  );

  const movementsPane = (
    <div className="card">
      <strong>Transferir de Lote / Pastagem ou Baixar</strong>
      {an.status === "ativo" ? (
        <form action={moveAnimals} style={{ marginTop: 12 }}>
          <input type="hidden" name="ids" value={an.id} />
          <input type="hidden" name="back" value={`/herd/${an.id}`} />
          <div className="form2">
            <label>Tipo de Operação
              <select name="op" defaultValue="transferencia">
                <option value="transferencia">Transferir de Pasto / Lote</option>
                <option value="venda">Registrar Venda</option>
                <option value="morte">Registrar Morte / Baixa</option>
              </select>
            </label>
            <label>Data da Operação<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Lote de Destino
              <select name="lot_id" defaultValue=""><option value="">(manter atual)</option>
                {opts((lots.data ?? []).filter((l: any) => l.status === "ativo"))}
              </select>
            </label>
            <label>Pasto de Destino
              <select name="pasture_id" defaultValue=""><option value="">(manter atual)</option>
                {opts((pastures.data ?? []).filter((p: any) => p.status !== "inativo"))}
              </select>
            </label>
            <label>Observações do Manejo<input name="notes" placeholder="Motivo da troca" /></label>
            <div style={{ alignSelf: "end" }}><ConfirmButton label="Confirmar Movimentação" /></div>
          </div>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>Animal com status {an.status} (movimentações encerradas).</p>
      )}
    </div>
  );

  const editPane = (
    <form action={updateAnimal} className="card">
      <strong>Editar Dados Cadastrais & Genealogia</strong>
      <input type="hidden" name="id" value={an.id} />
      <input type="hidden" name="version" value={an.version} />
      <div className="form2" style={{ marginTop: 14 }}>
        <label>Identificação / Brinco *<input name="ear_tag" required defaultValue={an.ear_tag} /></label>
        <label>Nome ou Apelido<input name="name" defaultValue={an.name ?? ""} /></label>
        <label>Sexo *
          <select name="sex" required defaultValue={an.sex}>
            <option value="M">Macho</option><option value="F">Fêmea</option>
          </select>
        </label>
        <label>Raça<select name="breed_id" defaultValue={an.breed_id ?? ""}><option value="">—</option>{opts(breeds.data)}</select></label>
        <label>Categoria<select name="category_id" defaultValue={an.category_id ?? ""}><option value="">—</option>{opts(cats.data)}</select></label>
        <label>Data de Nascimento<input name="birth_date" type="date" defaultValue={an.birth_date ?? ""} /></label>
        <label>Data de Entrada na Fazenda<input name="entry_date" type="date" defaultValue={an.entry_date ?? ""} /></label>
        <label>Origem (Nascido / Comprado)<input name="origin" defaultValue={an.origin ?? ""} /></label>
        <label>Observações Gerais<input name="notes" defaultValue={an.notes ?? ""} /></label>
        <label>Brinco do Pai<input name="sire_tag" defaultValue={sireTag} placeholder="Número do brinco" /></label>
        <label>Brinco da Mãe<input name="dam_tag" defaultValue={damTag} placeholder="Número do brinco" /></label>
        <CustomFields defs={formDefs} values={custom} role={a.role} isNew={false} />
        <div style={{ alignSelf: "end" }}><button className="btn">Salvar Alterações Cadastrais</button></div>
      </div>
    </form>
  );

  return (
    <AppShell {...shell}>
      {/* Link Voltar Fiel à Imagem 2 */}
      <div>
        <Link
          href="/herd"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--ink-secondary)",
          }}
        >
          <span>←</span>
          <span>Voltar para Animais</span>
        </Link>
      </div>

      {activeWithdrawal && (
        <div className="flash bad" role="alert" style={{ borderLeft: "5px solid #c93535" }}>
          <div>
            <strong>Animal em Período de Carência Sanitária!</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13.5 }}>
              Produto aplicado: <strong>{hName(activeWithdrawal.product_id)}</strong>. Carência até{" "}
              <strong>{fmtDate(activeWithdrawal.withdrawal_until)}</strong>.
            </p>
          </div>
        </div>
      )}

      {sp.ok && <div className="flash">Salvo com sucesso.</div>}
      {sp.erro && (
        <div className="flash bad" role="alert">
          {sp.erro === "dup"
            ? "Já existe outro animal cadastrado com este brinco nesta fazenda."
            : sp.erro === "sexo_cat"
            ? "Sexo e categoria incompatíveis! Macho: Bezerro, Garrote, Boi, Touro. Fêmea: Bezerra, Novilha, Vaca."
            : sp.erro === "futuro"
            ? "A data de nascimento não pode estar no futuro."
            : sp.erro === "compra_sem_entrada"
            ? "Para animais comprados, a data de entrada na fazenda é obrigatória."
            : sp.erro === "entrada_antes_nasc"
            ? "A data de entrada na fazenda não pode ser anterior ao nascimento."
            : sp.erro === "pai_auto"
            ? "O animal não pode ser pai ou mãe de si mesmo (sem autociclos na genealogia)."
            : sp.erro?.startsWith("pai_")
            ? "Inconsistência no brinco do pai (verifique se existe, se é macho e tem idade adequada)."
            : sp.erro?.startsWith("mae_")
            ? "Inconsistência no brinco da mãe (verifique se existe, se é fêmea e tem idade adequada)."
            : "Não foi possível salvar a alteração solicitada. Confira os dados e permissões."}
        </div>
      )}

      {/* CABEÇALHO DO ANIMAL FIEL À IMAGEM 2 (ILUSTRAÇÃO NELORE + BRINCO VERDE + ELECTRONIC ID + VIVO / NÃO VENDIDO) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          flexWrap: "wrap",
          padding: "8px 0 4px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* Retrato Ilustrado do Bovino Nelore (Fiel à Imagem 2) */}
          <div
            style={{
              position: "relative",
              width: 118,
              height: 118,
              borderRadius: 16,
              background: "linear-gradient(180deg, #162032 0%, #0e1422 100%)",
              border: "1px solid var(--line-strong)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
              {/* Pescoço e Cupim Nelore */}
              <path d="M35 120 L42 78 Q60 70 78 78 L85 120 Z" fill="#cfd4d0" stroke="#5d6560" strokeWidth="1.8" />
              {/* Chifres */}
              <path d="M40 34 Q31 20 38 14 Q43 22 47 31 Z" fill="#6b645c" stroke="#3d3834" strokeWidth="1.5" />
              <path d="M80 34 Q89 20 82 14 Q77 22 73 31 Z" fill="#6b645c" stroke="#3d3834" strokeWidth="1.5" />
              {/* Orelhas lanceoladas típicas do Nelore */}
              <path d="M38 40 Q14 38 12 49 Q24 56 40 48 Z" fill="#d8dcd9" stroke="#555c58" strokeWidth="1.8" />
              <path d="M35 43 Q20 42 18 48 Q26 52 37 46 Z" fill="#a89088" opacity="0.65" />
              <path d="M82 40 Q106 38 108 49 Q96 56 80 48 Z" fill="#d8dcd9" stroke="#555c58" strokeWidth="1.8" />
              <path d="M85 43 Q100 42 102 48 Q94 52 83 46 Z" fill="#a89088" opacity="0.65" />
              {/* Cabeça */}
              <path
                d="M40 32 Q60 25 80 32 L83 56 Q80 76 70 84 Q60 89 50 84 Q40 76 37 56 Z"
                fill="#e7ece8"
                stroke="#4d5450"
                strokeWidth="2"
              />
              {/* Olhos expressivos */}
              <ellipse cx="46" cy="52" rx="3.2" ry="2.6" fill="#232725" />
              <circle cx="45" cy="51.2" r="0.9" fill="#ffffff" />
              <ellipse cx="74" cy="52" rx="3.2" ry="2.6" fill="#232725" />
              <circle cx="73" cy="51.2" r="0.9" fill="#ffffff" />
              {/* Focinho escuro característico do Nelore */}
              <path d="M47 74 Q60 70 73 74 Q75 85 68 88 Q60 90 52 88 Q45 85 47 74 Z" fill="#525754" />
              <ellipse cx="53.5" cy="81" rx="3.2" ry="2.2" fill="#252927" />
              <ellipse cx="66.5" cy="81" rx="3.2" ry="2.2" fill="#252927" />
            </svg>

            {/* Selo • ATIVO no canto inferior esquerdo da foto */}
            <span
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                background: "#235c2a",
                color: "#ffffff",
                fontSize: 10.5,
                fontWeight: 800,
                padding: "3px 9px",
                borderRadius: 999,
                letterSpacing: "0.04em",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffffff" }} />
              {an.status === "ativo" ? "ATIVO" : String(an.status).toUpperCase()}
            </span>
          </div>

          {/* Identificação Principal e Etiquetas */}
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.15, color: "var(--ink)" }}>
              {breedName}{" "}
              <span style={{ color: "var(--brand)" }}>{an.ear_tag}</span>
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 8,
                  background: "var(--brand-light)",
                  border: "1px solid var(--brand-border)",
                  color: "var(--brand)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Brinco {an.ear_tag}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--line-strong)",
                  color: "var(--ink-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--ink)" }}>((•)) Electronic ID</span>
                <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 13 }}>
                  {electronicId}
                </span>
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--ink-secondary)" }}>
              Lote: <strong>{lotName}</strong> • Pasto: <strong>{pastureName}</strong> • Entrada:{" "}
              <strong>{fmtDate(an.entry_date || an.birth_date)}</strong>
            </div>
          </div>
        </div>

        {/* Selos Vivo e Não Vendido à direita (Fiel à Imagem 2) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 8,
              background: an.status === "morte" ? "var(--red-light)" : "var(--brand-light)",
              color: an.status === "morte" ? "var(--red)" : "var(--brand)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: an.status === "morte" ? "var(--red)" : "var(--brand)",
              }}
            />
            {an.status === "morte" ? "Baixado" : "Vivo"}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 8,
              background: "var(--blue-light)",
              color: "var(--blue)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)" }} />
            {an.status === "vendido" ? "Vendido" : "Não Vendido"}
          </span>
        </div>
      </div>

      {/* CARD 1: DADOS BÁSICOS (FIEL À IMAGEM 2) */}
      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "var(--brand-light)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="9" x2="17" y2="9" />
                <line x1="7" y1="13" x2="13" y2="13" />
              </svg>
            </span>
            <strong style={{ fontSize: 16, color: "var(--ink)" }}>Dados Básicos</strong>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "18px 24px",
          }}
        >
          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Sexo</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>
              {an.sex === "M" ? "Macho" : "Fêmea"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Raça</div>
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 700,
                color: "var(--brand)",
                marginTop: 3,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7h-2.2l-1.3-2.2c-.3-.5-.8-.8-1.4-.8H9.9c-.6 0-1.1.3-1.4.8L7.2 7H5c-1.1 0-2 .9-2 2v2c0 1.5 1.1 2.8 2.5 3l.8 4.4c.2.9 1 1.6 2 1.6h7.4c1 0 1.8-.7 2-1.6l.8-4.4c1.4-.2 2.5-1.5 2.5-3V9c0-1.1-.9-2-2-2z" />
              </svg>
              <span>{breedName}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Data de Nascimento</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>
              {fmtDate(an.birth_date)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Peso Atual / GMD</div>
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 700,
                color: "var(--ink)",
                marginTop: 3,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                <path d="M6 7h12l2 13H4L6 7z" />
                <path d="M9 7V5a3 3 0 016 0v2" />
              </svg>
              <span>{lastW ? `${fmtKg(lastW.weight_kg)} kg` : "Sem pesagem"}</span>
              {gmdKgDay !== null && (
                <span className="badge" style={{ fontSize: 11.5 }}>
                  GMD: {gmdKgDay >= 0 ? "+" : ""}{gmdKgDay.toFixed(2).replace(".", ",")} kg/dia
                </span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Lote</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>
              {lotName}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pasto / Área</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>
              {pastureName}
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: GENEALOGIA (FIEL À IMAGEM 2) */}
      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "var(--brand-light)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <strong style={{ fontSize: 16, color: "var(--ink)" }}>Genealogia</strong>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          <div style={{ paddingRight: 16, borderRight: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pai</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
              {sireTag ? `${breedName} ${sireTag}` : "Não informado"}
            </div>
            <div
              style={{
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--ink-secondary)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {an.sire_id && sireTag ? (
                <Link href={`/herd/${an.sire_id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                  Brinco {sireTag}
                </Link>
              ) : (
                <span className="muted">Sem registro paterno vinculado</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Mãe</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
              {damTag ? `${breedName} ${damTag}` : "Não informada"}
            </div>
            <div
              style={{
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--ink-secondary)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {an.dam_id && damTag ? (
                <Link href={`/herd/${an.dam_id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                  Brinco {damTag}
                </Link>
              ) : (
                <span className="muted">Sem registro materno vinculado</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ABAS INTERATIVAS + BOTÕES IMPRIMIR FICHA E EXPORTAR PDF (FIEL À IMAGEM 2) */}
      <AnimalDossierTabs
        earTag={an.ear_tag}
        historyPane={historyPane}
        weighingsPane={weighingsPane}
        vaccinesPane={vaccinesPane}
        reproductionPane={reproductionPane}
        movementsPane={movementsPane}
        editPane={editPane}
      />
    </AppShell>
  );
}
