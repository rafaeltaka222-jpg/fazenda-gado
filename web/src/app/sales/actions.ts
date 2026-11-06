"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { syncSalesToReceivables } from "@/lib/finance";

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

  // Sincroniza automaticamente a venda com o módulo de Contas a Receber
  try {
    await syncSalesToReceivables(ctx.active.id);
  } catch (syncErr) {
    console.warn("Could not sync sale to receivables:", syncErr);
  }

  revalidatePath("/sales");
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/finance/receivables");
  redirect("/sales?ok=1");
}

export async function voidSale(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = g(formData, "id");
  const reason = g(formData, "reason") ?? "Estorno operacional solicitado pelo gestor";
  if (!id || !UUID.test(id) || reason.length < 3) redirect("/sales?erro=estorno");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", { p_id: id, p_reason: reason });
  if (error) redirect(`/sales?erro=${error.code === "42501" ? "perm" : "estorno"}`);

  // Sincroniza cancelamento da venda com Contas a Receber
  try {
    await syncSalesToReceivables(ctx.active.id);
  } catch (syncErr) {
    console.warn("Could not sync voided sale to receivables:", syncErr);
  }

  revalidatePath("/sales");
  revalidatePath("/herd");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/finance/receivables");
  redirect("/sales?ok=estornado");
}
