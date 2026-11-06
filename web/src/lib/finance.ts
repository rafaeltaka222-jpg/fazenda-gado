import { createAdminClient } from "@/lib/supabase/admin";

export type PayableStatus =
  | "pendente"
  | "a_vencer"
  | "vencida"
  | "paga"
  | "parcialmente_paga"
  | "cancelada";

export type ReceivableStatus =
  | "a_receber"
  | "a_vencer"
  | "vencido"
  | "recebido"
  | "parcialmente_recebido"
  | "cancelado";

export interface PaymentInstallment {
  id: string;
  date: string;
  amount: number;
  method: string; // "Pix", "Boleto", "Transferência TED/DOC", "Dinheiro", "Cartão", "Cheque"
  bankAccount?: string;
  receiptNumber?: string;
  notes?: string;
  registeredAt: string;
  registeredBy?: string;
}

export interface PayableItem {
  id: string;
  farmId: string;
  description: string;
  category: string; // "Ração & Suplemento", "Medicamentos", "Vacinas", "Combustível", "Folha de Pagamento", "Manutenção & Peças", "Fornecedores", "Despesas Operacionais", "Outras"
  supplier: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethodDefault: string;
  notes?: string;
  status: PayableStatus;
  installments: PaymentInstallment[];
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
}

export interface ReceivableItem {
  id: string;
  farmId: string;
  saleId?: string; // Vinculado à tabela de vendas se originado de uma venda de gado
  description: string;
  category: string; // "Venda de Animais", "Venda de Embriões / Genética", "Prestação de Serviços", "Arrendamento", "Outras Receitas"
  client: string;
  clientDoc?: string; // CPF ou CNPJ
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  receivedAmount: number;
  remainingAmount: number;
  paymentMethodDefault: string;
  notes?: string;
  status: ReceivableStatus;
  installments: PaymentInstallment[];
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
}

export interface FinancialSummary {
  payables: {
    totalPending: number;
    totalDueSoon: number;
    totalOverdue: number;
    totalPaidMonth: number;
    totalForecast: number;
    countPending: number;
    countOverdue: number;
    nextPayables: PayableItem[];
  };
  receivables: {
    totalToReceive: number;
    totalDueSoon: number;
    totalOverdue: number;
    totalReceivedMonth: number;
    totalForecast: number;
    countToReceive: number;
    countOverdue: number;
    nextReceivables: ReceivableItem[];
  };
  cashFlow: {
    realizedRevenuesMonth: number;
    realizedExpensesMonth: number;
    realizedBalanceMonth: number;
    forecastBalancePeriod: number;
  };
}

const REPORT_NAME_PAYABLES = "__fin_payables_store__";
const REPORT_NAME_RECEIVABLES = "__fin_receivables_store__";

function computePayableStatus(
  item: Pick<PayableItem, "dueDate" | "totalAmount" | "paidAmount" | "cancellationReason">
): PayableStatus {
  if (item.cancellationReason) return "cancelada";
  const remaining = Number((item.totalAmount - (item.paidAmount || 0)).toFixed(2));
  if (remaining <= 0) return "paga";
  if (item.paidAmount > 0) return "parcialmente_paga";

  const today = new Date().toISOString().slice(0, 10);
  if (item.dueDate < today) return "vencida";

  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (item.dueDate <= in7Days) return "a_vencer";

  return "pendente";
}

function computeReceivableStatus(
  item: Pick<ReceivableItem, "dueDate" | "totalAmount" | "receivedAmount" | "cancellationReason">
): ReceivableStatus {
  if (item.cancellationReason) return "cancelado";
  const remaining = Number((item.totalAmount - (item.receivedAmount || 0)).toFixed(2));
  if (remaining <= 0) return "recebido";
  if (item.receivedAmount > 0) return "parcialmente_recebido";

  const today = new Date().toISOString().slice(0, 10);
  if (item.dueDate < today) return "vencido";

  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (item.dueDate <= in7Days) return "a_vencer";

  return "a_receber";
}

/* ============================================================
   CONTAS A PAGAR
============================================================ */

