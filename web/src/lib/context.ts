import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { resolveRolePermissions, type FarmItem } from "./permissions";
export * from "./permissions";

const fetchContextCached = cache(async () => {
  const supabase = await createClient();

  const [authRes, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);

  const user = authRes.data.user;
  if (!user) redirect("/login");

  // Só consulta nível AAL2 no servidor se o usuário realmente possuir fator MFA verificado
  const hasVerifiedMfa = (user.factors ?? []).some((f: any) => f.status === "verified");
  if (hasVerifiedMfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      redirect("/login?mfa=1");
    }
  }

  // Consulta estritamente os vínculos ativos do próprio usuário logado (impede vazamento de perfil)
  const { data: rowsData } = await supabase
    .from("memberships")
    .select("id, user_id, farm_id, role_id, status, roles(id, name, is_system, role_permissions(permission_key)), farms(id, code, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const rows = (rowsData ?? []) as any[];
  const farms: FarmItem[] = rows
    .filter((r) => r.farms && r.farms.id)
    .map((r) => {
      const roleObj = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      const roleName = String(roleObj?.name ?? "").trim().toLowerCase() || "visualizacao";
      const rawPerms = Array.isArray(roleObj?.role_permissions)
        ? roleObj.role_permissions.map((rp: any) => String(rp.permission_key))
        : null;
      return {
        membershipId: r.id,
        role: roleName,
        id: r.farms.id,
        code: r.farms.code,
        name: r.farms.name,
        permissions: resolveRolePermissions(roleName, rawPerms),
      };
    });

  // Ordenação determinística por código da fazenda (ex: 01 - jr faz sempre primeiro)
  farms.sort((a, b) => (a.code || "").localeCompare(b.code || ""));

  const saved = cookieStore.get("farm_id")?.value;
  const active = farms.find((f) => f.id === saved) ?? farms[0] ?? null;

  return { user, farms, active, hasVerifiedMfa };
});

// allowNoMfa: usado só pela página de segurança, para o administrador conseguir ativar o 2FA.
export async function getContext(opts?: { allowNoMfa?: boolean }) {
  const ctx = await fetchContextCached();

  if (
    !opts?.allowNoMfa &&
    process.env.REQUIRE_ADMIN_2FA === "true" &&
    ctx.farms.some((f) => f.role === "administrador") &&
    !ctx.hasVerifiedMfa
  ) {
    redirect("/security?obrigatorio=1");
  }

  return { user: ctx.user, farms: ctx.farms, active: ctx.active };
}
