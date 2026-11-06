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
const num = (v: string | null) => (v === null ? null : Number(v.replace(",", ".")));
const code = (e: { code?: string; message: string }) =>
  e.code === "42501" ? "perm" : e.message.includes("insufficient_stock") ? "saldo" : e.message.includes("would_make_negative") ? "negativo" : "falha";

export async function createItem(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const min = num(g(formData, "min_quantity")) ?? 0;
  if (!Number.isFinite(min) || min < 0) redirect("/stock?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").insert({
    farm_id: ctx.active.id, name: g(formData, "name"), unit: g(formData, "unit"), category: g(formData, "category"), min_quantity: min,
  });
  if (error) redirect("/stock?erro=item");
  revalidatePath("/stock");
  redirect("/stock?ok=item");
}

export async function registerStock(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const item = g(formData, "item_id");
  const qty = num(g(formData, "quantity"));
  const cost = num(g(formData, "unit_cost"));
  const lot = g(formData, "lot_id");
  if (!item || !UUID.test(item) || qty === null || !Number.isFinite(qty) || (cost !== null && !Number.isFinite(cost))) redirect("/stock?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_stock_movement", {
    p_farm: ctx.active.id, p_item: item, p_kind: g(formData, "kind"), p_qty: qty, p_date: g(formData, "date"), p_unit_cost: cost,
    p_expiry: g(formData, "expiry"), p_supplier: g(formData, "supplier"), p_doc: g(formData, "document"),
    p_lot: lot && UUID.test(lot) ? lot : null, p_notes: g(formData, "notes"),
  });
  if (error) redirect(`/stock?erro=${code(error)}`);
  revalidatePath("/stock");
  revalidatePath("/costs");
  revalidatePath("/dashboard");
  redirect("/stock?ok=mov");
}

export async function voidStock(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const reason = g(formData, "reason");
  if (!UUID.test(id) || !reason) redirect("/stock?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_stock_movement", { p_id: id, p_reason: reason });
  if (error) redirect(`/stock?erro=${code(error)}`);
  revalidatePath("/stock");
  revalidatePath("/costs");
  revalidatePath("/dashboard");
  redirect("/stock?ok=anulado");
}