export async function listPayables(farmId: string): Promise<PayableItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("saved_reports")
    .select("definition")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_PAYABLES)
    .maybeSingle();

  const list: PayableItem[] = (data?.definition?.items ?? []).map((item: any) => {
    const paid = Number((item.installments ?? []).reduce((acc: number, cur: any) => acc + (Number(cur.amount) || 0), 0).toFixed(2));
    const total = Number(item.totalAmount || 0);
    const remaining = Math.max(0, Number((total - paid).toFixed(2)));
    const status = computePayableStatus({
      dueDate: item.dueDate,
      totalAmount: total,
      paidAmount: paid,
      cancellationReason: item.cancellationReason,
    });
    return {
      ...item,
      paidAmount: paid,
      remainingAmount: remaining,
      status,
      installments: item.installments ?? [],
    };
  });

  // Ordena por data de vencimento
  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function savePayable(
  farmId: string,
  payload: Omit<PayableItem, "id" | "farmId" | "paidAmount" | "remainingAmount" | "status" | "installments" | "createdAt" | "updatedAt">,
  userId?: string
): Promise<PayableItem> {
  const admin = createAdminClient();
  const existing = await listPayables(farmId);

  const now = new Date().toISOString();
  const total = Number(payload.totalAmount);
  const newItem: PayableItem = {
    ...payload,
    id: crypto.randomUUID(),
    farmId,
    totalAmount: total,
    paidAmount: 0,
    remainingAmount: total,
    status: computePayableStatus({ dueDate: payload.dueDate, totalAmount: total, paidAmount: 0 }),
    installments: [],
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
  };

  const updatedItems = [newItem, ...existing];

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_PAYABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  } else {
    await admin.from("saved_reports").insert({
      farm_id: farmId,
      name: REPORT_NAME_PAYABLES,
      definition: { items: updatedItems },
      created_by: userId,
      updated_by: userId,
    });
  }

  return newItem;
}

export async function registerPayablePayment(
  farmId: string,
  payableId: string,
  installment: Omit<PaymentInstallment, "id" | "registeredAt">,
  userId?: string
): Promise<void> {
  const admin = createAdminClient();
  const items = await listPayables(farmId);
  const target = items.find((i) => i.id === payableId);
  if (!target) throw new Error("Conta a pagar não encontrada.");

  const now = new Date().toISOString();
  const newInst: PaymentInstallment = {
    ...installment,
    id: crypto.randomUUID(),
    amount: Number(installment.amount),
    registeredAt: now,
    registeredBy: userId,
  };

  const updatedInstallments = [...target.installments, newInst];
  const paid = Number(updatedInstallments.reduce((sum, inst) => sum + inst.amount, 0).toFixed(2));
  const remaining = Math.max(0, Number((target.totalAmount - paid).toFixed(2)));
  const status = computePayableStatus({
    dueDate: target.dueDate,
    totalAmount: target.totalAmount,
    paidAmount: paid,
    cancellationReason: target.cancellationReason,
  });

  const updatedItems = items.map((item) =>
    item.id === payableId
      ? {
          ...item,
          paidAmount: paid,
          remainingAmount: remaining,
          status,
          installments: updatedInstallments,
          updatedAt: now,
        }
      : item
  );

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_PAYABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  }

  // Registra automaticamente a saída na tabela cost_entries para alimentar o fluxo contábil de custos
  try {
    await admin.from("cost_entries").insert({
      farm_id: farmId,
      date: installment.date,
      category: target.category,
      description: `Pagamento: ${target.description} (Doc: ${target.documentNumber || "S/N"}) [${installment.method}]`,
      amount: newInst.amount,
      created_by: userId,
    });
  } catch (err) {
    // Ignora se cost_entries tiver alguma constraint não atendida
    console.warn("Could not insert cost_entry log:", err);
  }
}

