import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ApiKeyForm from "@/components/ApiKeyForm";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { revokeApiKey } from "./actions";

export const instant = false;

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function ApiSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "api" };
  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">API e integrações</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }
  const supabase = await createClient();
  const perms: string[] = ((await supabase.rpc("my_permissions", { p_farm: a.id })).data as string[] | null) ?? [];
  if (!perms.includes("settings.update")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">API e integrações</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para gerenciar chaves de API.</p></div>
      </AppShell>
    );
  }
  const { data } = await supabase.from("api_keys").select("id, name, key_prefix, scopes, expires_at, last_used_at, revoked_at")
    .eq("farm_id", a.id).order("created_at", { ascending: false });
  const keys: any[] = data ?? [];

  return (
    <AppShell {...shell}>
      <h1 className="title">API e integrações</h1>
      {sp.ok === "revogada" && <div className="flash">Chave revogada.</div>}
      <ApiKeyForm />
      <div className="card" style={{ overflowX: "auto" }}>
        <strong>Chaves desta fazenda</strong>
        {keys.length === 0 ? (
          <p className="muted">Nenhuma chave criada.</p>
        ) : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Nome</th><th>Início da chave</th><th>Escopos</th><th>Validade</th><th>Último uso</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td><td><code>{k.key_prefix}…</code></td><td>{(k.scopes as string[]).join(", ")}</td>
                  <td>{k.expires_at ? fmt(k.expires_at) : "sem validade"}</td><td>{fmt(k.last_used_at)}</td>
                  <td><span className="badge">{k.revoked_at ? "revogada" : k.expires_at && new Date(k.expires_at) < new Date() ? "expirada" : "ativa"}</span></td>
                  <td>
                    {!k.revoked_at && (
                      <form action={revokeApiKey}>
                        <input type="hidden" name="id" value={k.id} />
                        <ConfirmSubmit label="Revogar" message="Revogar esta chave? Os sistemas que a usam deixam de funcionar." />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <strong>Como usar</strong>
        <p className="muted">Envie a chave no cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code>. Limite de 120 requisições por minuto por chave. A especificação está em <a href="/api/v1/openapi" style={{ color: "var(--green)", fontWeight: 600 }}>/api/v1/openapi</a>.</p>
        <pre style={{ overflowX: "auto", background: "#eef1ea", padding: 12, borderRadius: 8 }}>{`curl -H "Authorization: Bearer fz_..." "http://localhost:3000/api/v1/animals?status=ativo&limit=20"

curl -X POST "http://localhost:3000/api/v1/weighings" \\
  -H "Authorization: Bearer fz_..." -H "Content-Type: application/json" -H "Idempotency-Key: lote-0001" \\
  -d '{"items":[{"ear_tag":"000123","weighed_at":"2026-10-20T08:32:00-03:00","weight_kg":425}]}'`}</pre>
        <p className="muted">TODO: webhooks de saída (exigem um processo agendado de envio), mais recursos (lotes, pastos, movimentações) e campos personalizados na API.</p>
      </div>
    </AppShell>
  );
}
