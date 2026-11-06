import { getContext } from "@/lib/context";
import AppShell from "@/components/AppShell";
import MfaPanel from "@/components/MfaPanel";
import PasswordPanel from "@/components/PasswordPanel";


export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ obrigatorio?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext({ allowNoMfa: true });
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: ctx.active, current: "security" };
  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Segurança & Autenticação (2FA)
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Autenticação em dois fatores (TOTP), proteção de credenciais e integridade de acesso
            </p>
          </div>
        </div>
      </div>
      <MfaPanel mandatory={sp.obrigatorio === "1"} />
      <PasswordPanel />
      <p className="muted">
        A sessão é renovada automaticamente enquanto você usa o sistema. TODO: listar e encerrar sessões em outros dispositivos,
        códigos de recuperação do 2FA e exigir o 2FA também diretamente no banco de dados.
      </p>
    </AppShell>
  );
}
