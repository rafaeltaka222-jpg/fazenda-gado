import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { roleLabel } from "@/lib/labels";
import { createFarm, createFarmInOrg, updateFarm } from "./actions";

export const instant = false;

export default async function FarmsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "farms" };

  let orgId: string | null = null;
  if (a && a.role === "administrador") {
    const supabase = await createClient();
    const { data } = await supabase.from("farms").select("organization_id").eq("id", a.id).maybeSingle();
    orgId = (data as any)?.organization_id ?? null;
  }

  let farmRow: any = null;
  if (a) {
    const supabase = await createClient();
    const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
    if (perms.includes("farms.update")) {
      farmRow = (await supabase.from("farms").select("name, legal_name, tax_id, state_registration, address, city, state, latitude, longitude, area_ha, notes")
        .eq("id", a.id).maybeSingle()).data;
    }
  }

  return (
    <AppShell {...shell}>
      <h1 className="title">Fazendas</h1>
      {sp.ok === "dados" ? <div className="flash">Dados da fazenda atualizados.</div> : sp.ok ? <div className="flash">Fazenda criada.</div> : null}
      {sp.erro === "dados" && <div className="flash bad" role="alert">Não foi possível salvar. Confira UF (2 letras) e os números.</div>}
      {sp.erro === "perm" && <div className="flash bad" role="alert">Só administradores criam fazendas na organização.</div>}
      {sp.erro === "acesso" && <div className="flash bad" role="alert">Você já tem acesso a uma organização. Peça a um administrador para criar novas fazendas.</div>}
      {sp.erro === "1" && <div className="flash bad" role="alert">Não foi possível criar. Verifique os dados (o código da fazenda deve ser único).</div>}

      <div className="card">
        <strong>Minhas fazendas</strong>
        {ctx.farms.length === 0 ? (
          <p className="muted">Você ainda não tem acesso a nenhuma fazenda. Crie a primeira abaixo ou peça a um administrador para adicionar o seu e-mail.</p>
        ) : (
          ctx.farms.map((f) => (
            <div className="row" key={f.membershipId}>
              <span>{f.code} · {f.name}</span>
              <span className="badge">{roleLabel(f.role)}</span>
            </div>
          ))
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
        <form action={updateFarm} className="card">
          <strong>Dados da fazenda ativa ({a.code})</strong>
          <input type="hidden" name="id" value={a.id} />
          <div className="form2" style={{ marginTop: 12 }}>
            <label>Nome *<input name="name" required defaultValue={farmRow.name ?? ""} /></label>
            <label>Razão social<input name="legal_name" defaultValue={farmRow.legal_name ?? ""} /></label>
            <label>CNPJ/CPF<input name="tax_id" defaultValue={farmRow.tax_id ?? ""} /></label>
            <label>Inscrição estadual<input name="state_registration" defaultValue={farmRow.state_registration ?? ""} /></label>
            <label>Endereço<input name="address" defaultValue={farmRow.address ?? ""} /></label>
            <label>Município<input name="city" defaultValue={farmRow.city ?? ""} /></label>
            <label>UF<input name="state" maxLength={2} defaultValue={farmRow.state ?? ""} /></label>
            <label>Latitude<input name="latitude" inputMode="decimal" defaultValue={farmRow.latitude ?? ""} /></label>
            <label>Longitude<input name="longitude" inputMode="decimal" defaultValue={farmRow.longitude ?? ""} /></label>
            <label>Área (ha)<input name="area_ha" inputMode="decimal" defaultValue={farmRow.area_ha ?? ""} /></label>
            <label>Observações<input name="notes" defaultValue={farmRow.notes ?? ""} /></label>
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
