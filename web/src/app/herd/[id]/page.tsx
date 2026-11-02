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

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate);
  const now = new Date();
  const diffMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (diffMonths < 1) return "< 1 mês";
  if (diffMonths < 24) return `${diffMonths} meses`;
  const years = Math.floor(diffMonths / 12);
  const remainingMonths = diffMonths % 12;
  return remainingMonths > 0 ? `${years}a ${remainingMonths}m` : `${years} anos`;
}

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
  const gmdVal = gmdDays > 0 ? (lastW.weight_kg - prevW.weight_kg) / gmdDays : null;
  const gmdTxt = gmdVal != null ? gmdVal.toFixed(2).replace(".", ",") : "—";
  const fmtKg = (v: number) => Number(v).toFixed(1).replace(".", ",");
  const fmtArroba = (kg: number) => (kg / 30).toFixed(1).replace(".", ",");
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
  const opts = (rows: any[] | null) =>
    (rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  // Verificar se o animal está em período de carência sanitária
  const activeWithdrawal = hEvents.find((e) => !e.voided_at && e.withdrawal_until && e.withdrawal_until >= today);

  return (
    <AppShell {...shell}>
      {/* Dossier Header */}
      <div className="dossier-banner">
        <div className="dossier-identity">
          <div className="dossier-icon">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 0 0-7.07 17.07L12 22l7.07-2.93A10 10 0 0 0 12 2z" />
            </svg>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="dossier-tag">Brinco #{an.ear_tag}</span>
              <span className={`badge ${an.sex === "M" ? "tag-male" : "tag-female"}`}>
                {an.sex === "M" ? "♂ Macho" : "♀ Fêmea"}
              </span>
              <span className={`badge ${an.status === "ativo" ? "" : an.status === "vendido" ? "blue" : "neutral"}`}>
                {an.status}
              </span>
            </div>
            <div className="dossier-sub">
              {an.name && <span><strong>Nome:</strong> {an.name} ·</span>}
              <span><strong>Raça:</strong> {nm(breeds.data, an.breed_id)}</span>
              <span>· <strong>Categoria:</strong> {nm(cats.data, an.category_id)}</span>
              <span>· <strong>Idade:</strong> {calcAge(an.birth_date)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/herd" className="btn ghost">← Voltar ao Rebanho</Link>
        </div>
      </div>

      {/* Alerta de Carência Sanitária */}
      {activeWithdrawal && (
        <div className="flash bad" role="alert" style={{ borderLeft: "5px solid #dc2626" }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <strong>Animal em Período de Carência Sanitária!</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13.5 }}>
              Produto aplicado: <strong>{hName(activeWithdrawal.product_id)}</strong>. Carência até <strong>{fmtDate(activeWithdrawal.withdrawal_until)}</strong>. Abate e comercialização restritos conforme boas práticas sanitárias.
            </p>
          </div>
        </div>
      )}

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
      {sp.erro === "custom" && <div className="flash bad" role="alert">Os dados principais foram salvos, mas não foi possível salvar os campos personalizados. Confira os valores e permissões.</div>}
      {sp.erro === "obrigatorio" && <div className="flash bad" role="alert">Há campo personalizado obrigatório sem preenchimento. Preencha em "Dados cadastrais" abaixo.</div>}
      {sp.erro === "vazio" && <div className="flash bad" role="alert">Informe o produto e a data.</div>}
      {sp.erro === "falha" && <div className="flash bad" role="alert">Não foi possível registrar a aplicação sanitária.</div>}

      {/* Cards de Métricas Principais */}
      <div className="grid">
        <div className="card">
          <small className="muted">Peso Atual</small>
          <div className="big" style={{ color: "var(--brand)" }}>
            {lastW ? `${fmtKg(lastW.weight_kg)} kg` : "—"}
          </div>
          {lastW && <small className="muted">{fmtArroba(lastW.weight_kg)} @ carcaça est.</small>}
        </div>

        <div className="card">
          <small className="muted">Ganho Médio Diário (GMD)</small>
          <div className="big" style={{ color: gmdVal && gmdVal > 0 ? "var(--brand)" : "var(--ink)" }}>
            {gmdTxt === "—" ? "—" : `${gmdTxt} kg/dia`}
          </div>
          <small className="muted">{gmdDays > 0 ? `Intervalo de ${Math.round(gmdDays)} dias` : "Primeira pesagem"}</small>
        </div>

        <div className="card">
          <small className="muted">Lote Atual</small>
          <div className="big">{nm(lots.data, an.lot_id)}</div>
          <small className="muted">Grupo de manejo</small>
        </div>

        <div className="card">
          <small className="muted">Pasto Atual</small>
          <div className="big">{nm(pastures.data, an.pasture_id)}</div>
          <small className="muted">Localização física</small>
        </div>

        <div className="card">
          <small className="muted">Data de Nascimento</small>
          <div className="big">{fmtDate(an.birth_date)}</div>
          <small className="muted">Idade: {calcAge(an.birth_date)}</small>
        </div>
      </div>

      {/* Seção 1: Pesagens e Curva Ponderal */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong>⚖️ Histórico de Pesagens ({wAct.length})</strong>
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
                          <ConfirmSubmit className="btn ghost" label="Anular" message="Anular esta pesagem? Ela deixará de contar nos cálculos estatísticos." />
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
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-secondary)" }}>+ Lançar Nova Pesagem</span>
            <form action={registerWeighings} className="form2" style={{ marginTop: 10 }}>
              <input type="hidden" name="back" value={`/herd/${an.id}`} />
              <label>Peso em Balança (kg)<input name={`peso_${an.id}`} inputMode="decimal" required placeholder="ex.: 485.5" /></label>
              <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Horário<input name="time" type="time" defaultValue={new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })} required /></label>
              <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Lançar Pesagem" message="Registrar esta pesagem para o animal?" /></div>
            </form>
          </div>
        )}
      </div>

      {/* Seção 2: Sanidade e Medicamentos */}
      <div className="card">
        <strong>💉 Histórico Sanitário e Vacinas</strong>
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
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-secondary)" }}>+ Aplicar Medicamento ou Vacina</span>
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

      {/* Seção 3: Genealogia e Descendentes */}
      <div className="card">
        <strong>🧬 Genealogia e Família</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 12 }}>
          <div style={{ padding: 14, background: "var(--bg-subtle)", borderRadius: 12, border: "1px solid var(--line)" }}>
            <span className="muted" style={{ fontSize: 12 }}>PAI / REPRODUTOR</span>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
              {an.sire_id ? <Link href={`/herd/${an.sire_id}`} style={{ color: "var(--brand)" }}>Brinco #{parentTag(an.sire_id) || "—"}</Link> : <span className="muted">Não informado</span>}
            </div>
          </div>
          <div style={{ padding: 14, background: "var(--bg-subtle)", borderRadius: 12, border: "1px solid var(--line)" }}>
            <span className="muted" style={{ fontSize: 12 }}>MÃE / MATRIZ</span>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
              {an.dam_id ? <Link href={`/herd/${an.dam_id}`} style={{ color: "var(--brand)" }}>Brinco #{parentTag(an.dam_id) || "—"}</Link> : <span className="muted">Não informada</span>}
            </div>
          </div>
          <div style={{ padding: 14, background: "var(--bg-subtle)", borderRadius: 12, border: "1px solid var(--line)" }}>
            <span className="muted" style={{ fontSize: 12 }}>FILHOS REGISTRADOS ({kids.length})</span>
            <div style={{ marginTop: 4, fontSize: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {kids.length === 0 ? <span className="muted">Nenhum bezerro</span> : kids.map((k) => (
                <Link key={k.id} href={`/herd/${k.id}`} className="badge" style={{ textDecoration: "none" }}>
                  #{k.ear_tag} ({k.sex === "M" ? "♂" : "♀"})
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Seção 4: Reprodução (Apenas Fêmeas) */}
      {an.sex === "F" && (
        <div className="card">
          <strong>🐄 Eventos Reprodutivos</strong>
          {repro.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>Nenhum evento reprodutivo registrado.</p> : (
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
            <Link href="/reproduction" style={{ color: "var(--brand)", fontWeight: 600 }}>
              → Ir para a Central de Reprodução
            </Link>
          </p>
        </div>
      )}

      {/* Seção 5: Histórico de Movimentações */}
      <div className="card">
        <strong>📍 Histórico de Manejo e Movimentações</strong>
        {(eventsRes.data ?? []).length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>Sem histórico registrado.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {(eventsRes.data ?? []).map((e: any) => (
              <div className="event" key={e.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{LABEL[e.event_type] ?? e.event_type}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(e.event_date)}</span>
                </div>
                <span className="muted" style={{ fontSize: 13.5 }}>{describe(e)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seção 6: Movimentação Rápida */}
      {an.status === "ativo" && (
        <form action={moveAnimals} className="card">
          <strong>🔄 Movimentar Este Animal</strong>
          <input type="hidden" name="ids" value={an.id} />
          <input type="hidden" name="back" value={`/herd/${an.id}`} />
          <div className="form2" style={{ marginTop: 12 }}>
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
      )}

      {/* Seção 7: Edição Cadastral e Campos Personalizados */}
      <form action={updateAnimal} className="card">
        <strong>📋 Dados Cadastrais & Registro SISBOV</strong>
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
          <label>Brinco do Pai<input name="sire_tag" defaultValue={parentTag(an.sire_id)} placeholder="Número do brinco" /></label>
          <label>Brinco da Mãe<input name="dam_tag" defaultValue={parentTag(an.dam_id)} placeholder="Número do brinco" /></label>
          <CustomFields defs={formDefs} values={custom} role={a.role} isNew={false} />
          <div style={{ alignSelf: "end" }}><button className="btn">Salvar Alterações Cadastrais</button></div>
        </div>
      </form>
    </AppShell>
  );
}