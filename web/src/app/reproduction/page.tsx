import Link from "next/link";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { registerBirthAction, registerEvent, voidReproduction } from "./actions";


const ST: Record<string, string> = { sem_registro: "Sem registro", servida: "Servida", prenha: "Prenha", vazia: "Vazia", parida: "Parida" };
const TYPE: Record<string, string> = { cobertura: "Cobertura", inseminacao: "Inseminação", diagnostico: "Diagnóstico", parto: "Parto", aborto: "Aborto" };
const ERR: Record<string, string> = {
  femea: "Fêmea não encontrada entre os animais ativos (confira o brinco e o sexo).",
  macho: "Reprodutor não encontrado ou não é macho.",
  brinco: "Já existe um animal com o brinco do bezerro.",
  bezerro: "Este parto gerou um bezerro cadastrado e não pode ser anulado.",
  perm: "Você não tem permissão para esta operação.",
  falha: "Não foi possível registrar. Confira a data (não pode ser futura) e os campos obrigatórios.",
};
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default async function ReproductionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; st?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reproduction" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Central de Reprodução & IATF</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("reproduction.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Central de Reprodução & IATF</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver a reprodução.</p></div>
      </AppShell>
    );
  }
  const canCreate = perms.includes("reproduction.create");
  const canUpdate = perms.includes("reproduction.update");
  const filter = sp.st && sp.st in ST ? sp.st : "";

  const [al, stat, ev] = await Promise.all([
    supabase.rpc("reproduction_alerts", { p_farm: a.id }),
    supabase.rpc("reproduction_status", { p_farm: a.id }),
    supabase.from("reproduction_events").select("id, female_id, male_id, event_type, event_date, result, calf_id")
      .eq("farm_id", a.id).is("voided_at", null).order("created_at", { ascending: false }).limit(15),
  ]);
  const alerts: any = al.data ?? {};
  const females = ((stat.data ?? []) as any[]).filter((f) => !filter || f.status === filter).slice(0, 200);
  const events: any[] = ev.data ?? [];
  const ids = [...new Set(events.flatMap((e) => [e.female_id, e.male_id].filter(Boolean)))];
  const tag = new Map<string, string>();
  if (ids.length) ((await supabase.from("animals").select("id, ear_tag").in("id", ids)).data ?? []).forEach((x: any) => tag.set(x.id, x.ear_tag));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "prenha": return "badge";
      case "servida": return "badge blue";
      case "parida": return "badge amber";
      case "vazia": return "badge red";
      default: return "badge neutral";
    }
  };

  return (
    <AppShell {...shell}>
      <div className="head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Central de Reprodução & IATF
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Controle de coberturas, inseminações, diagnóstico de gestação e partos
            </p>
          </div>
        </div>
      </div>

      {sp.ok && <div className="flash">Evento reprodutivo registrado com sucesso.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      {/* Grid de Métricas Reprodutivas */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #0284c7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Fêmeas Servidas</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="big" style={{ color: "#0284c7" }}>{alerts.servida ?? 0}</div>
          <small className="muted">Aguardando diagnóstico</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #059669" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Prenhas Confirmadas</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--brand)" }}>{alerts.prenha ?? 0}</div>
          <small className="muted">Gestação ativa</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Partos Próx. 30 Dias</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--amber)" }}>{alerts.calving_30d ?? 0}</div>
          <small className="muted">Atenção ao piquete maternidade</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Partos Atrasados</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="big" style={{ color: alerts.overdue_calving > 0 ? "var(--red)" : "var(--ink)" }}>{alerts.overdue_calving ?? 0}</div>
          <small className="muted">+283 dias pós-cobertura</small>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Diag. Pendente (+45d)</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="big">{alerts.diagnosis_pending ?? 0}</div>
          <small className="muted">Prontas para toque/US</small>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Bezerros Nascidos (30d)</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="big">{alerts.births_30d ?? 0}</div>
          <small className="muted">Nascimentos recentes</small>
        </div>
      </div>

      {/* Pílulas de Filtro Interativo */}
      <div className="card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-secondary)" }}>Filtrar por Situação:</span>
          <div className="pill-group">
            <Link href="/reproduction" className={`filter-pill ${filter === "" ? "active" : ""}`}>
              Todas as Matrizes
            </Link>
            {Object.entries(ST).map(([k, v]) => (
              <Link key={k} href={`/reproduction?st=${k}`} className={`filter-pill ${filter === k ? "active" : ""}`}>
                {v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de Fêmeas Ativas */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Matrizes & Fêmeas em Reprodução ({females.length})</strong>
          <small className="muted">Previsão média de gestação: 283 dias</small>
        </div>
        {females.length === 0 ? (
          <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>Nenhuma matriz encontrada para este filtro.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Identificação / Brinco</th>
                  <th>Situação Reprodutiva</th>
                  <th>Último Evento</th>
                  <th>Previsão de Parto</th>
                </tr>
              </thead>
              <tbody>
                {females.map((f) => (
                  <tr key={f.animal_id}>
                    <td>
                      <Link href={`/herd/${f.animal_id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>
                        Brinco #{f.ear_tag}
                      </Link>
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(f.status)}>
                        {ST[f.status] ?? f.status}
                      </span>
                    </td>
                    <td>{fmtDate(f.last_event_date)}</td>
                    <td>
                      {f.expected_calving ? (
                        <span style={{ fontWeight: 600, color: f.status === "prenha" ? "var(--brand)" : "inherit" }}>
                          {fmtDate(f.expected_calving)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ações Reprodutivas */}
      {canCreate && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
          {/* Lançamento de Cobertura / IA / DG */}
          <form action={registerEvent} className="card">
            <strong>Registrar Cobertura, Inseminação ou Diagnóstico</strong>
            <input type="hidden" name="back" value="/reproduction" />
            <div className="form2" style={{ marginTop: 14 }}>
              <label>Brinco da Fêmea *<input name="female_tag" required placeholder="Ex: 000105" /></label>
              <label>Tipo de Evento *
                <select name="type" defaultValue="cobertura">
                  <option value="cobertura">Cobertura (Monta Natural)</option>
                  <option value="inseminacao">Inseminação Artificial (IA / IATF)</option>
                  <option value="diagnostico">Diagnóstico de Gestação (DG)</option>
                  <option value="aborto">Registro de Aborto</option>
                </select>
              </label>
              <label>Data do Evento *<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Touro / Reprodutor (Monta)<input name="male_tag" placeholder="Brinco do touro" /></label>
              <label>Partida de Sêmen / Touro da IA<input name="semen" placeholder="Nome do touro da palheta" /></label>
              <label>Resultado (apenas p/ Diagnóstico)
                <select name="result" defaultValue="">
                  <option value="">—</option>
                  <option value="positivo">Positivo (Prenha)</option>
                  <option value="negativo">Negativo (Vazia)</option>
                </select>
              </label>
              <label>Observações Adicionais<input name="notes" placeholder="Detalhes do procedimento" /></label>
              <div style={{ alignSelf: "end" }}>
                <ConfirmSubmit className="btn" label="Registrar Evento" message="Confirmar o registro do evento reprodutivo?" />
              </div>
            </div>
          </form>

          {/* Lançamento de Parto com Criação Automática do Bezerro */}
          <form action={registerBirthAction} className="card">
            <strong>Registrar Parto & Cadastro do Bezerro</strong>
            <p className="muted" style={{ margin: "4px 0 14px", fontSize: 13 }}>
              Cria automaticamente o cadastro do bezerro no rebanho com vínculo genealógico completo.
            </p>
            <input type="hidden" name="back" value="/reproduction" />
            <div className="form2">
              <label>Brinco da Matriz (Mãe) *<input name="dam_tag" required placeholder="Ex: 000105" /></label>
              <label>Data do Parto *<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Resultado do Parto
                <select name="outcome" defaultValue="vivo">
                  <option value="vivo">Bezerro Nascido Vivo</option>
                  <option value="natimorto">Natimorto</option>
                </select>
              </label>
              <label>Brinco do Bezerro<input name="calf_tag" placeholder="Ex: 000201" /></label>
              <label>Sexo do Bezerro
                <select name="calf_sex" defaultValue="F">
                  <option value="F">Fêmea</option>
                  <option value="M">Macho</option>
                </select>
              </label>
              <label>Brinco do Pai (opcional)<input name="sire_tag" placeholder="Vazio = herda da cobertura" /></label>
              <label>Observações do Parto<input name="notes" placeholder="Peso ao nascer, vigor, etc." /></label>
              <div style={{ alignSelf: "end" }}>
                <ConfirmSubmit className="btn" label="Registrar Parto" message="Registrar o parto? O bezerro será inserido automaticamente no rebanho." />
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Histórico Recente de Eventos */}
      <div className="card">
        <strong>Últimos Eventos Reprodutivos Registrados</strong>
        {events.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>Nenhum evento recente registrado.</p>
        ) : (
          <div className="table-container" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Matriz</th>
                  <th>Reprodutor / Sêmen</th>
                  <th>Resultado</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.event_date)}</td>
                    <td><strong>{TYPE[e.event_type] ?? e.event_type}</strong></td>
                    <td>
                      <Link href={`/herd/${e.female_id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                        #{tag.get(e.female_id) ?? "—"}
                      </Link>
                    </td>
                    <td>{e.male_id ? `#${tag.get(e.male_id) ?? "—"}` : "—"}</td>
                    <td>{e.result ? <span className="badge">{e.result}</span> : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {canUpdate && !e.calf_id && (
                        <form action={voidReproduction} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="back" value="/reproduction" />
                          <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo anulação" style={{ width: 110, padding: "5px 8px", fontSize: 12.5 }} />
                          <ConfirmSubmit className="btn ghost" label="Anular" message="Anular este evento reprodutivo?" />
                        </form>
                      )}
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