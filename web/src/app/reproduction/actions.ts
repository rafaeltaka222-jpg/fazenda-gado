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
const safeBack = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return s.startsWith("/herd") || s.startsWith("/reproduction") ? s : "/reproduction";
};
const withParam = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
const code = (e: { code?: string; message: string }) =>
  e.code === "42501" ? "perm" : e.code === "23505" ? "brinco" : e.message.includes("invalid_female") ? "femea" : e.message.includes("invalid_male") ? "macho"
  : e.message.includes("birth_has_calf") ? "bezerro" : "falha";

async function tagToId(supabase: any, farm: string, tag: string | null) {
  if (!tag) return null;
  const { data } = await supabase.from("animals").select("id").eq("farm_id", farm).eq("ear_tag", tag).is("deleted_at", null).maybeSingle();
  return (data as any)?.id ?? undefined; // undefined = não encontrado
}

export async function registerEvent(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const supabase = await createClient();
  const female = await tagToId(supabase, ctx.active.id, g(formData, "female_tag"));
  const maleTag = g(formData, "male_tag");
  const male = await tagToId(supabase, ctx.active.id, maleTag);
  if (!female) redirect(withParam(back, "erro", "femea"));
  if (maleTag && !male) redirect(withParam(back, "erro", "macho"));
  const { error } = await supabase.rpc("register_reproduction", {
    p_farm: ctx.active.id, p_female: female, p_type: g(formData, "type"), p_date: g(formData, "date"), p_male: male ?? null,
    p_semen: g(formData, "semen"), p_result: g(formData, "result"), p_notes: g(formData, "notes"),
  });
  if (error) redirect(withParam(back, "erro", code(error)));
  revalidatePath("/reproduction");
  revalidatePath("/dashboard");
  redirect(withParam(back, "ok", "evento"));
}

export async function registerBirthAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const supabase = await createClient();
  const dam = await tagToId(supabase, ctx.active.id, g(formData, "dam_tag"));
  const sireTag = g(formData, "sire_tag");
  const sire = await tagToId(supabase, ctx.active.id, sireTag);
  if (!dam) redirect(withParam(back, "erro", "femea"));
  if (sireTag && !sire) redirect(withParam(back, "erro", "macho"));
  const { error } = await supabase.rpc("register_birth", {
    p_farm: ctx.active.id, p_dam: dam, p_date: g(formData, "date"), p_outcome: g(formData, "outcome"), p_calf_tag: g(formData, "calf_tag"),
    p_calf_sex: g(formData, "calf_sex"), p_sire: sire ?? null, p_lot: null, p_pasture: null, p_notes: g(formData, "notes"),
  });
  if (error) redirect(withParam(back, "erro", code(error)));
  revalidatePath("/reproduction");
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  redirect(withParam(back, "ok", "parto"));
}

export async function voidReproduction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const id = String(formData.get("id") ?? "");
  const reason = g(formData, "reason");
  if (!UUID.test(id) || !reason) redirect(withParam(back, "erro", "falha"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_reproduction", { p_id: id, p_reason: reason });
  if (error) redirect(withParam(back, "erro", code(error)));
  revalidatePath("/reproduction");
  revalidatePath("/dashboard");
  redirect(withParam(back, "ok", "anulado"));
}
