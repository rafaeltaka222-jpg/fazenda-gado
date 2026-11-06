import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createPerson, setPersonActive } from "./actions";


const ROLE: Record<string, string> = {
  funcionario: "Funcionário", proprietario: "Proprietário", veterinario: "Veterinário", zootecnista: "Zootecnista",
  fornecedor: "Fornecedor", comprador: "Comprador", transportador: "Transportador",
};
const ERR: Record<string, string> = {
  documento: "CPF ou CNPJ inválido.", duplicado: "Já existe uma pessoa com esse documento nesta fazenda.",
  perm: "Você não tem permissão para esta operação.", falha: "Não foi possível salvar. Confira os dados.",
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; papel?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "people" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Pessoas & Parceiros
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Cadastro de colaboradores, veterinários, fornecedores, transportadores e compradores
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
  if (!perms.includes("people.view")) {
    return (
      <AppShell {...shell}>
        <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Pessoas & Parceiros
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Cadastro de colaboradores, veterinários, fornecedores, transportadores e compradores
            </p>
          </div>
        </div>
      </div>
        <div className="card"><p className="muted">Seu perfil não tem permissão para ver o cadastro de pessoas.</p></div>
      </AppShell>
    );
  }
  const papel = sp.papel && sp.papel in ROLE ? sp.papel : "";
  let q = supabase.from("people").select("id, name, person_roles, document, phone, email, active").eq("farm_id", a.id).order("name");
  if (papel) q = q.contains("person_roles", [papel]);
  const { data } = await q;
  const rows: any[] = data ?? [];
  const canCreate = perms.includes("people.create");
  const canUpdate = perms.includes("people.update");

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Pessoas & Parceiros
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Cadastro de colaboradores, veterinários, fornecedores, transportadores e compradores
            </p>
          </div>
        </div>
      </div>
      {sp.ok && <div className="flash">Salvo.</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}
      <form className="card filters" method="get">
        <label>Papel
          <select name="papel" defaultValue={papel}><option value="">Todos</option>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="muted">Nenhuma pessoa cadastrada.</p> : (
          <table className="table">
            <thead><tr><th>Nome</th><th>Papéis</th><th>CPF/CNPJ</th><th>Contato</th><th>Situação</th><th></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{(p.person_roles as string[]).map((r) => ROLE[r]).join(", ") || "—"}</td>
                <td>{p.document ?? "—"}</td><td>{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</td>
                <td><span className="badge">{p.active ? "ativo" : "inativo"}</span></td>
                <td>{canUpdate && (
                  <form action={setPersonActive}>
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "false" : "true"} />
                    <ConfirmSubmit label={p.active ? "Desativar" : "Reativar"} message={p.active ? "Desativar esta pessoa?" : "Reativar esta pessoa?"} />
                  </form>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {canCreate && (
        <form action={createPerson} className="card">
          <strong>Nova pessoa</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Nome *<input name="name" required /></label>
            <label>CPF ou CNPJ<input name="document" /></label>
            <label>Telefone<input name="phone" type="tel" /></label>
            <label>E-mail<input name="email" type="email" /></label>
            <label>Observações<input name="notes" /></label>
            <div className="cfield"><span>Papéis</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {Object.entries(ROLE).map(([k, v]) => (
                  <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--ink)" }}><input type="checkbox" name="roles" value={k} /> {v}</label>
                ))}
              </div>
            </div>
            <div style={{ alignSelf: "end" }}><button className="btn">Cadastrar</button></div>
          </div>
          <p className="muted">LGPD: este cadastro só é visível para administradores e gerentes. Guarde apenas os dados necessários.</p>
        </form>
      )}
    </AppShell>
  );
}
