import Link from "next/link";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createTask, setTaskStatus } from "./actions";


const PRIO: Record<string, string> = { baixa: "baixa", normal: "normal", alta: "alta" };
const ERR: Record<string, string> = {
  animal: "Brinco não encontrado.", perm: "Você não tem permissão para esta operação.",
  falha: "Não foi possível salvar. Confira o título e o responsável (precisa ter acesso à fazenda).",
};
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem prazo");

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; st?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "tasks" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Alertas & Tarefas Operacionais
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Planejamento e acompanhamento de tarefas de manejo, sanidade e curral
            </p>
          </div>
        </div>
      </div>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("tasks.view")) {
    return (
      <AppShell {...shell}>
        <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Alertas & Tarefas Operacionais
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Planejamento e acompanhamento de tarefas de manejo, sanidade e curral
            </p>
          </div>
        </div>
      </div>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver as tarefas.</p></div>
      </AppShell>
    );
  }
  const st = ["aberta", "concluida", "cancelada"].includes(sp.st ?? "") ? sp.st! : "aberta";
  const [list, lots, members] = await Promise.all([
    supabase.rpc("task_list", { p_farm: a.id, p_status: st }),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    perms.includes("users.view") ? supabase.rpc("farm_members", { p_farm: a.id }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const rows: any[] = list.data ?? [];
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const canCreate = perms.includes("tasks.create");
  const canUpdate = perms.includes("tasks.update");

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Alertas & Tarefas Operacionais
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Planejamento e acompanhamento de tarefas de manejo, sanidade e curral
            </p>
          </div>
        </div>
      </div>
      {sp.ok && <div className="flash">Salvo.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}
      <form className="card filters" method="get">
        <label>Situação
          <select name="st" defaultValue={st}><option value="aberta">Abertas</option><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option></select>
        </label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card">
        {rows.length === 0 ? <p className="muted">Nenhuma tarefa.</p> : rows.map((t) => {
          const late = st === "aberta" && t.due_date && t.due_date < today;
          return (
            <div className="row" key={t.id}>
              <span>
                <strong>{t.title}</strong>
                <span className={late ? "error" : "muted"}> · {late ? "atrasada, " : ""}{fmtDate(t.due_date)}</span>
                <span className="muted"> · prioridade {PRIO[t.priority]}{t.assignee_email ? ` · ${t.assignee_email}` : ""}</span>
                {t.ear_tag && <span> · <Link href={`/herd/${t.animal_id}`} style={{ color: "var(--green)", fontWeight: 600 }}>{t.ear_tag}</Link></span>}
                {t.lot_name && <span className="muted"> · lote {t.lot_name}</span>}
                {t.description && <div className="muted">{t.description}</div>}
              </span>
              {canUpdate && (
                <span style={{ display: "flex", gap: 8 }}>
                  {st !== "concluida" && (
                    <form action={setTaskStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="concluida" /><button className="btn">Concluir</button></form>
                  )}
                  {st === "aberta" && (
                    <form action={setTaskStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="cancelada" />
                      <ConfirmSubmit label="Cancelar" message="Cancelar esta tarefa?" /></form>
                  )}
                  {st !== "aberta" && (
                    <form action={setTaskStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="aberta" /><button className="btn ghost">Reabrir</button></form>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {canCreate && (
        <form action={createTask} className="card">
          <strong>Nova tarefa</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Título *<input name="title" required maxLength={200} /></label>
            <label>Prazo<input name="due" type="date" /></label>
            <label>Prioridade
              <select name="priority" defaultValue="normal"><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option></select>
            </label>
            <label>Responsável
              <select name="assignee" defaultValue="">
                <option value="">(ninguém)</option><option value={ctx.user.id}>Eu</option>
                {((members.data ?? []) as any[]).filter((m) => m.user_id !== ctx.user.id && m.status === "active").map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.email}</option>
                ))}
              </select>
            </label>
            <label>Brinco do animal (opcional)<input name="ear_tag" /></label>
            <label>Lote (opcional)
              <select name="lot_id" defaultValue=""><option value="">—</option>{(lots.data ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label>Detalhes<input name="description" /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Criar tarefa</button></div>
          </div>
        </form>
      )}
      <p className="muted">TODO: tarefas recorrentes, geradas automaticamente a partir dos alertas, e avisos por e-mail ou WhatsApp.</p>
    </AppShell>
  );
}
