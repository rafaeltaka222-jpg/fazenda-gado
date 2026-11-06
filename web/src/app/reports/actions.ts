"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { parseDef } from "@/lib/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveReport(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const def = parseDef(String(formData.get("def") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  if (!def || !name) redirect("/reports?erro=salvar");
  const supabase = await createClient();
  const { error } = await supabase.from("saved_reports").insert({
    farm_id: ctx.active.id,
    name,
    definition: def,
    shared: formData.get("shared") === "on",
  });
  if (error) redirect("/reports?erro=salvar");
  revalidatePath("/reports");
  redirect("/reports?ok=salva");
}

export async function deleteReport(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/reports");
  const supabase = await createClient();
  // Garante que o relatório pertence à fazenda ativa e protege stores internos do sistema financeiro
  await supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("farm_id", ctx.active.id)
    .not("name", "like", "__fin_%");
  revalidatePath("/reports");
  redirect("/reports?ok=excluida");
}
