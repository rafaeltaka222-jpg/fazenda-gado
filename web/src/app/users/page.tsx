import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { ROLE_ORDER, roleLabel } from "@/lib/labels";
import {
  addMember,
  createUserWithPassword,
  resetMemberPassword,
  setMemberStatus,
  updateMemberRole,
} from "./actions";

const ERROS: Record<string, string> = {
  ultimo: "Não é possível remover, suspender ou rebaixar o último administrador da fazenda.",
  escalada: "Você não pode conceder um perfil com permissões que você mesmo não tem.",
  semconta: "Esse e-mail ainda não tem conta cadastrada.",
  jamembro: "Essa pessoa já tem acesso a esta fazenda.",
  proprio_perfil: "Ninguém altera o próprio perfil de acesso, nem o administrador.",
  proprio_status: "Você não pode desativar ou suspender a sua própria conta.",
  email_invalido: "Informe um endereço de e-mail válido com @.",
  senha_curta: "A senha de acesso deve ter pelo menos 6 caracteres.",
  falha_criacao: "Não foi possível criar a conta do usuário.",
  perm: "Você não tem permissão para esta operação.",
  falha: "Não foi possível concluir. Confira os dados e tente de novo.",
};

const OK: Record<string, string> = {
  adicionado: "Usuário cadastrado com credenciais de acesso e vinculado à fazenda.",
  perfil: "Perfil de acesso atualizado.",
  situacao: "Situação do usuário atualizada.",
  senha_alterada: "Senha de acesso redefinida com sucesso.",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "users" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Usuários & Perfis</h1>
        <div className="card">Selecione ou cadastre uma fazenda primeiro.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("users.view")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Usuários & Perfis</h1>
        <div className="card">
          <p className="muted">Seu perfil não tem permissão para ver os usuários da fazenda.</p>
        </div>
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
      <div className="head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Usuários & Perfis de Acesso
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Gestão de credenciais, controle de permissões (RBAC) e papéis da fazenda
            </p>
          </div>
        </div>
      </div>

      {sp.ok && <div className="flash">{OK[sp.ok] ?? "Operação concluída com sucesso."}</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERROS[sp.erro] ?? ERROS.falha}</div>}

      {/* Lista de Membros */}
      <div className="card" style={{ overflowX: "auto", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Membros com acesso à unidade {a.name}</strong>
          <span className="badge">{rows.length} {rows.length === 1 ? "usuário" : "usuários"}</span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil de Acesso</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isCurrentUser = m.user_id === ctx.user.id;
              return (
                <tr key={m.membership_id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{m.email}</span>
                      {isCurrentUser && (
                        <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>
                          ● Sua conta atual
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {canUpdate && !isCurrentUser ? (
                      <form action={updateMemberRole} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="hidden" name="membership_id" value={m.membership_id} />
                        <select
                          name="role_id"
                          defaultValue={m.role_id}
                          aria-label={`Perfil de ${m.email}`}
                          style={{ width: "auto", minWidth: 140 }}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {roleLabel(r.name)}
                            </option>
                          ))}
                        </select>
                        <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 12 }}>
                          Salvar
                        </button>
                      </form>
                    ) : (
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{roleLabel(m.role_name)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${m.status === "active" ? "badge-success" : "badge-warning"}`}>
                      {m.status === "active" ? "Ativo" : "Suspenso"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canUpdate && !isCurrentUser && (
                        <>
                          <form action={setMemberStatus}>
                            <input type="hidden" name="membership_id" value={m.membership_id} />
                            <input
                              type="hidden"
                              name="status"
                              value={m.status === "active" ? "suspended" : "active"}
                            />
                            <ConfirmSubmit
                              label={m.status === "active" ? "Suspender" : "Reativar"}
                              message={
                                m.status === "active"
                                  ? `Bloquear temporariamente o acesso de ${m.email}?`
                                  : `Reativar o acesso de ${m.email}?`
                              }
                            />
                          </form>

                          {/* Formulário rápido para redefinir senha do usuário */}
                          <form action={resetMemberPassword} style={{ display: "inline-flex", gap: 6 }}>
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <input
                              type="password"
                              name="new_password"
                              placeholder="Nova senha"
                              required
                              minLength={6}
                              style={{ width: 110, padding: "4px 8px", fontSize: 12 }}
                            />
                            <button
                              type="submit"
                              className="btn ghost"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              title="Redefinir senha de acesso deste usuário"
                            >
                              Redefinir
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.error && <p role="alert" className="error">Não foi possível carregar a lista de membros.</p>}
      </div>

      {/* Cadastro de Novo Usuário com Senha */}
      {canCreate && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 16 }}>Cadastrar Novo Usuário com Senha</strong>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Crie a conta de acesso para outro colaborador ou veterinário informando o e-mail e a senha inicial. O usuário poderá entrar imediatamente com essas credenciais.
            </p>
          </div>

          <form action={createUserWithPassword} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              Nome do Colaborador
              <input
                name="full_name"
                type="text"
                placeholder="Ex: João da Silva"
                style={{ padding: "8px 12px" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              E-mail de Acesso *
              <input
                name="email"
                type="email"
                required
                placeholder="usuario@jrcafe.com.br"
                style={{ padding: "8px 12px" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              Senha Inicial de Acesso *
              <input
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 dígitos"
                style={{ padding: "8px 12px" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              Perfil de Acesso (RBAC) *
              <select
                name="role_id"
                defaultValue={roles.find((r) => r.name === "visualizacao")?.id}
                style={{ padding: "8px 12px" }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r.name)}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ alignSelf: "end", gridColumn: "1 / -1", paddingTop: 8 }}>
              <button className="btn" type="submit" style={{ minWidth: 200, padding: "10px 20px" }}>
                Cadastrar e Liberar Acesso
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
