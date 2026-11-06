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

export async function createCost(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const amount = Number((g(formData, "amount") ?? "").replace(",", "."));
  const type = g(formData, "target_type") ?? "fazenda";
  if (!Number.isFinite(amount) || amount <= 0 || !["fazenda", "lote", "pasto", "animal"].includes(type)) redirect("/costs?erro=falha");
  const supabase = await createClient();
  let lot: string | null = null, pasture: string | null = null, animal: string | null = null;
  if (type === "lote") lot = g(formData, "lot_id");
  if (type === "pasto") pasture = g(formData, "pasture_id");
  if (type === "animal") {
    const tag = g(formData, "ear_tag");
    const { data } = await supabase.from("animals").select("id").eq("farm_id", ctx.active.id).eq("ear_tag", tag ?? "").is("deleted_at", null).maybeSingle();
    animal = (data as any)?.id ?? null;
    if (!animal) redirect("/costs?erro=animal");
  }
  if ((type === "lote" && !lot) || (type === "pasto" && !pasture)) redirect("/costs?erro=alvo");
  const { error } = await supabase.from("cost_entries").insert({
    farm_id: ctx.active.id, cost_date: g(formData, "date"), description: g(formData, "description"), category: g(formData, "category"),
    amount, target_type: type, lot_id: lot, pasture_id: pasture, animal_id: animal, notes: g(formData, "notes"),
  });
  if (error) redirect(`/costs?erro=${error.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/costs");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/costs?ok=1");
}

export async function voidCost(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const reason = g(formData, "reason");
  if (!UUID.test(id) || !reason) redirect("/costs?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_cost", { p_id: id, p_reason: reason });
  if (error) redirect(`/costs?erro=${error.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/costs");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/costs?ok=anulado");
}
