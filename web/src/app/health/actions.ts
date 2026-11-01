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
  return s.startsWith("/herd") || s.startsWith("/health") ? s : "/health";
};
const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

// Animais: ids vindos da ficha, ou lista de brincos, ou todos os ativos de um lote
export async function registerHealth(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const supabase = await createClient();

  let ids = formData.getAll("ids").map(String).filter((x) => UUID.test(x));
  if (ids.length === 0) {
    const tags = String(formData.get("tags") ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 500);
    const lot = g(formData, "lot_id");
    if (tags.length > 0) {
      const { data } = await supabase.from("animals").select("id").eq("farm_id", ctx.active.id).eq("status", "ativo").in("ear_tag", tags);
      const found = data ?? [];
      if (found.length !== new Set(tags).size) redirect(withParam(back, "erro", "tags"));
      ids = found.map((x: any) => x.id);
    } else if (lot && UUID.test(lot)) {
      const { data } = await supabase.from("animals").select("id").eq("farm_id", ctx.active.id).eq("status", "ativo").eq("lot_id", lot).limit(500);
      ids = (data ?? []).map((x: any) => x.id);
    }
  }
  const product = g(formData, "product_id");
  const date = g(formData, "date");
  if (ids.length === 0 || !product || !UUID.test(product) || !date) redirect(withParam(back, "erro", "vazio"));

  const { data, error } = await supabase.rpc("register_health", {
    p_farm: ctx.active.id,
    p_animal_ids: ids,
    p_product: product,
    p_date: date,
    p_dose: g(formData, "dose"),
    p_next: g(formData, "next"),
    p_lot: g(formData, "product_lot"),
    p_notes: g(formData, "notes"),
  });
  if (error) redirect(withParam(back, "erro", error.code === "42501" ? "perm" : "falha"));
  revalidatePath("/health");
  revalidatePath("/dashboard");
  redirect(withParam(back, "ok", String(data ?? ids.length)));
}

export async function voidHealth(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const id = String(formData.get("id") ?? "");
  const reason = g(formData, "reason");
  if (!UUID.test(id) || !reason) redirect(withParam(back, "erro", "falha"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_health_event", { p_id: id, p_reason: reason });
  if (error) redirect(withParam(back, "erro", error.code === "42501" ? "perm" : "falha"));
  revalidatePath("/health");
  revalidatePath("/dashboard");
  redirect(withParam(back, "ok", "anulada"));
}

export async function createProduct(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const days = Number(String(formData.get("withdrawal_days") ?? "0").trim() || "0");
  const kind = String(formData.get("kind") ?? "");
  if (!Number.isInteger(days) || days < 0 || days > 365 || !["vacina", "medicamento"].includes(kind)) redirect("/health?erro=produto");
  const supabase = await createClient();
  const { error } = await supabase.from("health_products").insert({
    farm_id: ctx.active.id,
    name: g(formData, "name"),
    kind,
    withdrawal_days: days,
  });
  if (error) redirect("/health?erro=produto");
  revalidatePath("/health");
  redirect("/health?ok=produto");
}
