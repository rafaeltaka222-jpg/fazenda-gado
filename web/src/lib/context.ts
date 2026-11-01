import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FarmItem = { membershipId: string; role: string; id: string; code: string; name: string };

// allowNoMfa: usado só pela página de segurança, para o administrador conseguir ativar o 2FA.
export async function getContext(opts?: { allowNoMfa?: boolean }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Se a pessoa tem 2FA, a sessão precisa estar no nível aal2 (código já informado)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login?mfa=1");

  const { data: rows } = await supabase
    .from("memberships")
    .select("id, roles(name), farms(id, code, name)")
    .eq("status", "active");

  const farms: FarmItem[] = ((rows ?? []) as any[])
    .filter((r) => r.farms)
    .map((r) => ({
      membershipId: r.id,
      role: r.roles?.name ?? "",
      id: r.farms.id,
      code: r.farms.code,
      name: r.farms.name,
    }));

  const saved = (await cookies()).get("farm_id")?.value;
  const active = farms.find((f) => f.id === saved) ?? farms[0] ?? null;

  // Opcional: exigir 2FA de administradores (defina REQUIRE_ADMIN_2FA=true no .env.local)
  if (!opts?.allowNoMfa && process.env.REQUIRE_ADMIN_2FA === "true" && farms.some((f) => f.role === "administrador")) {
    const hasTotp = (auth.user.factors ?? []).some((f: any) => f.factor_type === "totp" && f.status === "verified");
    if (!hasTotp) redirect("/security?obrigatorio=1");
  }
  return { user: auth.user, farms, active };
}
