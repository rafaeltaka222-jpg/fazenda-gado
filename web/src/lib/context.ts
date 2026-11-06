import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { resolveRolePermissions, type FarmItem } from "./permissions";
export * from "./permissions";

const fetchContextCached = cache(async () => {
  const supabase = await createClient();

  // Executa autenticação, leitura de cookies e vínculos da fazenda em paralelo (1 único round-trip!)
  const [authRes, cookieStore, rowsRes] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
    supabase
      .from("memberships")
      .select("id, roles(name, role_permissions(permission_key)), farms(id, code, name)")
      .eq("status", "active"),
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

  const rows = (rowsRes.data ?? []) as any[];
  const farms: FarmItem[] = rows
    .filter((r) => r.farms)
    .map((r) => {
      const roleName = r.roles?.name ?? "administrador";
      const rawPerms = Array.isArray(r.roles?.role_permissions)
        ? r.roles.role_permissions.map((rp: any) => String(rp.permission_key))
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
