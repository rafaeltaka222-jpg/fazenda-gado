import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { ROLE_ORDER, roleLabel } from "@/lib/labels";
import { createField, setFieldStatus, updateField } from "./actions";


const TYPES: [string, string][] = [
  ["text", "Texto"], ["longtext", "Texto longo"], ["integer", "Número inteiro"], ["decimal", "Número decimal"],
  ["money", "Valor monetário"], ["percent", "Percentual"], ["date", "Data"], ["boolean", "Sim/Não"],
  ["list", "Lista de opções"], ["multilist", "Lista múltipla"], ["email", "E-mail"], ["phone", "Telefone"],
];
const TYPE_LABEL = Object.fromEntries(TYPES);
const ERR: Record<string, string> = {
  dup: "Já existe um campo com essa chave. Escolha outro nome.",
  opcoes: "Para listas, informe de 1 a 100 opções (uma por linha).",
  condicao: "Condição inválida.",
  perm: "Você não tem permissão para configurar campos.",
  falha: "Não foi possível salvar. Confira os dados.",
};
const OK: Record<string, string> = { criado: "Campo criado.", salvo: "Campo atualizado.", status: "Situação do campo atualizada." };

function RoleChecks({ name, selected }: { name: string; selected: string[] | null }) {
  return (
    <div className="cfield">
      <span>{name === "visible_to" ? "Quem pode ver (nenhum marcado = todos)" : "Quem pode editar (nenhum marcado = todos)"}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {ROLE_ORDER.map((r) => (
          <label key={r} style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--ink)" }}>
            <input type="checkbox" name={name} value={r} defaultChecked={selected?.includes(r) ?? false} /> {roleLabel(r)}
          </label>
        ))}
      </div>
    </div>
  );
}

function Flags({ d }: { d?: any }) {
  const on = (k: string, def: boolean) => (d ? !!d[k] : def);
  return (
    <div className="cfield">
      <span>Uso do campo</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {[["in_reports", "Aparece em relatórios", true], ["filterable", "Pode filtrar", true], ["sortable", "Pode ordenar", true], ["groupable", "Pode agrupar", false]].map(([k, l, def]) => (
          <label key={k as string} style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--ink)" }}>
            <input type="checkbox" name={k as string} defaultChecked={on(k as string, def as boolean)} /> {l as string}
          </label>
        ))}
      </div>
    </div>
  );
}

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "fields" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Campos personalizados</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  const canEdit = perms.includes("settings.update") && perms.includes("settings.create");
  if (!perms.includes("settings.view")) {
    redirect("/dashboard?erro=sem_permissao");
  }
  const { data } = await supabase.from("field_definitions").select("*").eq("farm_id", a.id).eq("entity", "animal").order("position").order("label");
  const defs: any[] = data ?? [];

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Campos Extras & Metadados
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Definição de atributos personalizados, regras de visibilidade e filtros dinâmicos
            </p>
          </div>
        </div>
      </div>
      {sp.ok && <div className="flash">{OK[sp.ok] ?? "Concluído."}</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      <div className="card">
        <strong>Campos cadastrados</strong>
        {defs.length === 0 ? (
          <p className="muted">Nenhum campo personalizado. Crie o primeiro abaixo (ex.: Número do SISBOV, Classificação genética).</p>
        ) : (
          defs.map((d) => (
            <details key={d.id} style={{ borderBottom: "1px solid #e7eae4", padding: "10px 0" }}>
              <summary style={{ cursor: "pointer" }}>
                <strong>{d.label}</strong> <span className="muted">· {TYPE_LABEL[d.data_type]} · chave {d.field_key}{d.required ? " · obrigatório" : ""}</span>{" "}
                <span className="badge">{d.status === "active" ? "ativo" : "inativo"}</span>
              </summary>
              {canEdit && (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <form action={updateField} className="form2">
                    <input type="hidden" name="field_key" value={d.field_key} />
                    <label>Nome do campo<input name="label" required defaultValue={d.label} /></label>
                    <label>Descrição<input name="description" defaultValue={d.description ?? ""} /></label>
                    {(d.data_type === "list" || d.data_type === "multilist") && (
                      <label>Opções (uma por linha)<textarea name="options" rows={4} defaultValue={(d.options ?? []).join("\n")} /></label>
                    )}
                    <label>Condição
                      <select name="cond_sex" defaultValue={d.condition?.field === "sex" ? d.condition.value : ""}>
                        <option value="">Sempre aparece</option><option value="F">Só para fêmeas</option><option value="M">Só para machos</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}>
                      <input type="checkbox" name="required" defaultChecked={d.required} /> Obrigatório
                    </label>
                    <Flags d={d} />
                    <RoleChecks name="visible_to" selected={d.visible_to} />
                    <RoleChecks name="editable_to" selected={d.editable_to} />
                    <div style={{ alignSelf: "end" }}><button className="btn">Salvar alterações</button></div>
                  </form>
                  <form action={setFieldStatus}>
                    <input type="hidden" name="field_key" value={d.field_key} />
                    <input type="hidden" name="status" value={d.status === "active" ? "inactive" : "active"} />
                    <ConfirmSubmit
                      label={d.status === "active" ? "Desativar campo" : "Reativar campo"}
                      message={d.status === "active"
                        ? "Desativar este campo? Ele some dos novos formulários, mas os dados já cadastrados são preservados."
                        : "Reativar este campo?"}
                    />
                  </form>
                  <p className="muted">O tipo e a chave de um campo não podem ser alterados depois de criados.</p>
                </div>
              )}
            </details>
          ))
        )}
      </div>

      {canEdit && (
        <form action={createField} className="card">
          <strong>Novo campo</strong>
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Nome do campo *<input name="label" required placeholder="ex.: Número do SISBOV" /></label>
            <label>Tipo *
              <select name="data_type" required defaultValue="text">
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Descrição<input name="description" /></label>
            <label>Opções (para listas, uma por linha)<textarea name="options" rows={4} /></label>
            <label>Valor padrão<input name="default_value" /></label>
            <label>Tamanho máximo (texto)<input name="max_length" inputMode="numeric" /></label>
            <label>Casas decimais<input name="decimals" inputMode="numeric" /></label>
            <label>Ordem de exibição<input name="position" inputMode="numeric" defaultValue="100" /></label>
            <label>Condição
              <select name="cond_sex" defaultValue="">
                <option value="">Sempre aparece</option><option value="F">Só para fêmeas</option><option value="M">Só para machos</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}>
              <input type="checkbox" name="required" /> Obrigatório
            </label>
            <Flags />
            <RoleChecks name="visible_to" selected={null} />
            <RoleChecks name="editable_to" selected={null} />
            <div style={{ alignSelf: "end" }}><button className="btn">Criar campo</button></div>
          </div>
        </form>
      )}
      <p className="muted">
        Os campos aparecem no cadastro e na ficha do animal e podem ser usados em relatórios (aparecem com o nome do campo).
        TODO: cadastros personalizados (ex.: Equipamentos), condições entre campos personalizados na tela, mudança de tipo com
        migração assistida e índices para consultas muito grandes.
      </p>
    </AppShell>
  );
}
