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
  const supabase = await createClient();
  const { error } = await supabase
    .from("lots")
    .insert({ farm_id: ctx.active.id, name: g(formData, "name"), notes: g(formData, "notes") });
  if (error) redirect("/structure?erro=lote");
  revalidatePath("/structure");
  redirect("/structure");
}

export async function createPasture(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const area = num(g(formData, "area_ha"));
  const cap = num(g(formData, "capacity_heads"));
  if (Number.isNaN(area) || Number.isNaN(cap)) redirect("/structure?erro=pasto");
  const supabase = await createClient();
  const { error } = await supabase.from("pastures").insert({
    farm_id: ctx.active.id,
    name: g(formData, "name"),
    area_ha: area,
    capacity_heads: cap === null ? null : Math.trunc(cap as number),
    notes: g(formData, "notes"),
  });
  if (error) redirect("/structure?erro=pasto");
  revalidatePath("/structure");
  redirect("/structure");
}
