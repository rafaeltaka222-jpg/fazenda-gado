"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function code(error: { code?: string; message: string }): string {
  const m = error.message;
  if (m.includes("last_admin")) return "ultimo";
  if (m.includes("privilege_escalation")) return "escalada";
  if (m.includes("user_not_found")) return "semconta";
  if (m.includes("already_member")) return "jamembro";
  if (error.code === "42501") return "perm";
  return "falha";
}

export async function addMember(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role_id") ?? "");
  if (!email || !UUID.test(role)) redirect("/users?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", { p_farm: ctx.active.id, p_email: email, p_role: role });
  if (error) redirect(`/users?erro=${code(error)}`);
  revalidatePath("/users");
  redirect("/users?ok=adicionado");
}

export async function updateMemberRole(formData: FormData) {
  const id = String(formData.get("membership_id") ?? "");
  const role = String(formData.get("role_id") ?? "");
  if (!UUID.test(id) || !UUID.test(role)) redirect("/users?erro=falha");
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ role_id: role }).eq("id", id).select("id");
  if (error) redirect(`/users?erro=${code(error)}`);
  if (!data || data.length === 0) redirect("/users?erro=perm");
  revalidatePath("/users");
  redirect("/users?ok=perfil");
}

export async function setMemberStatus(formData: FormData) {
  const id = String(formData.get("membership_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || !["active", "suspended"].includes(status)) redirect("/users?erro=falha");
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ status }).eq("id", id).select("id");
  if (error) redirect(`/users?erro=${code(error)}`);
  if (!data || data.length === 0) redirect("/users?erro=perm");
  revalidatePath("/users");
  redirect("/users?ok=situacao");
}
