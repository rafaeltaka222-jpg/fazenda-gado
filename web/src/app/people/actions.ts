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
const ROLES = ["funcionario", "proprietario", "veterinario", "zootecnista", "fornecedor", "comprador", "transportador"];

export async function createPerson(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const roles = formData.getAll("roles").map(String).filter((r) => ROLES.includes(r));
  const supabase = await createClient();
  const { error } = await supabase.from("people").insert({
    farm_id: ctx.active.id, name: g(formData, "name"), person_roles: roles, document: g(formData, "document"),
    phone: g(formData, "phone"), email: g(formData, "email"), notes: g(formData, "notes"),
  });
  if (error) redirect(`/people?erro=${error.code === "23514" ? "documento" : error.code === "23505" ? "duplicado" : error.code === "42501" ? "perm" : "falha"}`);
  revalidatePath("/people");
  redirect("/people?ok=1");
}

export async function setPersonActive(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!UUID.test(id)) redirect("/people");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ active })
    .eq("id", id)
    .eq("farm_id", ctx.active.id)
    .select("id");
  if (error || !data || data.length === 0) redirect("/people?erro=perm");
  revalidatePath("/people");
  redirect("/people?ok=1");
}