export async function cancelPayable(
  farmId: string,
  payableId: string,
  reason: string,
  userId?: string
): Promise<void> {
  const admin = createAdminClient();
  const items = await listPayables(farmId);
  const now = new Date().toISOString();

  const updatedItems = items.map((item) =>
    item.id === payableId
      ? {
          ...item,
          status: "cancelada" as PayableStatus,
          cancellationReason: reason,
          cancelledAt: now,
          updatedAt: now,
        }
      : item
  );

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_PAYABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  }
}

/* ============================================================
   CONTAS A RECEBER & INTEGRAÇÃO COM VENDAS
============================================================ */

export async function syncSalesToReceivables(farmId: string): Promise<void> {
  const admin = createAdminClient();

  // 1. Busca todas as vendas desta fazenda
  const { data: sales } = await admin
    .from("sales")
    .select("id, sale_date, total_amount, document_number, notes, voided_at, people(name, tax_id), sale_items(id)")
    .eq("farm_id", farmId);

  if (!sales || sales.length === 0) return;

  const currentReceivables = await listReceivables(farmId);
  let changed = false;
  const now = new Date().toISOString();

  const updatedReceivables = [...currentReceivables];

  for (const s of sales) {
    const existing = updatedReceivables.find((r) => r.saleId === s.id);
    const buyerName = (s.people as any)?.name || "Comprador da Venda";
    const buyerDoc = (s.people as any)?.tax_id || "";
    const itemsCount = (s.sale_items as any[])?.length || 1;

    if (!existing) {
      // Venda ainda não cadastrada em Contas a Receber
      const total = Number(s.total_amount || 0);
      const isVoided = Boolean(s.voided_at);
      const newRec: ReceivableItem = {
        id: crypto.randomUUID(),
        farmId,
        saleId: s.id,
        description: `Venda de Gado - ${itemsCount} cabeça(s) (Doc: ${s.document_number || "S/N"})`,
        category: "Venda de Animais",
        client: buyerName,
        clientDoc: buyerDoc,
        documentNumber: s.document_number || "",
        issueDate: s.sale_date,
        dueDate: s.sale_date,
        totalAmount: total,
        receivedAmount: 0,
        remainingAmount: total,
        paymentMethodDefault: "Transferência TED/PIX",
        notes: s.notes || "",
        status: isVoided ? "cancelado" : computeReceivableStatus({ dueDate: s.sale_date, totalAmount: total, receivedAmount: 0 }),
        cancellationReason: isVoided ? "Venda estornada no módulo de Vendas & GTA" : undefined,
        cancelledAt: s.voided_at || undefined,
        installments: [],
        createdAt: now,
        updatedAt: now,
      };
      updatedReceivables.unshift(newRec);
      changed = true;
    } else {
      // Se a venda foi estornada no módulo de vendas e o recebível ainda não está cancelado
      if (s.voided_at && !existing.cancellationReason) {
        existing.status = "cancelado";
        existing.cancellationReason = "Venda estornada no módulo de Vendas & GTA";
        existing.cancelledAt = s.voided_at;
        existing.updatedAt = now;
        changed = true;
      }
    }
  }

  if (changed) {
    const { data: rec } = await admin
      .from("saved_reports")
      .select("id")
      .eq("farm_id", farmId)
      .eq("name", REPORT_NAME_RECEIVABLES)
      .maybeSingle();

    if (rec) {
      await admin
        .from("saved_reports")
        .update({ definition: { items: updatedReceivables }, updated_at: now })
        .eq("id", rec.id);
    } else {
      await admin.from("saved_reports").insert({
        farm_id: farmId,
        name: REPORT_NAME_RECEIVABLES,
        definition: { items: updatedReceivables },
      });
    }
  }
}

