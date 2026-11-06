"use client";

import React, { useState, useMemo } from "react";
import { ReceivableItem, PaymentInstallment } from "@/lib/finance";
import {
  createReceivableAction,
  settleReceivableAction,
  cancelReceivableAction,
} from "./actions";

const CATEGORIES = [
  "Venda de Animais",
  "Venda de Embriões / Genética",
  "Prestação de Serviços Pecuários",
  "Arrendamento de Pastagem",
  "Venda de Esterco / Subprodutos",
  "Outras Receitas",
];

const METHODS = [
  "Pix",
  "Transferência TED/PIX",
  "Boleto Bancário",
  "Dinheiro em Espécie",
  "Cheque",
  "Cartão de Crédito/Débito",
];

function formatBRL(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function ReceivablesClient({
  items,
  farmName,
}: {
  items: ReceivableItem[];
  farmName: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<ReceivableItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ReceivableItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReceivableItem | null>(null);

  // Form states for Settle modal
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settleDate, setSettleDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [settleMethod, setSettleMethod] = useState<string>("Pix");
  const [settleBank, setSettleBank] = useState<string>("Conta Principal");
  const [settleReceipt, setSettleReceipt] = useState<string>("");
  const [settleNotes, setSettleNotes] = useState<string>("");

  // Cancel form
  const [cancelReason, setCancelReason] = useState("");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "todos" && item.status !== statusFilter) return false;
      if (categoryFilter !== "todas" && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          item.description.toLowerCase().includes(q) ||
          item.client.toLowerCase().includes(q) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(q)) ||
          (item.clientDoc && item.clientDoc.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, categoryFilter]);

  // KPIs
  const totalAReceber = items
    .filter((i) => i.status !== "cancelado" && i.status !== "recebido")
    .reduce((acc, i) => acc + i.remainingAmount, 0);

  const totalVencido = items
    .filter((i) => i.status === "vencido")
    .reduce((acc, i) => acc + i.remainingAmount, 0);

  const totalRecebidoGeral = items
    .filter((i) => i.status !== "cancelado")
    .reduce((acc, i) => acc + i.receivedAmount, 0);

  function openSettle(item: ReceivableItem) {
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
      "Emissão/Venda",
      "Descrição",
      "Categoria",
      "Cliente/Comprador",
      "CPF/CNPJ",
      "Doc/Contrato",
      "Valor Total (R$)",
      "Valor Recebido (R$)",
      "Saldo Restante (R$)",
      "Situação",
    ];
    const rows = filtered.map((i) => [
      i.dueDate,
      i.issueDate,
      `"${i.description.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      `"${i.client.replace(/"/g, '""')}"`,
      `"${i.clientDoc || ""}"`,
      `"${i.documentNumber || ""}"`,
      i.totalAmount.toFixed(2),
      i.receivedAmount.toFixed(2),
      i.remainingAmount.toFixed(2),
      i.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `contas_a_receber_${farmName.toLowerCase().replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Action & KPI Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #3b82f6" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Total a Receber em Aberto</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", marginTop: 6 }}>
            {formatBRL(totalAReceber)}
          </div>
          <span style={{ fontSize: 12, color: "#3b82f6", marginTop: 4, display: "block" }}>
            Receitas futuras e parcelas a vencer
          </span>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: "4px solid #ef4444" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Recebimentos Vencidos</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", marginTop: 6 }}>
            {formatBRL(totalVencido)}
          </div>
          <span style={{ fontSize: 12, color: "#ef4444", marginTop: 4, display: "block" }}>
            Valores pendentes de cobrança
          </span>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: "4px solid #10b981" }}>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>Total Já Recebido</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981", marginTop: 6 }}>
            {formatBRL(totalRecebidoGeral)}
          </div>
          <span style={{ fontSize: 12, color: "#10b981", marginTop: 4, display: "block" }}>
            Receitas liquidadas em caixa
          </span>
        </div>
      </div>

      {/* Action Buttons & Filter Toolbar */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Lançamentos de Contas a Receber</span>
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
              Nova Conta a Receber
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <input
            type="text"
            placeholder="Buscar por cliente, CPF/CNPJ, contrato..."
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
            <option value="a_receber">A Receber</option>
            <option value="a_vencer">A Vencer (próximos 7 dias)</option>
            <option value="vencido">Vencido</option>
            <option value="parcialmente_recebido">Parcialmente Recebido</option>
            <option value="recebido">Totalmente Recebido</option>
            <option value="cancelado">Cancelado</option>
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
              <th>Cliente / Comprador</th>
              <th>Doc / Contrato</th>
              <th style={{ textAlign: "right" }}>Valor Total</th>
              <th style={{ textAlign: "right" }}>Saldo a Receber</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "36px 12px", color: "var(--ink-muted)" }}>
                  Nenhum recebível encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isOverdue = item.status === "vencido";
                const isReceived = item.status === "recebido";
                const isCancelled = item.status === "cancelado";

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
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <strong style={{ color: "var(--ink)" }}>{item.description}</strong>
                          {item.saleId && (
                            <span className="badge" style={{ fontSize: 10, background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }} title="Integrado automaticamente com Vendas de Gado">
                              Venda
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{item.category}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{item.client}</span>
                        {item.clientDoc && (
                          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                            Doc: {item.clientDoc}
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
                        <span style={{ fontWeight: 700, color: item.remainingAmount > 0 ? (isOverdue ? "#ef4444" : "#3b82f6") : "#10b981" }}>
                          {formatBRL(item.remainingAmount)}
                        </span>
                        {item.receivedAmount > 0 && (
                          <span style={{ fontSize: 11, color: "#10b981" }}>
                            Recebido: {formatBRL(item.receivedAmount)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {item.status === "recebido" && (
                        <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          Recebido
                        </span>
                      )}
                      {item.status === "parcialmente_recebido" && (
                        <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                          Parcial
                        </span>
                      )}
                      {item.status === "vencido" && (
                        <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                          Vencido
                        </span>
                      )}
                      {item.status === "a_vencer" && (
                        <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                          A vencer
                        </span>
                      )}
                      {item.status === "a_receber" && (
                        <span className="badge" style={{ background: "rgba(156, 163, 175, 0.15)", color: "#9ca3af", border: "1px solid rgba(156, 163, 175, 0.3)" }}>
                          A receber
                        </span>
                      )}
                      {item.status === "cancelado" && (
                        <span className="badge" style={{ background: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", textDecoration: "line-through" }} title={item.cancellationReason}>
                          Cancelado
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {!isReceived && !isCancelled && (
                          <button
                            onClick={() => openSettle(item)}
                            className="btn"
                            style={{ padding: "5px 12px", fontSize: 12, background: "#10b981", color: "#fff" }}
                            title="Registrar recebimento de valor (total ou parcial)"
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

                        {!isCancelled && !isReceived && (
                          <button
                            onClick={() => setCancelTarget(item)}
                            className="btn ghost"
                            style={{ padding: "5px 8px", fontSize: 12, color: "#ef4444" }}
                            title="Cancelar recebimento"
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

      {/* MODAL: NOVA CONTA A RECEBER */}
      {isNewModalOpen && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 18, color: "var(--ink)" }}>Cadastrar Conta a Receber</strong>
              <button onClick={() => setIsNewModalOpen(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <form action={createReceivableAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Descrição da Receita *
                <input name="description" required placeholder="Ex: Venda de lote de novilhas / prestação de serviço" style={{ padding: "8px 12px" }} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Categoria *
                  <select name="category" required style={{ padding: "8px 12px" }}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Cliente / Comprador *
                  <input name="client" required placeholder="Nome do cliente ou frigorífico" style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  CPF ou CNPJ do Cliente
                  <input name="clientDoc" placeholder="000.000.000-00" style={{ padding: "8px 12px" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Número do Documento / Contrato
                  <input name="documentNumber" placeholder="Ex: CTR-2026/01" style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data de Venda / Emissão
                  <input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} style={{ padding: "8px 12px" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data Prevista de Recebimento *
                  <input name="dueDate" type="date" required style={{ padding: "8px 12px" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Valor Total (R$) *
                  <input name="totalAmount" required placeholder="Ex: 45.000,00" style={{ padding: "8px 12px" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Forma Prevista de Recebimento
                  <select name="paymentMethodDefault" style={{ padding: "8px 12px" }}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Observações
                <textarea name="notes" rows={2} placeholder="Condições acordadas, número da GTA, dados bancários de depósito..." style={{ padding: "8px 12px" }} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn" style={{ padding: "10px 24px" }}>Salvar Recebível</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BAIXA DE RECEBIMENTO */}
      {settleTarget && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 520, width: "100%", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <strong style={{ fontSize: 18, color: "var(--ink)" }}>Registrar Baixa de Recebimento</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>{settleTarget.description}</p>
              </div>
              <button onClick={() => setSettleTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ background: "var(--subtle)", padding: 12, borderRadius: 8, marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Valor Total</span>
                <div style={{ fontWeight: 700 }}>{formatBRL(settleTarget.totalAmount)}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Já Recebido</span>
                <div style={{ fontWeight: 700, color: "#10b981" }}>{formatBRL(settleTarget.receivedAmount)}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Saldo a Receber</span>
                <div style={{ fontWeight: 800, color: "#3b82f6" }}>{formatBRL(settleTarget.remainingAmount)}</div>
              </div>
            </div>

            <form action={settleReceivableAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="receivableId" value={settleTarget.id} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Valor Recebido Agora (R$) *
                  <input
                    name="amount"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    style={{ padding: "8px 12px", fontWeight: 700 }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Data do Recebimento *
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  Forma de Recebimento *
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
                  Conta Destino / Banco
                  <input
                    name="bankAccount"
                    value={settleBank}
                    onChange={(e) => setSettleBank(e.target.value)}
                    placeholder="Ex: Banco do Brasil / Sicredi"
                    style={{ padding: "8px 12px" }}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Comprovante / Número do TED ou PIX
                <input
                  name="receiptNumber"
                  value={settleReceipt}
                  onChange={(e) => setSettleReceipt(e.target.value)}
                  placeholder="ID da transação ou número do comprovante"
                  style={{ padding: "8px 12px" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Observações do Recebimento
                <input
                  name="notes"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Ex: Parcela 1/3 recebida via Pix"
                  style={{ padding: "8px 12px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setSettleTarget(null)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn" style={{ background: "#10b981", color: "#fff", padding: "10px 24px" }}>
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTÓRICO DE PARCELAS RECEBIDAS */}
      {historyTarget && (
        <div className="jr-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div className="card" style={{ maxWidth: 580, width: "100%", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <strong style={{ fontSize: 18, color: "var(--ink)" }}>Histórico de Recebimentos</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>{historyTarget.description}</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Forma</th>
                  <th>Conta Destino</th>
                  <th>Comprovante</th>
                  <th style={{ textAlign: "right" }}>Valor Recebido</th>
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
              <strong style={{ fontSize: 18, color: "#ef4444" }}>Cancelar Recebimento</strong>
              <button onClick={() => setCancelTarget(null)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 12px" }}>
              O cancelamento desativa a pendência financeira e registra o motivo para fins de conformidade.
            </p>

            <form action={cancelReceivableAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="hidden" name="receivableId" value={cancelTarget.id} />
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                Motivo do Cancelamento *
                <input
                  name="reason"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Negociação desfeita ou contrato cancelado"
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
