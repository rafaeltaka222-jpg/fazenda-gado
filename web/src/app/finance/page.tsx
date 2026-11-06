import { getContext } from "@/lib/context";
import AppShell from "@/components/AppShell";
import { getFinancialSummary } from "@/lib/finance";
import FinanceDashboardClient from "./FinanceDashboardClient";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "finance" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Dashboard Financeiro</h1>
        <div className="card">Selecione uma fazenda ativa primeiro.</div>
      </AppShell>
    );
  }

  const currentYm = sp.periodo || new Date().toISOString().slice(0, 7);
  const summary = await getFinancialSummary(a.id, currentYm);

  return (
    <AppShell {...shell}>
      <div className="head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Dashboard Financeiro
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Fluxo de caixa realizado vs projetado, contas a pagar, contas a receber e resultado operacional
            </p>
          </div>
        </div>
      </div>

      <FinanceDashboardClient
        summary={summary}
        currentYearMonth={currentYm}
        farmName={a.name}
      />
    </AppShell>
  );
}