export async function listReceivables(farmId: string): Promise<ReceivableItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("saved_reports")
    .select("definition")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_RECEIVABLES)
    .maybeSingle();

  const list: ReceivableItem[] = (data?.definition?.items ?? []).map((item: any) => {
    const received = Number((item.installments ?? []).reduce((acc: number, cur: any) => acc + (Number(cur.amount) || 0), 0).toFixed(2));
    const total = Number(item.totalAmount || 0);
    const remaining = Math.max(0, Number((total - received).toFixed(2)));
    const status = computeReceivableStatus({
      dueDate: item.dueDate,
      totalAmount: total,
      receivedAmount: received,
      cancellationReason: item.cancellationReason,
    });
    return {
      ...item,
      receivedAmount: received,
      remainingAmount: remaining,
      status,
      installments: item.installments ?? [],
    };
  });

  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function saveReceivable(
  farmId: string,
  payload: Omit<ReceivableItem, "id" | "farmId" | "receivedAmount" | "remainingAmount" | "status" | "installments" | "createdAt" | "updatedAt">,
  userId?: string
): Promise<ReceivableItem> {
  const admin = createAdminClient();
  const existing = await listReceivables(farmId);

  const now = new Date().toISOString();
  const total = Number(payload.totalAmount);
  const newItem: ReceivableItem = {
    ...payload,
    id: crypto.randomUUID(),
    farmId,
    totalAmount: total,
    receivedAmount: 0,
    remainingAmount: total,
    status: computeReceivableStatus({ dueDate: payload.dueDate, totalAmount: total, receivedAmount: 0 }),
    installments: [],
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
  };

  const updatedItems = [newItem, ...existing];

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_RECEIVABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  } else {
    await admin.from("saved_reports").insert({
      farm_id: farmId,
      name: REPORT_NAME_RECEIVABLES,
      definition: { items: updatedItems },
      created_by: userId,
      updated_by: userId,
    });
  }

  return newItem;
}

export async function registerReceivablePayment(
  farmId: string,
  receivableId: string,
  installment: Omit<PaymentInstallment, "id" | "registeredAt">,
  userId?: string
): Promise<void> {
  const admin = createAdminClient();
  const items = await listReceivables(farmId);
  const target = items.find((i) => i.id === receivableId);
  if (!target) throw new Error("Conta a receber não encontrada.");

  const now = new Date().toISOString();
  const newInst: PaymentInstallment = {
    ...installment,
    id: crypto.randomUUID(),
    amount: Number(installment.amount),
    registeredAt: now,
    registeredBy: userId,
  };

  const updatedInstallments = [...target.installments, newInst];
  const received = Number(updatedInstallments.reduce((sum, inst) => sum + inst.amount, 0).toFixed(2));
  const remaining = Math.max(0, Number((target.totalAmount - received).toFixed(2)));
  const status = computeReceivableStatus({
    dueDate: target.dueDate,
    totalAmount: target.totalAmount,
    receivedAmount: received,
    cancellationReason: target.cancellationReason,
  });

  const updatedItems = items.map((item) =>
    item.id === receivableId
      ? {
          ...item,
          receivedAmount: received,
          remainingAmount: remaining,
          status,
          installments: updatedInstallments,
          updatedAt: now,
        }
      : item
  );

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_RECEIVABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  }
}

export async function cancelReceivable(
  farmId: string,
  receivableId: string,
  reason: string,
  userId?: string
): Promise<void> {
  const admin = createAdminClient();
  const items = await listReceivables(farmId);
  const now = new Date().toISOString();

  const updatedItems = items.map((item) =>
    item.id === receivableId
      ? {
          ...item,
          status: "cancelado" as ReceivableStatus,
          cancellationReason: reason,
          cancelledAt: now,
          updatedAt: now,
        }
      : item
  );

  const { data: rec } = await admin
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", REPORT_NAME_RECEIVABLES)
    .maybeSingle();

  if (rec) {
    await admin
      .from("saved_reports")
      .update({ definition: { items: updatedItems }, updated_at: now, updated_by: userId })
      .eq("id", rec.id);
  }
}

/* ============================================================
   DASHBOARD FINANCEIRO & RESUMO EXECUTIVO
============================================================ */

