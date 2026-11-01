import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import CustomFields from "@/components/CustomFields";
import { loadAnimalDefs } from "@/lib/catalog";
import { createAnimal } from "../actions";

export const instant = false;

export default async function NewAnimalPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await connection();
  const { erro } = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "herd" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Novo animal</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [breeds, cats, lots, pastures] = await Promise.all([
    supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
  ]);
  const defs = await loadAnimalDefs(supabase, a.id, a.role);
  const opts = (rows: any[] | null) =>
    (rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>);

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Novo animal</h1>
        <Link href="/herd" className="btn ghost">Voltar</Link>
      </div>
      <div className="card">
        {erro === "dup" && <p role="alert" className="error">Já existe um animal com este brinco nesta fazenda.</p>}
        {erro === "pai" && <p role="alert" className="error">Pai ou mãe não encontrado (confira o brinco: o pai deve ser macho e a mãe, fêmea).</p>}
        {erro && erro !== "dup" && erro !== "pai" && <p role="alert" className="error">Não foi possível salvar o animal. Verifique os dados e a sua permissão.</p>}
        <form action={createAnimal} className="form2">
          <label>Brinco *<input name="ear_tag" required /></label>
          <label>Nome<input name="name" /></label>
          <label>Sexo *
            <select name="sex" required defaultValue="">
              <option value="" disabled>Selecione</option>
              <option value="M">Macho</option>
              <option value="F">Fêmea</option>
            </select>
          </label>
          <label>Raça<select name="breed_id" defaultValue=""><option value="">—</option>{opts(breeds.data)}</select></label>
          <label>Categoria<select name="category_id" defaultValue=""><option value="">—</option>{opts(cats.data)}</select></label>
          <label>Lote<select name="lot_id" defaultValue=""><option value="">—</option>{opts(lots.data)}</select></label>
          <label>Pasto<select name="pasture_id" defaultValue=""><option value="">—</option>{opts(pastures.data)}</select></label>
          <label>Data de nascimento<input name="birth_date" type="date" /></label>
          <label>Data de entrada<input name="entry_date" type="date" /></label>
          <label>Origem<input name="origin" /></label>
          <label>Observações<input name="notes" /></label>
          <label>Brinco do pai<input name="sire_tag" /></label>
          <label>Brinco da mãe<input name="dam_tag" /></label>
          <CustomFields defs={defs} values={{}} role={a.role} isNew />
          <div style={{ alignSelf: "end" }}><button className="btn">Salvar animal</button></div>
        </form>
      </div>
    </AppShell>
  );
}
