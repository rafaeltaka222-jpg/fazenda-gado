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

// Pai/mãe informados pelo brinco. Retorna { id: null } quando em branco e { error: true } quando não encontrado ou de sexo errado.
async function resolveParent(supabase: any, farm: string, tag: string | null, sex: "M" | "F") {
  if (!tag) return { id: null as string | null, error: false };
  const { data } = await supabase.from("animals").select("id, sex").eq("farm_id", farm).eq("ear_tag", tag).is("deleted_at", null).maybeSingle();
  if (!data || data.sex !== sex) return { id: null as string | null, error: true };
  return { id: data.id as string, error: false };
}

const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

export async function createAnimal(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const sex = g(formData, "sex");
  if (sex !== "M" && sex !== "F") redirect("/herd/new?erro=1");

  const supabase = await createClient();
  const sire = await resolveParent(supabase, ctx.active.id, g(formData, "sire_tag"), "M");
  const dam = await resolveParent(supabase, ctx.active.id, g(formData, "dam_tag"), "F");
  if (sire.error || dam.error) redirect("/herd/new?erro=pai");
  const { data: created, error } = await supabase.from("animals").insert({
    farm_id: ctx.active.id,
    ear_tag: g(formData, "ear_tag"),
    name: g(formData, "name"),
    sex,
    sire_id: sire.id,
    dam_id: dam.id,
    breed_id: g(formData, "breed_id"),
    category_id: g(formData, "category_id"),
    lot_id: g(formData, "lot_id"),
    pasture_id: g(formData, "pasture_id"),
    birth_date: g(formData, "birth_date"),
    origin: g(formData, "origin"),
    entry_date: g(formData, "entry_date"),
    notes: g(formData, "notes"),
  }).select("id").single();
  if (error || !created) redirect(`/herd/new?erro=${error?.code === "23505" ? "dup" : error?.message.includes("invalid_parent") ? "pai" : "1"}`);
  const custom = collectCustom(formData);
  if (Object.keys(custom).length > 0) {
    const { error: ce } = await supabase.rpc("set_animal_custom", { p_animal: created.id, p_values: custom });
    if (ce) redirect(`/herd/${created.id}?erro=${customErr(ce.message)}`);
  }
  revalidatePath("/herd");
  redirect("/herd");
}

export async function updateAnimal(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version)) redirect("/herd");
  const sex = g(formData, "sex");
  if (sex !== "M" && sex !== "F") redirect(`/herd/${id}?erro=1`);

  const supabase = await createClient();
  const sire = await resolveParent(supabase, (await getContext()).active!.id, g(formData, "sire_tag"), "M");
  const dam = await resolveParent(supabase, (await getContext()).active!.id, g(formData, "dam_tag"), "F");
  if (sire.error || dam.error) redirect(`/herd/${id}?erro=pai`);
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
  redirect(withParam(back, "ok", String(data ?? ids.length)));
}
