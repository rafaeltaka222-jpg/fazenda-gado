import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { registerBirthAction, registerEvent, voidReproduction } from "./actions";

export const instant = false;

const ST: Record<string, string> = { sem_registro: "sem registro", servida: "servida", prenha: "prenha", vazia: "vazia", parida: "parida" };
const TYPE: Record<string, string> = { cobertura: "Cobertura", inseminacao: "Inseminação", diagnostico: "Diagnóstico", parto: "Parto", aborto: "Aborto" };
const ERR: Record<string, string> = {
  femea: "Fêmea não encontrada entre os animais ativos (confira o brinco e o sexo).", macho: "Reprodutor não encontrado ou não é macho.",
  brinco: "Já existe um animal com o brinco do bezerro.", bezerro: "Este parto gerou um bezerro cadastrado e não pode ser anulado.",
  perm: "Você não tem permissão para esta operação.", falha: "Não foi possível registrar. Confira a data (não pode ser futura) e os campos obrigatórios.",
};
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default async function ReproductionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; st?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reproduction" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Reprodução</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("reproduction.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Reprodução</h1>
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
      .eq("farm_id", a.id).is("voided_at", null).order("created_at", { ascending: false }).limit(12),
  ]);
  const alerts: any = al.data ?? {};
  const females = ((stat.data ?? []) as any[]).filter((f) => !filter || f.status === filter).slice(0, 200);
  const events: any[] = ev.data ?? [];
  const ids = [...new Set(events.flatMap((e) => [e.female_id, e.male_id].filter(Boolean)))];
  const tag = new Map<string, string>();
  if (ids.length) ((await supabase.from("animals").select("id, ear_tag").in("id", ids)).data ?? []).forEach((x: any) => tag.set(x.id, x.ear_tag));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

  return (
    <AppShell {...shell}>
      <h1 className="title">Reprodução</h1>
      {sp.ok && <div className="flash">Registrado.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      <div className="grid">
        <div className="card"><small className="muted">Servidas</small><div className="big">{alerts.servida ?? 0}</div></div>
        <div className="card"><small className="muted">Prenhas</small><div className="big">{alerts.prenha ?? 0}</div></div>
        <div className="card"><small className="muted">Partos previstos em 30 dias</small><div className="big">{alerts.calving_30d ?? 0}</div></div>
        <div className="card"><small className="muted">Partos atrasados</small><div className="big">{alerts.overdue_calving ?? 0}</div></div>
        <div className="card"><small className="muted">Diagnóstico pendente (+45 dias)</small><div className="big">{alerts.diagnosis_pending ?? 0}</div></div>
        <div className="card"><small className="muted">Nascimentos em 30 dias</small><div className="big">{alerts.births_30d ?? 0}</div></div>
      </div>

      <form className="card filters" method="get">
        <label>Situação
          <select name="st" defaultValue={filter}>
            <option value="">Todas</option>
            {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn">Filtrar</button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>Fêmeas ativas</strong>
        {females.length === 0 ? <p className="muted">Nenhuma fêmea encontrada.</p> : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Brinco</th><th>Situação</th><th>Último evento</th><th>Parto previsto</th></tr></thead>
            <tbody>{females.map((f) => (
              <tr key={f.animal_id}>
                <td><Link href={`/herd/${f.animal_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{f.ear_tag}</Link></td>
                <td><span className="badge">{ST[f.status]}</span></td><td>{fmtDate(f.last_event_date)}</td><td>{fmtDate(f.expected_calving)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="muted">Parto previsto = última cobertura/inseminação + 283 dias (estimativa média para bovinos).</p>
      </div>

      {canCreate && (
        <>
          <form action={registerEvent} className="card">
            <strong>Registrar cobertura, inseminação, diagnóstico ou aborto</strong>
            <input type="hidden" name="back" value="/reproduction" />
            <div className="form2" style={{ marginTop: 12 }}>
              <label>Brinco da fêmea<input name="female_tag" required /></label>
              <label>Evento
                <select name="type" defaultValue="cobertura">
                  <option value="cobertura">Cobertura (monta natural)</option><option value="inseminacao">Inseminação</option>
                  <option value="diagnostico">Diagnóstico de gestação</option><option value="aborto">Aborto</option>
                </select>
              </label>
              <label>Data<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Brinco do reprodutor (cobertura)<input name="male_tag" /></label>
              <label>Sêmen/touro da IA<input name="semen" /></label>
              <label>Resultado (diagnóstico)
                <select name="result" defaultValue=""><option value="">—</option><option value="positivo">Positivo (prenha)</option><option value="negativo">Negativo (vazia)</option></select>
              </label>
              <label>Observações<input name="notes" /></label>
              <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Registrar" message="Registrar este evento reprodutivo?" /></div>
            </div>
          </form>
          <form action={registerBirthAction} className="card">
            <strong>Registrar parto (cria o bezerro)</strong>
            <input type="hidden" name="back" value="/reproduction" />
            <div className="form2" style={{ marginTop: 12 }}>
              <label>Brinco da mãe<input name="dam_tag" required /></label>
              <label>Data do parto<input name="date" type="date" defaultValue={today} max={today} required /></label>
              <label>Resultado
                <select name="outcome" defaultValue="vivo"><option value="vivo">Bezerro vivo</option><option value="natimorto">Natimorto</option></select>
              </label>
              <label>Brinco do bezerro<input name="calf_tag" /></label>
              <label>Sexo do bezerro
                <select name="calf_sex" defaultValue="F"><option value="F">Fêmea</option><option value="M">Macho</option></select>
              </label>
              <label>Brinco do pai (vazio = último reprodutor da cobertura)<input name="sire_tag" /></label>
              <label>Observações<input name="notes" /></label>
              <div style={{ alignSelf: "end" }}><ConfirmSubmit className="btn" label="Registrar parto" message="Registrar o parto? O bezerro é cadastrado com a mãe e o pai." /></div>
            </div>
          </form>
        </>
      )}

      <div className="card">
        <strong>Últimos eventos</strong>
        {events.length === 0 ? <p className="muted">Nenhum evento registrado.</p> : events.map((e) => (
          <div className="row" key={e.id}>
            <span>
              {fmtDate(e.event_date)} · <strong>{TYPE[e.event_type]}</strong> · {tag.get(e.female_id) ?? "—"}
              {e.male_id ? <span className="muted"> × {tag.get(e.male_id) ?? "—"}</span> : null}
              {e.result ? <span className="muted"> · {e.result}</span> : null}
            </span>
            {canUpdate && !e.calf_id && (
              <form action={voidReproduction} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value="/reproduction" />
                <input name="reason" required minLength={3} placeholder="Motivo" aria-label="Motivo da anulação" style={{ width: 150 }} />
                <ConfirmSubmit label="Anular" message="Anular este evento?" />
              </form>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
