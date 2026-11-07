import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import AppShell from "@/components/AppShell";
import { listReceivables, syncSalesToReceivables } from "@/lib/finance";
import ReceivablesClient from "./ReceivablesClient";

const FLASH_MESSAGES: Record<string, string> = {
  cadastrado: "Conta a receber cadastrada com sucesso.",
  baixa_sucesso: "Baixa de recebimento registrada com sucesso.",
  cancelado: "Conta a receber cancelada.",
};

const ERROR_MESSAGES: Record<string, string> = {
  campos_obrigatorios: "Preencha a descrição, data de vencimento e valor total.",
  valor_invalido: "Informe um valor de recebimento válido e maior que zero.",
  falha_baixa: "Não foi possível registrar a baixa. Tente novamente.",
  motivo_invalido: "Informe o motivo do cancelamento.",
  falha_cancelamento: "Não foi possível cancelar o recebível.",
};

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "receivables" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Contas a Receber</h1>
        <div className="card">Selecione uma fazenda ativa primeiro.</div>
      </AppShell>
    );
  }

  const perms = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("trade.view")) {
    redirect("/dashboard?erro=sem_permissao");
  }

  // Sincroniza vendas antes de carregar
  await syncSalesToReceivables(a.id);
  const items = await listReceivables(a.id);

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#3b82f6", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Contas a Receber
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Gestão de créditos, integração automática com vendas de animais e baixas parciais
            </p>
          </div>
        </div>
      </div>

      {sp.ok && <div className="flash">{FLASH_MESSAGES[sp.ok] ?? "Operação realizada com sucesso."}</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERROR_MESSAGES[sp.erro] ?? "Ocorreu um erro."}</div>}

      <ReceivablesClient items={items} farmName={a.name} />
    </AppShell>
  );
}
