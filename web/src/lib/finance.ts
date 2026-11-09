import { createClient } from "@/lib/supabase/server";

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

export function parseMoney(raw: string | null | undefined): number {
  const cleaned = String(raw ?? "").replace(/[R$\s]/g, "").trim();
  if (!cleaned) return NaN;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      normalized = parts.join("");
    }
  }
  const val = Number(normalized);
  if (!Number.isFinite(val)) return NaN;
  return Math.round(val * 100) / 100;
}

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

async function readStoreItems(farmId: string, storeName: string): Promise<any[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_reports")
    .select("definition, updated_at")
    .eq("farm_id", farmId)
    .eq("name", storeName)
    .order("updated_at", { ascending: false })
    .limit(1);

  const rec = data?.[0];
  return (rec?.definition as any)?.items ?? [];
}

async function writeStoreItems(farmId: string, storeName: string, items: any[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data: ownRec } = await supabase
    .from("saved_reports")
    .select("id")
    .eq("farm_id", farmId)
    .eq("name", storeName)
    .eq("created_by", user.id)
    .maybeSingle();

  if (ownRec?.id) {
    const { error } = await supabase
      .from("saved_reports")
      .update({
        definition: { items },
        shared: true,
      })
      .eq("id", ownRec.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("saved_reports").insert({
      farm_id: farmId,
      name: storeName,
      definition: { items },
      shared: true,
    });
    if (error) throw error;
  }
}

/* ============================================================
   CONTAS A PAGAR
============================================================ */

export async function listPayables(farmId: string): Promise<PayableItem[]> {
  const rawItems = await readStoreItems(farmId, REPORT_NAME_PAYABLES);

  const list: PayableItem[] = rawItems.map((item: any) => {
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
  await writeStoreItems(farmId, REPORT_NAME_PAYABLES, updatedItems);

  return newItem;
}

export async function registerPayablePayment(
  farmId: string,
  payableId: string,
  installment: Omit<PaymentInstallment, "id" | "registeredAt">,
  userId?: string
): Promise<void> {
  const supabase = await createClient();
  const items = await listPayables(farmId);
  const target = items.find((i) => i.id === payableId);
  if (!target) throw new Error("Conta a pagar não encontrada.");
  if (target.status === "cancelada" || target.status === "paga") {
    throw new Error("Esta conta já está quitada ou cancelada.");
  }

  const amt = Math.round(Number(installment.amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0 || amt > target.remainingAmount + 0.009) {
    throw new Error("Valor de pagamento inválido ou superior ao saldo restante.");
  }

  const now = new Date().toISOString();
  const newInst: PaymentInstallment = {
    ...installment,
    id: crypto.randomUUID(),
    amount: Math.min(amt, target.remainingAmount),
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

  await writeStoreItems(farmId, REPORT_NAME_PAYABLES, updatedItems);

  // Registra automaticamente a saída na tabela cost_entries para alimentar o fluxo contábil de custos
  try {
    const catLower = (target.category || "").toLowerCase();
    const mappedCat =
      catLower.includes("ração") || catLower.includes("racao") || catLower.includes("suplemento")
        ? "racao"
        : catLower.includes("medicamento") || catLower.includes("vacina") || catLower.includes("sanidade")
        ? "sanidade"
        : catLower.includes("folha") || catLower.includes("mão") || catLower.includes("mao")
        ? "mao_de_obra"
        : catLower.includes("combust")
        ? "combustivel"
        : catLower.includes("manuten") || catLower.includes("peça")
        ? "manutencao"
        : "outros";

    await supabase.from("cost_entries").insert({
      farm_id: farmId,
      target_type: "fazenda",
      cost_date: installment.date,
      category: mappedCat,
      description: `Pagamento: ${target.description} (Doc: ${target.documentNumber || "S/N"}) [${installment.method}]`,
      amount: newInst.amount,
    });
  } catch (err) {
    console.warn("Could not insert cost_entry log:", err);
  }
}

export async function cancelPayable(
  farmId: string,
  payableId: string,
  reason: string,
  userId?: string
): Promise<void> {
  void userId;
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

  await writeStoreItems(farmId, REPORT_NAME_PAYABLES, updatedItems);
}

/* ============================================================
   CONTAS A RECEBER & INTEGRAÇÃO COM VENDAS
============================================================ */

export async function syncSalesToReceivables(
  farmId: string,
  opts?: { saleId?: string; dueDate?: string; paymentMethod?: string; userId?: string }
): Promise<void> {
  const supabase = await createClient();

  // 1. Busca todas as vendas e compradores desta fazenda usando as colunas reais do banco
  const [{ data: sales }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_date, buyer_id, animal_count, total_amount, document, notes, voided_at")
      .eq("farm_id", farmId)
      .order("sale_date", { ascending: false }),
    supabase
      .from("people")
      .select("id, name, document")
      .eq("farm_id", farmId),
  ]);

  if (!sales || sales.length === 0) return;

  const peopleMap = new Map<string, { name: string; document: string | null }>(
    (peopleRows ?? []).map((p: any) => [p.id, { name: p.name, document: p.document }])
  );

  const currentReceivables = await listReceivables(farmId);
  let changed = false;
  const now = new Date().toISOString();

  const updatedReceivables = [...currentReceivables];

  for (const s of sales) {
    const existing = updatedReceivables.find((r) => r.saleId === s.id);
    const buyer = peopleMap.get(s.buyer_id);
    const buyerName = buyer?.name || "Comprador da Venda";
    const buyerDoc = buyer?.document || "";
    const itemsCount = Number(s.animal_count || 1);
    const docNum = s.document || "";

    if (!existing) {
      if (s.voided_at) continue;
      // Venda ativa ainda não cadastrada em Contas a Receber
      const total = Number(s.total_amount || 0);
      const isVoided = false;
      const effectiveDueDate =
        opts && opts.saleId === s.id && opts.dueDate ? opts.dueDate : s.sale_date;
      const effectiveMethod =
        opts && opts.saleId === s.id && opts.paymentMethod
          ? opts.paymentMethod
          : "Transferência TED/PIX";

      const newRec: ReceivableItem = {
        id: crypto.randomUUID(),
        farmId,
        saleId: s.id,
        description: `Venda de Gado - ${itemsCount} cabeça(s) (Doc: ${docNum || "S/N"})`,
        category: "Venda de Animais",
        client: buyerName,
        clientDoc: buyerDoc,
        documentNumber: docNum,
        issueDate: s.sale_date,
        dueDate: effectiveDueDate,
        totalAmount: total,
        receivedAmount: 0,
        remainingAmount: total,
        paymentMethodDefault: effectiveMethod,
        notes: s.notes || "",
        status: isVoided
          ? "cancelado"
          : computeReceivableStatus({
              dueDate: effectiveDueDate,
              totalAmount: total,
              receivedAmount: 0,
            }),
        cancellationReason: isVoided ? "Venda estornada no módulo de Vendas & GTA" : undefined,
        cancelledAt: s.voided_at || undefined,
        installments: [],
        createdAt: now,
        createdBy: opts?.userId,
        updatedAt: now,
      };
      updatedReceivables.unshift(newRec);
      changed = true;
    } else {
      // Atualiza vencimento/forma de pagamento se enviado logo após criar a venda
      if (opts && opts.saleId === s.id) {
        if (opts.dueDate && existing.dueDate !== opts.dueDate) {
          existing.dueDate = opts.dueDate;
          existing.status = computeReceivableStatus({
            dueDate: existing.dueDate,
            totalAmount: existing.totalAmount,
            receivedAmount: existing.receivedAmount,
            cancellationReason: existing.cancellationReason,
          });
          existing.updatedAt = now;
          changed = true;
        }
        if (opts.paymentMethod && existing.paymentMethodDefault !== opts.paymentMethod) {
          existing.paymentMethodDefault = opts.paymentMethod;
          existing.updatedAt = now;
          changed = true;
        }
      }
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
    await writeStoreItems(farmId, REPORT_NAME_RECEIVABLES, updatedReceivables);
  }
}

export async function listReceivables(farmId: string): Promise<ReceivableItem[]> {
  const rawItems = await readStoreItems(farmId, REPORT_NAME_RECEIVABLES);

  const list: ReceivableItem[] = rawItems.map((item: any) => {
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
  await writeStoreItems(farmId, REPORT_NAME_RECEIVABLES, updatedItems);

  return newItem;
}

export async function registerReceivablePayment(
  farmId: string,
  receivableId: string,
  installment: Omit<PaymentInstallment, "id" | "registeredAt">,
  userId?: string
): Promise<void> {
  const items = await listReceivables(farmId);
  const target = items.find((i) => i.id === receivableId);
  if (!target) throw new Error("Conta a receber não encontrada.");
  if (target.status === "cancelado" || target.status === "recebido") {
    throw new Error("Este recebível já está quitado ou cancelado.");
  }

  const amt = Math.round(Number(installment.amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0 || amt > target.remainingAmount + 0.009) {
    throw new Error("Valor de recebimento inválido ou superior ao saldo restante.");
  }

  const now = new Date().toISOString();
  const newInst: PaymentInstallment = {
    ...installment,
    id: crypto.randomUUID(),
    amount: Math.min(amt, target.remainingAmount),
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

  await writeStoreItems(farmId, REPORT_NAME_RECEIVABLES, updatedItems);
}

export async function cancelReceivable(
  farmId: string,
  receivableId: string,
  reason: string,
  userId?: string
): Promise<void> {
  void userId;
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

  await writeStoreItems(farmId, REPORT_NAME_RECEIVABLES, updatedItems);
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
