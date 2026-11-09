"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FinancialSummary } from "@/lib/finance";

function formatBRL(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function FinanceDashboardClient({
  summary,
  currentYearMonth,
  farmName,
}: {
  summary: FinancialSummary;
  currentYearMonth: string;
  farmName: string;
}) {
  const [selectedYm, setSelectedYm] = useState(currentYearMonth);

  const { payables, receivables, cashFlow } = summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Controls Bar */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Unidade Selecionada:</span>
          <strong style={{ marginLeft: 8, fontSize: 15, color: "var(--ink)" }}>{farmName}</strong>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--ink-muted)" }}>Período de Competência:</span>
            <input
              type="month"
              value={selectedYm}
              onChange={(e) => {
                setSelectedYm(e.target.value);
                const url = new URL(window.location.href);
                url.searchParams.set("periodo", e.target.value);
                window.location.href = url.toString();
              }}
              style={{ padding: "6px 12px", fontSize: 13 }}
            />
          </label>

          <Link href="/finance/payables" className="btn ghost" style={{ fontSize: 13 }}>
            Gerenciar Pagamentos
          </Link>
          <Link href="/finance/receivables" className="btn ghost" style={{ fontSize: 13 }}>
            Gerenciar Recebimentos
          </Link>
        </div>
      </div>

      {/* RESULTADO FINANCEIRO REALIZADO VS PREVISTO (4 CARDS PRINCIPAIS) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {/* Receitas Realizadas */}
        <div className="card" style={{ padding: 20, borderLeft: "4px solid #10b981", background: "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(17, 24, 39, 0) 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Receitas Realizadas (Mês)</span>
            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>Efetivo em Caixa</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#10b981", marginTop: 8 }}>
            {formatBRL(cashFlow.realizedRevenuesMonth)}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6, display: "block" }}>
            Valores baixados e recebidos no mês
          </span>
        </div>

        {/* Despesas Realizadas */}
        <div className="card" style={{ padding: 20, borderLeft: "4px solid #ef4444", background: "linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(17, 24, 39, 0) 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Despesas Realizadas (Mês)</span>
            <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>Saídas Pagas</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", marginTop: 8 }}>
            {formatBRL(cashFlow.realizedExpensesMonth)}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6, display: "block" }}>
            Contas quitadas e custos do período
          </span>
        </div>

        {/* Saldo Realizado */}
        <div className="card" style={{ padding: 20, borderLeft: `4px solid ${cashFlow.realizedBalanceMonth >= 0 ? "#06b6d4" : "#ef4444"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Saldo Realizado (Caixa)</span>
            <span className="badge" style={{ background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4" }}>Fluxo Líquido</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: cashFlow.realizedBalanceMonth >= 0 ? "#06b6d4" : "#ef4444", marginTop: 8 }}>
            {formatBRL(cashFlow.realizedBalanceMonth)}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6, display: "block" }}>
            Diferença real entre entradas e saídas
          </span>
        </div>

        {/* Saldo Previsto Geral */}
        <div className="card" style={{ padding: 20, borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Saldo Previsto Projetado</span>
            <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6" }}>Projeção Total</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: cashFlow.forecastBalancePeriod >= 0 ? "#8b5cf6" : "#f59e0b", marginTop: 8 }}>
            {formatBRL(cashFlow.forecastBalancePeriod)}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6, display: "block" }}>
            Total a receber menos total a pagar
          </span>
        </div>
      </div>

      {/* DUAS COLUNAS: CONTAS A PAGAR vs CONTAS A RECEBER */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20 }}>
        {/* BLOCO 1: CONTAS A PAGAR */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
              <strong style={{ fontSize: 16, color: "var(--ink)" }}>Contas a Pagar (Passivo)</strong>
            </div>
            <Link href="/finance/payables" style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>
              Ver todas →
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Total Pendente</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f59e0b", marginTop: 4 }}>
                {formatBRL(payables.totalPending)}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{payables.countPending} títulos em aberto</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Total Vencido</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444", marginTop: 4 }}>
                {formatBRL(payables.totalOverdue)}
              </div>
              <span style={{ fontSize: 11, color: "#ef4444" }}>{payables.countOverdue} contas em atraso</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>A Vencer (7 dias)</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#3b82f6", marginTop: 4 }}>
                {formatBRL(payables.totalDueSoon)}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Vencimento próximo</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Total Pago no Mês</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
                {formatBRL(payables.totalPaidMonth)}
              </div>
              <span style={{ fontSize: 11, color: "#10b981" }}>Baixas realizadas</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", display: "block", marginBottom: 8 }}>
              Próximos Vencimentos de Contas a Pagar:
            </span>
            {payables.nextPayables.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0, padding: "12px 0" }}>
                Nenhuma conta a pagar pendente no momento.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {payables.nextPayables.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--subtle)", borderRadius: 6 }}>
                    <div>
                      <strong style={{ fontSize: 13, color: "var(--ink)", display: "block" }}>{item.description}</strong>
                      <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {item.supplier} • Vence em {formatDate(item.dueDate)}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: 13, color: item.status === "vencida" ? "#ef4444" : "var(--ink)" }}>
                        {formatBRL(item.remainingAmount)}
                      </strong>
                      <span className="badge" style={{ fontSize: 10, display: "block", marginTop: 2 }}>
                        {item.status === "vencida"
                          ? "Vencida"
                          : item.status === "a_vencer"
                          ? "A Vencer"
                          : item.status === "parcialmente_paga"
                          ? "Parcial"
                          : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BLOCO 2: CONTAS A RECEBER */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              <strong style={{ fontSize: 16, color: "var(--ink)" }}>Contas a Receber (Ativo)</strong>
            </div>
            <Link href="/finance/receivables" style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>
              Ver todas →
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Total a Receber</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#3b82f6", marginTop: 4 }}>
                {formatBRL(receivables.totalToReceive)}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{receivables.countToReceive} recebíveis em aberto</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Recebimentos Vencidos</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444", marginTop: 4 }}>
                {formatBRL(receivables.totalOverdue)}
              </div>
              <span style={{ fontSize: 11, color: "#ef4444" }}>{receivables.countOverdue} títulos atrasados</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>A Vencer (7 dias)</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#06b6d4", marginTop: 4 }}>
                {formatBRL(receivables.totalDueSoon)}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Receitas próximas</span>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Total Recebido no Mês</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
                {formatBRL(receivables.totalReceivedMonth)}
              </div>
              <span style={{ fontSize: 11, color: "#10b981" }}>Liquidadas em conta</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", display: "block", marginBottom: 8 }}>
              Próximos Recebimentos Programados:
            </span>
            {receivables.nextReceivables.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0, padding: "12px 0" }}>
                Nenhum valor a receber pendente no momento.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {receivables.nextReceivables.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--subtle)", borderRadius: 6 }}>
                    <div>
                      <strong style={{ fontSize: 13, color: "var(--ink)", display: "block" }}>{item.description}</strong>
                      <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {item.client} • Previsão em {formatDate(item.dueDate)}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: 13, color: "#10b981" }}>
                        {formatBRL(item.remainingAmount)}
                      </strong>
                      <span className="badge" style={{ fontSize: 10, display: "block", marginTop: 2 }}>
                        {item.status === "vencido"
                          ? "Vencido"
                          : item.status === "a_vencer"
                          ? "A Vencer"
                          : item.status === "parcialmente_recebido"
                          ? "Parcial"
                          : "A Receber"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
