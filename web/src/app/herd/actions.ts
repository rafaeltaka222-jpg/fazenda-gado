"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const g = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
// Campos personalizados: cf_<chave> (valor simples) e cfm_<chave> (lista múltipla)
function collectCustom(f: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...f.keys()])) {
    if (key.startsWith("cfm_")) out[key.slice(4)] = f.getAll(key).map(String).filter(Boolean);
    else if (key.startsWith("cf_")) out[key.slice(3)] = String(f.get(key) ?? "").trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
  }
  return out;
}
const customErr = (m: string) => (m.includes("required_missing") ? "obrigatorio" : "custom");

// Pai/mãe informados pelo brinco. Valida existência, sexo e idade reprodutiva mínima (mãe >= 2 anos, pai >= 1 ano).
async function resolveParent(
  supabase: any,
  farm: string,
  tag: string | null,
  expectedSex: "M" | "F",
  childBirthDate?: string | null,
  childEarTag?: string | null
) {
  if (!tag) return { id: null as string | null, error: null };
  const cleanTag = tag.trim();
  if (childEarTag && cleanTag.toLowerCase() === childEarTag.trim().toLowerCase()) {
    return { id: null, error: "auto" };
  }
  const { data } = await supabase
    .from("animals")
    .select("id, sex, birth_date, ear_tag")
    .eq("farm_id", farm)
    .eq("ear_tag", cleanTag)
    .maybeSingle();

  if (!data) return { id: null, error: "nao_encontrado" };
  if (data.sex !== expectedSex) return { id: null, error: "sexo_invalido" };

  // Validação temporal de idade reprodutiva:
  if (childBirthDate && data.birth_date) {
    const parentTime = new Date(data.birth_date).getTime();
    const childTime = new Date(childBirthDate).getTime();
    const diffDays = (childTime - parentTime) / (1000 * 60 * 60 * 24);
    // Mãe: mínimo de cerca de 2 anos (700 dias)
    if (expectedSex === "F" && diffDays < 700) {
      return { id: null, error: "mae_jovem" };
    }
    // Pai: mínimo de cerca de 1 ano (330 dias)
    if (expectedSex === "M" && diffDays < 330) {
      return { id: null, error: "pai_jovem" };
    }
  }

  return { id: data.id as string, error: null };
}

const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

export async function createAnimal(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const sex = g(formData, "sex");
  if (sex !== "M" && sex !== "F") redirect("/herd/new?erro=sexo");

  const earTag = g(formData, "ear_tag");
  if (!earTag) redirect("/herd/new?erro=brinco");

  const birthDate = g(formData, "birth_date");
  const today = new Date().toISOString().split("T")[0];
  if (birthDate && birthDate > today) {
    redirect("/herd/new?erro=futuro");
  }

  const origin = g(formData, "origin");
  const entryDate = g(formData, "entry_date");
  const isCompra = origin && (origin.toLowerCase().includes("compra") || origin.toLowerCase() === "comprado");
  if (isCompra && !entryDate) {
    redirect("/herd/new?erro=compra_sem_entrada");
  }
  if (entryDate && birthDate && entryDate < birthDate) {
    redirect("/herd/new?erro=entrada_antes_nasc");
  }

  const supabase = await createClient();

  // Validação de compatibilidade Sexo x Categoria:
  // Macho: bezerro, garrote, boi, touro | Fêmea: bezerra, novilha, vaca
  const categoryId = g(formData, "category_id");
  if (categoryId) {
    const { data: catRow } = await supabase.from("categories").select("name").eq("id", categoryId).maybeSingle();
    if (catRow?.name) {
      const cName = catRow.name.toLowerCase();
      const femaleOnly = ["bezerra", "novilha", "vaca"];
      const maleOnly = ["bezerro", "garrote", "boi", "touro"];
      if (sex === "M" && femaleOnly.some((f) => cName.includes(f))) {
        redirect("/herd/new?erro=sexo_cat");
      }
      if (sex === "F" && maleOnly.some((m) => cName.includes(m))) {
        redirect("/herd/new?erro=sexo_cat");
      }
    }
  }

  const sire = await resolveParent(supabase, ctx.active.id, g(formData, "sire_tag"), "M", birthDate, earTag);
  if (sire.error) redirect(`/herd/new?erro=pai_${sire.error}`);

  const dam = await resolveParent(supabase, ctx.active.id, g(formData, "dam_tag"), "F", birthDate, earTag);
  if (dam.error) redirect(`/herd/new?erro=mae_${dam.error}`);

  const { data: created, error } = await supabase.from("animals").insert({
    farm_id: ctx.active.id,
    ear_tag: earTag,
    name: g(formData, "name"),
    sex,
    sire_id: sire.id,
    dam_id: dam.id,
    breed_id: g(formData, "breed_id"),
    category_id: categoryId,
    lot_id: g(formData, "lot_id"),
    pasture_id: g(formData, "pasture_id"),
    birth_date: birthDate,
    origin,
    entry_date: entryDate,
    notes: g(formData, "notes"),
  }).select("id").single();

  if (error || !created) {
    redirect(`/herd/new?erro=${error?.code === "23505" ? "dup" : error?.message.includes("invalid_parent") ? "genealogia" : "1"}`);
  }

  // Se informou peso de entrada (kg), registra pesagem inicial automaticamente:
  const entryWeightRaw = g(formData, "entry_weight");
  if (entryWeightRaw) {
    const w = Number(entryWeightRaw.replace(",", "."));
    if (Number.isFinite(w) && w > 0 && w <= 1600) {
      await supabase.rpc("register_weighings", {
        p_farm: ctx.active.id,
        p_items: [{
          animal_id: created.id,
          weighed_at: `${entryDate || birthDate || today}T10:00:00-03:00`,
          weight_kg: w,
        }],
      });
    }
  }

  const custom = collectCustom(formData);
  if (Object.keys(custom).length > 0) {
    const { error: ce } = await supabase.rpc("set_animal_custom", { p_animal: created.id, p_values: custom });
    if (ce) redirect(`/herd/${created.id}?erro=${customErr(ce.message)}`);
  }
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect("/herd");
}

