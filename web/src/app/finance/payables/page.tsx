import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import AppShell from "@/components/AppShell";
import { listPayables } from "@/lib/finance";
import PayablesClient from "./PayablesClient";

const FLASH_MESSAGES: Record<string, string> = {
  cadastrado: "Conta a pagar cadastrada com sucesso.",
  baixa_sucesso: "Baixa de pagamento registrada com sucesso.",
  cancelado: "Conta a pagar cancelada.",
};

const ERROR_MESSAGES: Record<string, string> = {
  campos_obrigatorios: "Preencha a descrição, data de vencimento e valor total.",
  valor_invalido: "Informe um valor de pagamento válido e maior que zero.",
  falha_baixa: "Não foi possível registrar a baixa. Tente novamente.",
  motivo_invalido: "Informe o motivo do cancelamento.",
  falha_cancelamento: "Não foi possível cancelar o lançamento.",
};

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "payables" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Contas a Pagar</h1>
        <div className="card">Selecione uma fazenda ativa primeiro.</div>
      </AppShell>
    );
  }

  const perms = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("costs.view")) {
    redirect("/dashboard?erro=sem_permissao");
  }

  const items = await listPayables(a.id);

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#f59e0b", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Contas a Pagar
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Gestão de compromissos, fornecedores, baixas de pagamentos parciais e totais
            </p>
          </div>
        </div>
      </div>

      {sp.ok && <div className="flash">{FLASH_MESSAGES[sp.ok] ?? "Operação realizada com sucesso."}</div>}
      {sp.erro && <div className="flash bad" role="alert">{ERROR_MESSAGES[sp.erro] ?? "Ocorreu um erro."}</div>}

      <PayablesClient items={items} farmName={a.name} />
    </AppShell>
  );
}
