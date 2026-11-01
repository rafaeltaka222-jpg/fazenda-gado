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

export async function createTask(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const supabase = await createClient();
  const tag = g(formData, "ear_tag");
  let animal: string | null = null;
  if (tag) {
    const { data } = await supabase.from("animals").select("id").eq("farm_id", ctx.active.id).eq("ear_tag", tag).is("deleted_at", null).maybeSingle();
    animal = (data as any)?.id ?? null;
    if (!animal) redirect("/tasks?erro=animal");
  }
  const assignee = g(formData, "assignee");
  const lot = g(formData, "lot_id");
  const { error } = await supabase.rpc("create_task", {
    p_farm: ctx.active.id, p_title: g(formData, "title"), p_desc: g(formData, "description"), p_due: g(formData, "due"),
    p_priority: g(formData, "priority") ?? "normal", p_assignee: assignee && UUID.test(assignee) ? assignee : null,
    p_animal: animal, p_lot: lot && UUID.test(lot) ? lot : null,
  });
  if (error) redirect(`/tasks?erro=${error.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks?ok=1");
}

export async function setTaskStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || !["aberta", "concluida", "cancelada"].includes(status)) redirect("/tasks");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_status", { p_id: id, p_status: status });
  if (error) redirect(`/tasks?erro=${error.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks?ok=1");
}
