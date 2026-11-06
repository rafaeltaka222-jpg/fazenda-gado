import { getContext, resolveRolePermissions } from "@/lib/context";
import { selectFarm } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { roleLabel } from "@/lib/labels";
import { createFarm, createFarmInOrg, updateFarm } from "./actions";


export default async function FarmsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "farms" };

  let orgId: string | null = null;
  let farmRow: any = null;
  if (a) {
    const supabase = await createClient();
    const perms = a.permissions ?? resolveRolePermissions(a.role);
    const { data } = await supabase
      .from("farms")
      .select("organization_id, name, legal_name, tax_id, state_registration, address, city, state, latitude, longitude, area_ha, notes")
      .eq("id", a.id)
      .maybeSingle();
    if (a.role === "administrador") {
      orgId = (data as any)?.organization_id ?? null;
    }
    if (perms.includes("farms.update")) {
      farmRow = data;
    }
  }

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Gestão de Fazendas & Unidades
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Seleção da unidade ativa, cadastro de novas propriedades e dados cadastrais
            </p>
          </div>
        </div>
      </div>
      {sp.ok === "dados" ? <div className="flash">Dados da fazenda atualizados.</div> : sp.ok ? <div className="flash">Fazenda criada e selecionada como ativa.</div> : null}
      {sp.erro === "dados" && <div className="flash bad" role="alert">Não foi possível salvar. Confira UF (2 letras) e os números.</div>}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Só administradores criam fazendas na organização.</div>}
      {sp.erro === "acesso" && <div className="flash bad" role="alert">Você já tem acesso a uma organização. Peça a um administrador para criar novas fazendas.</div>}
      {sp.erro === "1" && <div className="flash bad" role="alert">Não foi possível criar. Verifique os dados (o código da fazenda deve ser único).</div>}

      <div className="card">
        <strong>Minhas fazendas</strong>
        {ctx.farms.length === 0 ? (
          <p className="muted">Você ainda não tem acesso a nenhuma fazenda. Crie a primeira abaixo ou peça a um administrador para adicionar o seu e-mail.</p>
        ) : (
          ctx.farms.map((f) => {
            const isActive = a?.id === f.id;
            return (
              <div className="row" key={f.membershipId}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: isActive ? 700 : 500 }}>{f.code} · {f.name}</span>
                  {isActive && <span className="badge">Fazenda Ativa</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge neutral">{roleLabel(f.role)}</span>
                  {!isActive && (
                    <form action={selectFarm}>
                      <input type="hidden" name="farm" value={f.id} />
                      <button type="submit" className="btn ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
                        Selecionar Fazenda
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {ctx.farms.length === 0 && (
        <div className="card">
          <strong>Nova organização e fazenda</strong>
          <form action={createFarm} className="form" style={{ marginTop: 12 }}>
            <input name="org" required placeholder="Nome da organização" aria-label="Nome da organização" />
            <input name="code" required placeholder="Código da fazenda (ex.: F001)" aria-label="Código da fazenda" />
            <input name="name" required placeholder="Nome da fazenda" aria-label="Nome da fazenda" />
            <button className="btn">Criar</button>
          </form>
        </div>
      )}

      {farmRow && a && (
        <form key={a.id} action={updateFarm} className="card">
          <strong>Dados da fazenda ativa ({a.code})</strong>
          <input type="hidden" name="id" value={a.id} />
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Nome *<input name="name" required defaultValue={farmRow.name ?? ""} /></label>
            <label>Razão social<input name="legal_name" defaultValue={farmRow.legal_name ?? ""} /></label>
            <label>CNPJ/CPF<input name="tax_id" defaultValue={farmRow.tax_id ?? ""} /></label>
            <label>Inscrição Estadual (Recomendado)<input name="state_registration" defaultValue={farmRow.state_registration ?? ""} placeholder="Ex.: 12.345.678-9" /></label>
            <label>Endereço / Localização<input name="address" defaultValue={farmRow.address ?? ""} /></label>
            <label>Município *<input name="city" required defaultValue={farmRow.city ?? ""} placeholder="Ex.: Uberlândia" /></label>
            <label>UF (Estado) *<input name="state" required maxLength={2} defaultValue={farmRow.state ?? ""} placeholder="Ex.: MG" /></label>
            <label>Área Total (ha)<input name="area_ha" inputMode="decimal" defaultValue={farmRow.area_ha ?? ""} placeholder="Ex.: 1250" /></label>
            <label>Latitude (Coordenadas)<input name="latitude" inputMode="decimal" defaultValue={farmRow.latitude ?? ""} placeholder="-18.9186" /></label>
            <label>Longitude (Coordenadas)<input name="longitude" inputMode="decimal" defaultValue={farmRow.longitude ?? ""} placeholder="-48.2772" /></label>
            <label>CAR / Responsável / Observações<input name="notes" defaultValue={farmRow.notes ?? ""} placeholder="Ex.: CAR: MG-3170206-..., Responsável: João Silva" /></label>
            <div style={{ alignSelf: "end" }}><button className="btn">Salvar dados</button></div>
          </div>
        </form>
      )}

      {orgId && (
        <div className="card">
          <strong>Nova fazenda na sua organização</strong>
          <form action={createFarmInOrg} className="form" style={{ marginTop: 12 }}>
            <input type="hidden" name="org_id" value={orgId} />
            <input name="code" required placeholder="Código da fazenda (ex.: F002)" aria-label="Código da fazenda" />
            <input name="name" required placeholder="Nome da fazenda" aria-label="Nome da fazenda" />
            <button className="btn">Criar fazenda</button>
          </form>
        </div>
      )}
    </AppShell>
  );
}
