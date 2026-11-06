"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const g = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (v: string | null) => {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function createLot(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const name = g(formData, "name");
  if (!name) redirect("/structure?erro=lote_vazio");

  const purpose = g(formData, "purpose");
  const formDate = g(formData, "formation_date");
  const notesRaw = g(formData, "notes");

  // Reúne metadados recomendados do lote (finalidade e data de formação)
  const metaParts: string[] = [];
  if (purpose) metaParts.push(`Finalidade: ${purpose}`);
  if (formDate) metaParts.push(`Formação: ${formDate}`);
  if (notesRaw) metaParts.push(notesRaw);
  const notes = metaParts.length > 0 ? metaParts.join(" · ") : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("lots")
    .insert({ farm_id: ctx.active.id, name, notes });
  if (error) redirect("/structure?erro=lote");
  revalidatePath("/structure");
  redirect("/structure?ok=lote_criado");
}

export async function createPasture(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const name = g(formData, "name");
  const pType = g(formData, "type") ?? "Pasto";
  if (!name) redirect("/structure?erro=pasto_vazio");

  const area = num(g(formData, "area_ha"));
  const cap = num(g(formData, "capacity_heads"));
  if (Number.isNaN(area) || Number.isNaN(cap)) redirect("/structure?erro=pasto");

  const grass = g(formData, "grass_type");
  const notesRaw = g(formData, "notes");

  const metaParts: string[] = [`Tipo: ${pType}`];
  if (grass) metaParts.push(`Capim: ${grass}`);
  if (notesRaw) metaParts.push(notesRaw);
  const notes = metaParts.join(" · ");

  const supabase = await createClient();
  const { error } = await supabase.from("pastures").insert({
    farm_id: ctx.active.id,
    name,
    area_ha: area,
    capacity_heads: cap === null ? null : Math.trunc(cap as number),
    notes,
  });
  if (error) redirect("/structure?erro=pasto");
  revalidatePath("/structure");
  redirect("/structure?ok=pasto_criado");
}

export async function deleteLot(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  // Regra de integridade: Não é possível excluir um lote que tenha animais. Primeiro movimenta, depois exclui.
  const { count } = await supabase
    .from("animals")
    .select("id", { count: "exact", head: true })
    .eq("farm_id", ctx.active.id)
    .eq("lot_id", id)
    .eq("status", "ativo");

  if (count && count > 0) {
    redirect("/structure?erro=lote_com_animais");
  }

  const { error } = await supabase
    .from("lots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("farm_id", ctx.active.id)
    .eq("id", id);

  if (error) redirect("/structure?erro=del_lote");
  revalidatePath("/structure");
  redirect("/structure?ok=lote_removido");
}

export async function deletePasture(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  // Regra de integridade: Não é possível excluir um pasto que tenha animais. Primeiro movimenta, depois exclui.
  const { count } = await supabase
    .from("animals")
    .select("id", { count: "exact", head: true })
    .eq("farm_id", ctx.active.id)
    .eq("pasture_id", id)
    .eq("status", "ativo");

  if (count && count > 0) {
    redirect("/structure?erro=pasto_com_animais");
  }

  const { error } = await supabase
    .from("pastures")
    .update({ deleted_at: new Date().toISOString() })
    .eq("farm_id", ctx.active.id)
    .eq("id", id);

  if (error) redirect("/structure?erro=del_pasto");
  revalidatePath("/structure");
  redirect("/structure?ok=pasto_removido");
}