export async function updateAnimal(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version)) redirect("/herd");
  const sex = g(formData, "sex");
  if (sex !== "M" && sex !== "F") redirect(`/herd/${id}?erro=1`);

  const birthDate = g(formData, "birth_date");
  const earTag = g(formData, "ear_tag");
  const origin = g(formData, "origin");
  const entryDate = g(formData, "entry_date");
  const isCompra = origin && (origin.toLowerCase().includes("compra") || origin.toLowerCase() === "comprado");
  if (isCompra && !entryDate) {
    redirect(`/herd/${id}?erro=compra_sem_entrada`);
  }
  if (entryDate && birthDate && entryDate < birthDate) {
    redirect(`/herd/${id}?erro=entrada_antes_nasc`);
  }

  const supabase = await createClient();

  const categoryId = g(formData, "category_id");
  if (categoryId) {
    const { data: catRow } = await supabase.from("categories").select("name").eq("id", categoryId).maybeSingle();
    if (catRow?.name) {
      const cName = catRow.name.toLowerCase();
      const femaleOnly = ["bezerra", "novilha", "vaca"];
      const maleOnly = ["bezerro", "garrote", "boi", "touro"];
      if (sex === "M" && femaleOnly.some((f) => cName.includes(f))) {
        redirect(`/herd/${id}?erro=sexo_cat`);
      }
      if (sex === "F" && maleOnly.some((m) => cName.includes(m))) {
        redirect(`/herd/${id}?erro=sexo_cat`);
      }
    }
  }

  const [sire, dam] = await Promise.all([
    resolveParent(supabase, ctx.active.id, g(formData, "sire_tag"), "M", birthDate, earTag),
    resolveParent(supabase, ctx.active.id, g(formData, "dam_tag"), "F", birthDate, earTag),
  ]);
  if (sire.id === id || dam.id === id) redirect(`/herd/${id}?erro=pai_auto`);
  if (sire.error) redirect(`/herd/${id}?erro=pai_${sire.error}`);
  if (dam.error) redirect(`/herd/${id}?erro=mae_${dam.error}`);
  // Concorrência otimista: só grava se a versão ainda for a que a pessoa estava vendo.
  const { data, error } = await supabase
    .from("animals")
    .update({
      ear_tag: g(formData, "ear_tag"),
      name: g(formData, "name"),
      sex,
      sire_id: sire.id,
      dam_id: dam.id,
      breed_id: g(formData, "breed_id"),
      category_id: g(formData, "category_id"),
      birth_date: g(formData, "birth_date"),
      origin: g(formData, "origin"),
      entry_date: g(formData, "entry_date"),
      notes: g(formData, "notes"),
    })
    .eq("id", id)
    .eq("version", version)
    .select("id");
  if (error) redirect(`/herd/${id}?erro=${error.code === "23505" ? "dup" : error.message.includes("invalid_parent") ? "genealogia" : "1"}`);
  if (!data || data.length === 0) redirect(`/herd/${id}?erro=conflito`);
  const custom = collectCustom(formData);
  if (Object.keys(custom).length > 0) {
    const { error: ce } = await supabase.rpc("set_animal_custom", { p_animal: id, p_values: custom });
    if (ce) redirect(`/herd/${id}?erro=${customErr(ce.message)}`);
  }
  revalidatePath("/herd");
  revalidatePath(`/herd/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect(`/herd/${id}?ok=editado`);
}

export async function moveAnimals(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const rawBack = String(formData.get("back") ?? "/herd");
  const back = rawBack.startsWith("/herd") ? rawBack : "/herd";
  const ids = formData.getAll("ids").map(String).filter((x) => UUID.test(x));
  const op = String(formData.get("op") ?? "");
  const date = g(formData, "date");
  if (ids.length === 0 || !["transferencia", "venda", "morte"].includes(op) || !date) {
    redirect(withParam(back, "erro", "mov"));
  }

  const supabase = await createClient();

  // Regra de integridade: animal vendido ou morto não recebe movimentação;
  // e movimentação não pode ser anterior à entrada do animal
  const { data: animalsFound } = await supabase
    .from("animals")
    .select("id, status, entry_date, birth_date")
    .eq("farm_id", ctx.active.id)
    .in("id", ids);

  const inactives = (animalsFound ?? []).filter((a: any) => a.status !== "ativo");
  if (inactives.length > 0) {
    redirect(withParam(back, "erro", "animal_inativo"));
  }

  const beforeEntry = (animalsFound ?? []).filter((a: any) => a.entry_date && date < a.entry_date);
  if (beforeEntry.length > 0) {
    redirect(withParam(back, "erro", "data_antes_entrada"));
  }

  const { data, error } = await supabase.rpc("register_movement", {
    p_farm: ctx.active.id,
    p_animal_ids: ids,
    p_event: op,
    p_date: date,
    p_lot: g(formData, "lot_id"),
    p_pasture: g(formData, "pasture_id"),
    p_notes: g(formData, "notes"),
  });
  if (error) redirect(withParam(back, "erro", error.code === "42501" ? "perm" : "mov"));
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect(withParam(back, "ok", String(data ?? ids.length)));
}
