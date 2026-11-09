"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, resolveRolePermissions } from "@/lib/context";

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
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("users.create")) {
    redirect("/users?erro=perm");
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role_id") ?? "");
  if (!email || !UUID.test(role)) redirect("/users?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", { p_farm: ctx.active.id, p_email: email, p_role: role });
  if (error) redirect(`/users?erro=${code(error)}`);
  revalidatePath("/", "layout");
  revalidatePath("/users");
  redirect("/users?ok=adicionado");
}

export async function createUserWithPassword(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("users.create")) {
    redirect("/users?erro=perm");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role_id") ?? "");

  if (!email || !email.includes("@")) redirect("/users?erro=email_invalido");
  if (!password || password.length < 6) redirect("/users?erro=senha_curta");
  if (!UUID.test(role)) redirect("/users?erro=falha");

  let adminHandled = false;
  try {
    const admin = createAdminClient();
    const { data: userList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listErr && userList) {
      const existing = (userList.users ?? []).find((u) => u.email?.toLowerCase() === email);
      if (!existing) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || email.split("@")[0] },
        });
        if (!createErr && created?.user) {
          adminHandled = true;
        }
      } else {
        if (ctx.active.role === "administrador" && existing.id !== ctx.user.id) {
          await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: fullName ? { full_name: fullName } : undefined,
          });
        }
        adminHandled = true;
      }
    }
  } catch {
    adminHandled = false;
  }

  if (!adminHandled) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && pubKey) {
      const stateless = createSupabaseClient(url, pubKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await stateless.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || email.split("@")[0] },
        },
      });
    }
  }

  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("add_member_by_email", {
    p_farm: ctx.active.id,
    p_email: email,
    p_role: role,
  });

  if (rpcErr && !rpcErr.message.includes("already_member")) {
    redirect(`/users?erro=${code(rpcErr)}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/users");
  redirect("/users?ok=adicionado");
}

export async function resetMemberPassword(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("users.update")) {
    redirect("/users?erro=perm");
  }

  const userId = String(formData.get("user_id") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");

  if (!UUID.test(userId) || !newPassword || !newPassword.trim() || newPassword.length < 6) {
    redirect("/users?erro=senha_curta");
  }

  // Garante que o usuário alvo pertence à fazenda ativa
  const supabase = await createClient();
  const { data: targetMem } = await supabase
    .from("memberships")
    .select("id, user_id")
    .eq("farm_id", ctx.active.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!targetMem) {
    redirect("/users?erro=perm");
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) redirect("/users?erro=falha");
  } catch {
    redirect("/users?erro=falha");
  }

  revalidatePath("/users");
  redirect("/users?ok=senha_alterada");
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");

  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("users.update")) {
    redirect("/users?erro=perm");
  }

  const id = String(formData.get("membership_id") ?? "");
  const role = String(formData.get("role_id") ?? "");
  if (!UUID.test(id) || !UUID.test(role)) redirect("/users?erro=falha");

  // Regra de Integridade: Ninguém altera o próprio perfil, nem o administrador
  if (id === ctx.active.membershipId) {
    redirect("/users?erro=proprio_perfil");
  }

  const supabase = await createClient();

  // Obtém os dados do membro alvo para identificar o usuário
  const { data: targetMem, error: targetErr } = await supabase
    .from("memberships")
    .select("id, user_id, farm_id")
    .eq("id", id)
    .single();

  if (targetErr || !targetMem) {
    redirect("/users?erro=falha");
  }

  if (targetMem.user_id === ctx.user.id) {
    redirect("/users?erro=proprio_perfil");
  }

  // 1. Atualiza o perfil na fazenda atual respeitando os triggers de proteção (last_admin / privilege_escalation)
  const { data, error } = await supabase
    .from("memberships")
    .update({ role_id: role })
    .eq("id", id)
    .select("id");
  if (error) redirect(`/users?erro=${code(error)}`);
  if (!data || data.length === 0) redirect("/users?erro=perm");

  // 2. Sincroniza o perfil do usuário nas demais fazendas gerenciadas
  try {
    await supabase
      .from("memberships")
      .update({ role_id: role })
      .eq("user_id", targetMem.user_id)
      .neq("id", id);
  } catch {
    // Caso haja apenas 1 vínculo ou restrição de último admin em outra fazenda, o vínculo atual já foi atualizado
  }

  // Purga o cache de layout e páginas para garantir atualização imediata
  revalidatePath("/", "layout");
  revalidatePath("/users");
  revalidatePath("/dashboard");
  revalidatePath("/farms");
  redirect("/users?ok=perfil");
}

export async function setMemberStatus(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("users.update")) {
    redirect("/users?erro=perm");
  }
  const id = String(formData.get("membership_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || !["active", "suspended"].includes(status)) redirect("/users?erro=falha");

  // Regra de Integridade: Ninguém desativa a própria conta
  if (id === ctx.active.membershipId) {
    redirect("/users?erro=proprio_status");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ status }).eq("id", id).select("id");
  if (error) redirect(`/users?erro=${code(error)}`);
  if (!data || data.length === 0) redirect("/users?erro=perm");
  revalidatePath("/", "layout");
  revalidatePath("/users");
  redirect("/users?ok=situacao");
}
