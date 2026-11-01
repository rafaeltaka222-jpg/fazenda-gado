import { connection } from "next/server";
import { getContext } from "@/lib/context";
import AppShell from "@/components/AppShell";
import MfaPanel from "@/components/MfaPanel";
import PasswordPanel from "@/components/PasswordPanel";

export const instant = false;

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ obrigatorio?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext({ allowNoMfa: true });
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: ctx.active, current: "security" };
  return (
    <AppShell {...shell}>
      <h1 className="title">Segurança da conta</h1>
      <MfaPanel mandatory={sp.obrigatorio === "1"} />
      <PasswordPanel />
      <p className="muted">
        A sessão é renovada automaticamente enquanto você usa o sistema. TODO: listar e encerrar sessões em outros dispositivos,
        códigos de recuperação do 2FA e exigir o 2FA também diretamente no banco de dados.
      </p>
    </AppShell>
  );
}
