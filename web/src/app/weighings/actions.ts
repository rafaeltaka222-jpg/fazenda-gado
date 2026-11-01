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
  return s.startsWith("/herd") || s.startsWith("/weighings") ? s : "/weighings";
};
const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

// Campos de peso chamam-se peso_<id do animal>; só os preenchidos entram.
export async function registerWeighings(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const date = g(formData, "date");
  const time = g(formData, "time") ?? "00:00";

  const items: { animal_id: string; weighed_at: string; weight_kg: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("peso_")) continue;
    const raw = String(val).trim();
    if (raw === "") continue;
    const id = key.slice(5);
    const w = Number(raw.replace(",", "."));
    if (!UUID.test(id) || !Number.isFinite(w)) redirect(withParam(back, "erro", "peso"));
    // Horário informado é interpretado como horário de Brasília/Bahia (UTC-3).
    items.push({ animal_id: id, weighed_at: `${date}T${time}:00-03:00`, weight_kg: w });
  }
  if (!date || items.length === 0) redirect(withParam(back, "erro", "peso"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_weighings", { p_farm: ctx.active.id, p_items: items });
  if (error) {
    redirect(withParam(back, "erro", error.code === "42501" ? "perm" : error.code === "23505" ? "dup" : "peso"));
  }
  revalidatePath("/herd");
  revalidatePath("/weighings");
  const res = (data ?? {}) as { inserted?: number; warnings?: unknown[] };
  redirect(withParam(withParam(back, "ok", String(res.inserted ?? items.length)), "av", String(res.warnings?.length ?? 0)));
}

export async function voidWeighing(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const back = safeBack(formData.get("back"));
  const id = String(formData.get("id") ?? "");
  const reason = g(formData, "reason");
  if (!UUID.test(id) || !reason) redirect(withParam(back, "erro", "peso"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_weighing", { p_id: id, p_reason: reason });
  if (error) redirect(withParam(back, "erro", error.code === "42501" ? "perm" : "peso"));
  revalidatePath("/herd");
  redirect(withParam(back, "ok", "anulada"));
}
