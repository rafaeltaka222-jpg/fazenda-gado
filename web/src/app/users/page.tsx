import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { ROLE_ORDER, roleLabel } from "@/lib/labels";
import { addMember, setMemberStatus, updateMemberRole } from "./actions";

export const instant = false;

const ERROS: Record<string, string> = {
  ultimo: "Não é possível remover, suspender ou rebaixar o último administrador da fazenda.",
  escalada: "Você não pode conceder um perfil com permissões que você mesmo não tem.",
  semconta: "Esse e-mail ainda não tem conta. Peça para a pessoa criar a conta na tela de login e depois adicione aqui.",
  jamembro: "Essa pessoa já tem acesso a esta fazenda.",
  perm: "Você não tem permissão para esta operação.",
  falha: "Não foi possível concluir. Confira os dados e tente de novo.",
};
const OK: Record<string, string> = { adicionado: "Usuário adicionado à fazenda.", perfil: "Perfil atualizado.", situacao: "Situação atualizada." };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "users" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Usuários</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const permsRes = await supabase.rpc("my_permissions", { p_farm: a.id });
  const perms: string[] = (permsRes.data as string[] | null) ?? [];
  if (!perms.includes("users.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Usuários</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver os usuários.</p></div>
      </AppShell>
    );
  }
  const canCreate = perms.includes("users.create");
  const canUpdate = perms.includes("users.update");

  const [members, rolesRes] = await Promise.all([
    supabase.rpc("farm_members", { p_farm: a.id }),
    supabase.from("roles").select("id, name").eq("is_system", true),
  ]);
  const roles = ((rolesRes.data ?? []) as { id: string; name: string }[]).sort(
    (x, y) => ROLE_ORDER.indexOf(x.name) - ROLE_ORDER.indexOf(y.name)
  );
  const rows = (members.data ?? []) as any[];

  return (
    <AppShell {...shell}>
      <h1 className="title">Usuários da fazenda</h1>
      {sp.ok && <div className="flash">{OK[sp.ok] ?? "Concluído."}</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERROS[sp.erro] ?? ERROS.falha}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>Quem tem acesso a {a.name}</strong>
        <table className="table" style={{ marginTop: 8 }}>
          <thead><tr><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.membership_id}>
                <td>{m.email}{m.user_id === ctx.user.id ? <span className="muted"> (você)</span> : null}</td>
                <td>
                  {canUpdate ? (
                    <form action={updateMemberRole} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="membership_id" value={m.membership_id} />
                      <select name="role_id" defaultValue={m.role_id} aria-label={`Perfil de ${m.email}`} style={{ width: "auto" }}>
                        {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                      </select>
                      <button className="btn ghost">Salvar</button>
                    </form>
                  ) : (
                    roleLabel(m.role_name)
                  )}
                </td>
                <td><span className="badge">{m.status === "active" ? "ativo" : "suspenso"}</span></td>
                <td>
                  {canUpdate && (
                    <form action={setMemberStatus}>
                      <input type="hidden" name="membership_id" value={m.membership_id} />
                      <input type="hidden" name="status" value={m.status === "active" ? "suspended" : "active"} />
                      <ConfirmSubmit
                        label={m.status === "active" ? "Suspender" : "Reativar"}
                        message={m.status === "active" ? "Suspender o acesso desta pessoa à fazenda?" : "Reativar o acesso desta pessoa?"}
                      />
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.error && <p role="alert" className="error">Não foi possível carregar a lista.</p>}
      </div>

      {canCreate && (
        <form action={addMember} className="card">
          <strong>Adicionar pessoa</strong>
          <p className="muted">A pessoa precisa ter criado a conta na tela de login. Depois, informe o e-mail e escolha o perfil.</p>
          <div className="form2">
            <label>E-mail<input name="email" type="email" required /></label>
            <label>Perfil
              <select name="role_id" defaultValue={roles.find((r) => r.name === "visualizacao")?.id}>
                {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
              </select>
            </label>
            <div style={{ alignSelf: "end" }}><button className="btn">Adicionar</button></div>
          </div>
        </form>
      )}
      <p className="muted">
        TODO: convite por e-mail, autenticação em dois fatores, perfis personalizados e permissão por campo na tela.
        Você só concede perfis com permissões que você mesmo possui.
      </p>
    </AppShell>
  );
}