export async function getFinancialSummary(
  farmId: string,
  filterYearMonth?: string // "YYYY-MM"
): Promise<FinancialSummary> {
  // Sincroniza vendas automaticamente antes de montar o resumo
  await syncSalesToReceivables(farmId);

  const [payables, receivables] = await Promise.all([
    listPayables(farmId),
    listReceivables(farmId),
  ]);

  const ym = filterYearMonth || new Date().toISOString().slice(0, 7);

  // Filtra payables não canceladas
  const activePayables = payables.filter((p) => p.status !== "cancelada");
  const activeReceivables = receivables.filter((r) => r.status !== "cancelado");

  // Cálculos Contas a Pagar
  let totalPendingPay = 0;
  let totalDueSoonPay = 0;
  let totalOverduePay = 0;
  let totalPaidMonth = 0;
  let totalForecastPay = 0;
  let countPendingPay = 0;
  let countOverduePay = 0;

  for (const p of activePayables) {
    totalForecastPay += p.totalAmount;
    if (p.status === "paga") {
      // soma parcelas pagas no mês
      for (const inst of p.installments) {
        if (inst.date.startsWith(ym)) totalPaidMonth += inst.amount;
      }
    } else {
      // Tem saldo em aberto
      totalPendingPay += p.remainingAmount;
      countPendingPay++;
      if (p.status === "vencida") {
        totalOverduePay += p.remainingAmount;
        countOverduePay++;
      } else if (p.status === "a_vencer") {
        totalDueSoonPay += p.remainingAmount;
      }
      for (const inst of p.installments) {
        if (inst.date.startsWith(ym)) totalPaidMonth += inst.amount;
      }
    }
  }

  // Cálculos Contas a Receber
  let totalToReceive = 0;
  let totalDueSoonRec = 0;
  let totalOverdueRec = 0;
  let totalReceivedMonth = 0;
  let totalForecastRec = 0;
  let countToReceive = 0;
  let countOverdueRec = 0;

  for (const r of activeReceivables) {
    totalForecastRec += r.totalAmount;
    if (r.status === "recebido") {
      for (const inst of r.installments) {
        if (inst.date.startsWith(ym)) totalReceivedMonth += inst.amount;
      }
    } else {
      totalToReceive += r.remainingAmount;
      countToReceive++;
      if (r.status === "vencido") {
        totalOverdueRec += r.remainingAmount;
        countOverdueRec++;
      } else if (r.status === "a_vencer") {
        totalDueSoonRec += r.remainingAmount;
      }
      for (const inst of r.installments) {
        if (inst.date.startsWith(ym)) totalReceivedMonth += inst.amount;
      }
    }
  }

  // Próximos vencimentos
  const nextPayables = activePayables
    .filter((p) => p.status !== "paga")
    .slice(0, 5);

  const nextReceivables = activeReceivables
    .filter((r) => r.status !== "recebido")
    .slice(0, 5);

  const realizedRevenuesMonth = Number(totalReceivedMonth.toFixed(2));
  const realizedExpensesMonth = Number(totalPaidMonth.toFixed(2));
  const realizedBalanceMonth = Number((realizedRevenuesMonth - realizedExpensesMonth).toFixed(2));
  const forecastBalancePeriod = Number((totalForecastRec - totalForecastPay).toFixed(2));

  return {
    payables: {
      totalPending: Number(totalPendingPay.toFixed(2)),
      totalDueSoon: Number(totalDueSoonPay.toFixed(2)),
      totalOverdue: Number(totalOverduePay.toFixed(2)),
      totalPaidMonth: Number(totalPaidMonth.toFixed(2)),
      totalForecast: Number(totalForecastPay.toFixed(2)),
      countPending: countPendingPay,
      countOverdue: countOverduePay,
      nextPayables,
    },
    receivables: {
      totalToReceive: Number(totalToReceive.toFixed(2)),
      totalDueSoon: Number(totalDueSoonRec.toFixed(2)),
      totalOverdue: Number(totalOverdueRec.toFixed(2)),
      totalReceivedMonth: Number(totalReceivedMonth.toFixed(2)),
      totalForecast: Number(totalForecastRec.toFixed(2)),
      countToReceive: countToReceive,
      countOverdue: countOverdueRec,
      nextReceivables,
    },
    cashFlow: {
      realizedRevenuesMonth,
      realizedExpensesMonth,
      realizedBalanceMonth,
      forecastBalancePeriod,
    },
  };
}
