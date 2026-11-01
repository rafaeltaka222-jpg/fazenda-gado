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

export async function createCount(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const scope = g(formData, "scope") ?? "fazenda";
  const ref = scope === "lote" ? g(formData, "lot_id") : scope === "pasto" ? g(formData, "pasture_id") : null;
  const tags = String(formData.get("tags") ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 5000);
  if ((scope !== "fazenda" && (!ref || !UUID.test(ref))) || tags.length === 0) redirect("/inventory?erro=falha");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_count", {
    p_farm: ctx.active.id, p_date: g(formData, "date"), p_scope: scope, p_ref: ref, p_tags: tags, p_notes: g(formData, "notes"),
  });
  if (error || !data) redirect(`/inventory?erro=${error?.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${data}`);
}
