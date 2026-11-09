"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PayableItem, PaymentInstallment } from "@/lib/finance";
import {
  createPayableAction,
  settlePayableAction,
  cancelPayableAction,
} from "./actions";

const CATEGORIES = [
  "Ração & Suplemento",
  "Medicamentos",
  "Vacinas & Biológicos",
  "Combustível & Lubrificantes",
  "Folha de Pagamento & Mão de Obra",
  "Manutenção & Peças",
  "Sementes & Pastagem",
  "Fornecedores Diversos",
  "Despesas Operacionais",
  "Impostos & Taxas",
  "Outras Despesas",
];

const METHODS = [
  "Pix",
  "Boleto Bancário",
  "Transferência TED/DOC",
  "Dinheiro em Espécie",
  "Cartão de Débito/Crédito",
  "Cheque",
];

function formatBRL(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function PayablesClient({
  items,
  farmName,
}: {
  items: PayableItem[];
  farmName: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<PayableItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PayableItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PayableItem | null>(null);

  // Form states for Settle modal
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settleDate, setSettleDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [settleMethod, setSettleMethod] = useState<string>("Pix");
  const [settleBank, setSettleBank] = useState<string>("Conta Principal");
  const [settleReceipt, setSettleReceipt] = useState<string>("");
  const [settleNotes, setSettleNotes] = useState<string>("");

  // Cancel form
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    setIsNewModalOpen(false);
    setSettleTarget(null);
    setCancelTarget(null);
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "todos" && item.status !== statusFilter) return false;
      if (categoryFilter !== "todas" && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          item.description.toLowerCase().includes(q) ||
          item.supplier.toLowerCase().includes(q) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, categoryFilter]);

  // KPIs
  const totalPendente = items
    .filter((i) => i.status !== "cancelada" && i.status !== "paga")
    .reduce((acc, i) => acc + i.remainingAmount, 0);

  const totalVencido = items
    .filter((i) => i.status === "vencida")
    .reduce((acc, i) => acc + i.remainingAmount, 0);

  const totalPagoGeral = items
    .filter((i) => i.status !== "cancelada")
    .reduce((acc, i) => acc + i.paidAmount, 0);

  function openSettle(item: PayableItem) {
    setSettleTarget(item);
    setSettleAmount(item.remainingAmount.toFixed(2).replace(".", ","));
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleMethod(item.paymentMethodDefault || "Pix");
    setSettleReceipt("");
    setSettleNotes("");
  }

  function exportCSV() {
    const headers = [
      "Vencimento",
      "Emissão",
      "Descrição",
      "Categoria",
      "Fornecedor",
      "Documento/NF",
      "Valor Total (R$)",
      "Valor Pago (R$)",
      "Saldo Restante (R$)",
      "Situação",
    ];
    const rows = filtered.map((i) => [
      i.dueDate,
      i.issueDate,
      `"${i.description.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      `"${i.supplier.replace(/"/g, '""')}"`,
      `"${i.documentNumber || ""}"`,
      i.totalAmount.toFixed(2),
      i.paidAmount.toFixed(2),
      i.remainingAmount.toFixed(2),
      i.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `contas_a_pagar_${farmName.toLowerCase().replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Action & KPI Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #f59e0b" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Total Pendente em Aberto</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", marginTop: 6 }}>
            {formatBRL(totalPendente)}
          </div>
          <span style={{ fontSize: 12, color: "#f59e0b", marginTop: 4, display: "block" }}>
            A pagar e programado
          </span>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: "4px solid #ef4444" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Contas Vencidas</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", marginTop: 6 }}>
            {formatBRL(totalVencido)}
          </div>
          <span style={{ fontSize: 12, color: "#ef4444", marginTop: 4, display: "block" }}>
            Necessita regularização urgente
          </span>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: "4px solid #10b981" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Total Já Pago</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981", marginTop: 6 }}>
            {formatBRL(totalPagoGeral)}
          </div>
          <span style={{ fontSize: 12, color: "#10b981", marginTop: 4, display: "block" }}>
            Pagamentos realizados baixados
          </span>
        </div>
      </div>

      {/* Action Buttons & Filter Toolbar */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Lançamentos de Contas a Pagar</span>
            <span className="badge">{filtered.length} registro(s)</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={exportCSV} className="btn ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Exportar CSV
            </button>

            <button
              onClick={() => setIsNewModalOpen(true)}
              className="btn"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nova Conta a Pagar
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <input
            type="text"
            placeholder="Buscar por descrição, fornecedor, NF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 13 }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 13 }}
          >
            <option value="todos">Todos os Status</option>
            <option value="pendente">Pendente</option>
            <option value="a_vencer">A Vencer (próximos 7 dias)</option>
            <option value="vencida">Vencida</option>
            <option value="parcialmente_paga">Parcialmente Paga</option>
            <option value="paga">Totalmente Paga</option>
            <option value="cancelada">Cancelada</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 13 }}
          >
            <option value="todas">Todas as Categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ overflowX: "auto", padding: 0 }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Descrição & Categoria</th>
              <th>Fornecedor / Favorecido</th>
              <th>Doc / NF</th>
              <th style={{ textAlign: "right" }}>Valor Total</th>
              <th style={{ textAlign: "right" }}>Saldo Aberto</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "36px 12px", color: "var(--ink-muted)" }}>
                  Nenhuma conta a pagar encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isOverdue = item.status === "vencida";
                const isPaid = item.status === "paga";
                const isCancelled = item.status === "cancelada";

                return (
                  <tr key={item.id} style={{ opacity: isCancelled ? 0.6 : 1 }}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 700, color: isOverdue ? "#ef4444" : "var(--ink)" }}>
                          {formatDate(item.dueDate)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                          Emissão: {formatDate(item.issueDate)}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong style={{ color: "var(--ink)" }}>{item.description}</strong>
                        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{item.category}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{item.supplier}</span>
                        {item.paymentMethodDefault && (
                          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                            Forma: {item.paymentMethodDefault}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: 13, fontFamily: "monospace" }}>
                        {item.documentNumber || "-"}
                      </span>
                    </td>

                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {formatBRL(item.totalAmount)}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontWeight: 700, color: item.remainingAmount > 0 ? (isOverdue ? "#ef4444" : "#f59e0b") : "#10b981" }}>
                          {formatBRL(item.remainingAmount)}
                        </span>
                        {item.paidAmount > 0 && (
                          <span style={{ fontSize: 11, color: "#10b981" }}>
                            Pago: {formatBRL(item.paidAmount)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {item.status === "paga" && (
                        <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          Paga
                        </span>
                      )}
                      {item.status === "parcialmente_paga" && (
                        <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                          Parcial
                        </span>
                      )}
                      {item.status === "vencida" && (
                        <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                          Vencida
                        </span>
                      )}
                      {item.status === "a_vencer" && (
                        <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                          A vencer
                        </span>
                      )}
                      {item.status === "pendente" && (
                        <span className="badge" style={{ background: "rgba(156, 163, 175, 0.15)", color: "#9ca3af", border: "1px solid rgba(156, 163, 175, 0.3)" }}>
                          Pendente
                        </span>
                      )}
                      {item.status === "cancelada" && (
                        <span className="badge" style={{ background: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", textDecoration: "line-through" }} title={item.cancellationReason}>
                          Cancelada
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {!isPaid && !isCancelled && (
                          <button
                            onClick={() => openSettle(item)}
                            className="btn"
                            style={{ padding: "5px 12px", fontSize: 12, background: "#10b981", color: "#fff" }}
                            title="Registrar pagamento (total ou parcial)"
                          >
                            Dar Baixa
                          </button>
                        )}

                        {item.installments.length > 0 && (
                          <button
                            onClick={() => setHistoryTarget(item)}
                            className="btn ghost"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            title="Ver histórico de parcelas e comprovantes"
                          >
                            Histórico ({item.installments.length})
                          </button>
                        )}

                        {!isCancelled && !isPaid && (
                          <button
                            onClick={() => setCancelTarget(item)}
                            className="btn ghost"
                            style={{ padding: "5px 8px", fontSize: 12, color: "#ef4444" }}
                            title="Cancelar lançamento"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: NOVA CONTA A PAGAR */}
      {isNewModalOpen && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 18, color: "var(--ink)" }}>Cadastrar Nova Conta a Pagar</strong>
              <button onClick={() => setIsNewModalOpen(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <form action={createPayableAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Descrição da Conta / Despesa *
                <input name="description" required placeholder="Ex: Compra de 50 sacos de Sal Mineral" style={{ padding: "8px 12px" }} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Categoria *
                  <select name="category" required style={{ padding: "8px 12px" }}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Fornecedor / Favorecido *
                  <input name="supplier" required placeholder="Ex: Agropecuária Triângulo" style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Número do Documento / Nota Fiscal
                  <input name="documentNumber" placeholder="Ex: NF-e 004812" style={{ padding: "8px 12px" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Valor Total (R$) *
                  <input name="totalAmount" required placeholder="Ex: 2.500,00" style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data de Emissão
                  <input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} style={{ padding: "8px 12px" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data de Vencimento *
                  <input name="dueDate" type="date" required style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Forma de Pagamento Prevista
                <select name="paymentMethodDefault" style={{ padding: "8px 12px" }}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Observações
                <textarea name="notes" rows={2} placeholder="Informações adicionais, centro de custos, condições comerciais..." style={{ padding: "8px 12px" }} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn" style={{ padding: "10px 24px" }}>Salvar Conta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BAIXA DE PAGAMENTO */}
      {settleTarget && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 520, width: "100%", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <strong style={{ fontSize: 18, color: "var(--ink)" }}>Registrar Baixa de Pagamento</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>{settleTarget.description}</p>
              </div>
              <button onClick={() => setSettleTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8, marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Valor Original</span>
                <div style={{ fontWeight: 700 }}>{formatBRL(settleTarget.totalAmount)}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Já Pago</span>
                <div style={{ fontWeight: 700, color: "#10b981" }}>{formatBRL(settleTarget.paidAmount)}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Saldo Aberto</span>
                <div style={{ fontWeight: 800, color: "#f59e0b" }}>{formatBRL(settleTarget.remainingAmount)}</div>
              </div>
            </div>

            <form action={settlePayableAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="payableId" value={settleTarget.id} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Valor a Pagar Agora (R$) *
                  <input
                    name="amount"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    style={{ padding: "8px 12px", fontWeight: 700 }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data do Pagamento *
                  <input
                    name="date"
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    style={{ padding: "8px 12px" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Forma de Pagamento *
                  <select
                    name="method"
                    value={settleMethod}
                    onChange={(e) => setSettleMethod(e.target.value)}
                    style={{ padding: "8px 12px" }}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Conta Bancária / Caixa
                  <input
                    name="bankAccount"
                    value={settleBank}
                    onChange={(e) => setSettleBank(e.target.value)}
                    placeholder="Ex: Banco do Brasil / Caixa"
                    style={{ padding: "8px 12px" }}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Comprovante / Autenticação Bancária
                <input
                  name="receiptNumber"
                  value={settleReceipt}
                  onChange={(e) => setSettleReceipt(e.target.value)}
                  placeholder="Código do comprovante ou autenticação"
                  style={{ padding: "8px 12px" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Observações do Pagamento
                <input
                  name="notes"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Ex: Parcela 1/2 quitada com desconto"
                  style={{ padding: "8px 12px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setSettleTarget(null)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn" style={{ background: "#10b981", color: "#fff", padding: "10px 24px" }}>
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTÓRICO DE PARCELAS */}
      {historyTarget && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 580, width: "100%", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <strong style={{ fontSize: 18, color: "var(--ink)" }}>Histórico de Pagamentos</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>{historyTarget.description}</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Forma</th>
                  <th>Conta</th>
                  <th>Comprovante</th>
                  <th style={{ textAlign: "right" }}>Valor Pago</th>
                </tr>
              </thead>
              <tbody>
                {historyTarget.installments.map((inst) => (
                  <tr key={inst.id}>
                    <td>{formatDate(inst.date)}</td>
                    <td>{inst.method}</td>
                    <td>{inst.bankAccount || "-"}</td>
                    <td>{inst.receiptNumber || "-"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                      {formatBRL(inst.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHistoryTarget(null)} className="btn">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCELAMENTO COM MOTIVO */}
      {cancelTarget && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <strong style={{ fontSize: 18, color: "#ef4444" }}>Cancelar Conta a Pagar</strong>
              <button onClick={() => setCancelTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 12px" }}>
              O cancelamento preserva o registro para auditoria e cancela o saldo pendente.
            </p>

            <form action={cancelPayableAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="payableId" value={cancelTarget.id} />
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Motivo do Cancelamento *
                <input
                  name="reason"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Compra cancelada pelo fornecedor"
                  style={{ padding: "8px 12px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setCancelTarget(null)} className="btn ghost">Voltar</button>
                <button type="submit" className="btn" style={{ background: "#ef4444", color: "#fff", padding: "8px 20px" }}>
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
