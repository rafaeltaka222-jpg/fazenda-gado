import Link from "next/link";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import CustomFields from "@/components/CustomFields";
import { loadAnimalDefs } from "@/lib/catalog";
import { createAnimal } from "../actions";

const ERROS: Record<string, string> = {
  dup: "Já existe um animal cadastrado com este brinco nesta fazenda.",
  sexo: "Selecione o sexo do animal (Macho ou Fêmea).",
  brinco: "O brinco ou número de manejo é obrigatório.",
  sexo_cat: "Sexo e categoria incompatíveis! Macho: Bezerro, Garrote, Boi, Touro. Fêmea: Bezerra, Novilha, Vaca.",
  futuro: "A data de nascimento não pode estar no futuro.",
  compra_sem_entrada: "Para animais comprados, a data de entrada na fazenda é obrigatória.",
  entrada_antes_nasc: "A data de entrada na fazenda não pode ser anterior ao nascimento do animal.",
  pai_auto: "O animal não pode ser pai ou mãe de si mesmo (sem autociclos na genealogia).",
  pai_sexo_invalido: "O pai informado deve ser obrigatoriamente do sexo Macho.",
  mae_sexo_invalido: "A mãe informada deve ser obrigatoriamente do sexo Fêmea.",
  pai_nao_encontrado: "Brinco do pai não foi encontrado entre os animais desta fazenda.",
  mae_nao_encontrado: "Brinco da mãe não foi encontrado entre os animais desta fazenda.",
  pai_pai_jovem: "O pai precisa ser pelo menos 1 ano mais velho que o filho.",
  mae_mae_jovem: "A mãe precisa ser pelo menos 2 anos mais velha que o filho.",
  genealogia: "Inconsistência genealógica identificada nos vínculos de pai e mãe.",
  "1": "Não foi possível salvar o animal. Verifique os dados e a sua permissão.",
};

export default async function NewAnimalPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
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
  const [breedsInit, catsInit, lots, pastures, defs] = await Promise.all([
    supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
    supabase.from("lots").select("id, name").eq("farm_id", a.id).eq("status", "ativo").order("name"),
    supabase.from("pastures").select("id, name").eq("farm_id", a.id).neq("status", "inativo").order("name"),
    loadAnimalDefs(supabase, a.id, a.role),
  ]);
  let breeds = breedsInit;
  let cats = catsInit;

  if ((breeds.data ?? []).length === 0 || (cats.data ?? []).length === 0) {
    const defaultBreeds = ["Nelore", "Girolando", "Angus", "Brahman", "Senepol"];
    const defaultCats = ["Bezerro", "Bezerra", "Garrote", "Novilha", "Boi", "Vaca", "Touro"];
    await Promise.all([
      (breeds.data ?? []).length === 0
        ? supabase.from("breeds").upsert(defaultBreeds.map((name) => ({ farm_id: a.id, name })), { onConflict: "farm_id,name", ignoreDuplicates: true })
        : Promise.resolve(),
      (cats.data ?? []).length === 0
        ? supabase.from("categories").upsert(defaultCats.map((name) => ({ farm_id: a.id, name })), { onConflict: "farm_id,name", ignoreDuplicates: true })
        : Promise.resolve(),
    ]);
    [breeds, cats] = await Promise.all([
      supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
      supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
    ]);
  }

  const opts = (rows: any[] | null) =>
    (rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>);

  return (
    <AppShell {...shell}>
      <div className="head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>Cadastro de Animal</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
            Identificação individual, linhagem genealógica e dados zootécnicos do rebanho
          </p>
        </div>
        <Link href="/herd" className="btn ghost">Voltar ao Rebanho</Link>
      </div>

      <div className="card">
        {erro && (
          <div className="flash bad" role="alert" style={{ marginBottom: 18 }}>
            <strong>Atenção:</strong> {ERROS[erro] ?? ERROS["1"]}
          </div>
        )}

        <form action={createAnimal} className="form">
          {/* Seção 1: Campos Obrigatórios */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span className="badge" style={{ background: "var(--brand-light)", color: "var(--brand)" }}>1</span>
              <strong style={{ fontSize: 14.5 }}>Campos Obrigatórios</strong>
            </div>
            <div className="form2">
              <label>
                Brinco / Manejo *
                <input name="ear_tag" required placeholder="Ex.: 000123" />
              </label>

              <label>
                Sexo *
                <select name="sex" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  <option value="M">Macho</option>
                  <option value="F">Fêmea</option>
                </select>
              </label>

              <label>
                Categoria *
                <select name="category_id" required defaultValue="">
                  <option value="" disabled>Selecione a categoria</option>
                  {opts(cats.data)}
                </select>
              </label>

              <label>
                Data de Nascimento (ou estimada) *
                <input name="birth_date" type="date" required />
              </label>
            </div>
          </div>

          {/* Seção 2: Origem e Dados Recomendados */}
          <div style={{ marginBottom: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span className="badge neutral">2</span>
              <strong style={{ fontSize: 14.5 }}>Origem & Alojamento (Recomendados)</strong>
            </div>
            <div className="form2">
              <label>
                Origem do Animal
                <select name="origin" defaultValue="Nascido na fazenda">
                  <option value="Nascido na fazenda">Nascido na fazenda</option>
                  <option value="Comprado">Comprado</option>
                  <option value="Transferido">Transferido</option>
                </select>
              </label>

              <label>
                Data de Entrada na Fazenda
                <input name="entry_date" type="date" placeholder="Obrigatório se comprado" />
              </label>

              <label>
                Peso de Entrada (kg)
                <input name="entry_weight" type="number" step="0.1" min="1" max="1600" placeholder="Ex.: 180" />
              </label>

              <label>
                Raça
                <select name="breed_id" defaultValue=""><option value="">Selecione a raça</option>{opts(breeds.data)}</select>
              </label>

              <label>
                Pasto Atual
                <select name="pasture_id" defaultValue=""><option value="">Sem pasto atribuído</option>{opts(pastures.data)}</select>
              </label>

              <label>
                Lote de Manejo
                <select name="lot_id" defaultValue=""><option value="">Sem lote atribuído</option>{opts(lots.data)}</select>
              </label>
            </div>
          </div>

          {/* Seção 3: Genealogia e Opcionais */}
          <div style={{ marginBottom: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span className="badge neutral">3</span>
              <strong style={{ fontSize: 14.5 }}>Genealogia & Opcionais</strong>
            </div>
            <div className="form2">
              <label>
                Nome / Apelido do Animal
                <input name="name" placeholder="Ex.: Campeão 01" />
              </label>

              <label>
                Brinco do Pai (Macho, min. +1 ano)
                <input name="sire_tag" placeholder="Brinco do touro pai" />
              </label>

              <label>
                Brinco da Mãe (Fêmea, min. +2 anos)
                <input name="dam_tag" placeholder="Brinco da vaca mãe" />
              </label>

              <label>
                Observações
                <input name="notes" placeholder="Detalhes de manejo, pelagem..." />
              </label>
            </div>
          </div>

          <CustomFields defs={defs} values={{}} role={a.role} isNew />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <Link href="/herd" className="btn ghost">Cancelar</Link>
            <button type="submit" className="btn">Cadastrar Animal</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
