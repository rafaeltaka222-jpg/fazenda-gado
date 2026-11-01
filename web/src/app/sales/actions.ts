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

export async function createSale(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const tags = String(formData.get("tags") ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 500);
  const total = Number((g(formData, "total") ?? "").replace(/\./g, "").replace(",", "."));
  const buyer = g(formData, "buyer_id");
  if (tags.length === 0 || !Number.isFinite(total) || total < 0 || (buyer && !UUID.test(buyer))) redirect("/sales?erro=falha");
  const supabase = await createClient();
  const { data: found } = await supabase.from("animals").select("id").eq("farm_id", ctx.active.id).eq("status", "ativo").in("ear_tag", tags);
  if ((found ?? []).length !== new Set(tags).size) redirect("/sales?erro=tags");
  const { error } = await supabase.rpc("register_sale", {
    p_farm: ctx.active.id, p_animal_ids: (found ?? []).map((x: any) => x.id), p_date: g(formData, "date"), p_buyer: buyer,
    p_total: total, p_doc: g(formData, "document"), p_notes: g(formData, "notes"),
  });
  if (error) redirect(`/sales?erro=${error.code === "42501" ? "perm" : error.message.includes("invalid_buyer") ? "comprador" : "falha"}`);
  revalidatePath("/sales");
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  redirect("/sales?ok=1");
}
