"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import {
  saveReceivable,
  registerReceivablePayment,
  cancelReceivable,
} from "@/lib/finance";

function parseMoney(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/\./g, "").replace(",", ".");
  return Number(clean) || 0;
}

export async function createReceivableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");

  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "Venda de Animais").trim();
  const client = String(formData.get("client") ?? "").trim();
  const clientDoc = String(formData.get("clientDoc") ?? "").trim();
  const documentNumber = String(formData.get("documentNumber") ?? "").trim();
  const issueDate = String(formData.get("issueDate") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const totalAmount = parseMoney(String(formData.get("totalAmount") ?? ""));
  const paymentMethodDefault = String(formData.get("paymentMethodDefault") ?? "Transferência TED/PIX").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!description || !dueDate || totalAmount <= 0) {
    redirect("/finance/receivables?erro=campos_obrigatorios");
  }

  await saveReceivable(
    ctx.active.id,
    {
      description,
      category,
      client: client || "Cliente não informado",
      clientDoc,
      documentNumber,
      issueDate,
      dueDate,
      totalAmount,
      paymentMethodDefault,
      notes,
    },
    ctx.user.id
  );

  revalidatePath("/finance/receivables");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/finance/receivables?ok=cadastrado");
}

export async function settleReceivableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");

  const receivableId = String(formData.get("receivableId") ?? "");
  const amount = parseMoney(String(formData.get("amount") ?? ""));
  const date = String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const method = String(formData.get("method") ?? "Pix").trim();
  const bankAccount = String(formData.get("bankAccount") ?? "").trim();
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!receivableId || amount <= 0) {
    redirect("/finance/receivables?erro=valor_invalido");
  }

  try {
    await registerReceivablePayment(
      ctx.active.id,
      receivableId,
      {
        amount,
        date,
        method,
        bankAccount,
        receiptNumber,
        notes,
      },
      ctx.user.id
    );
  } catch (err: any) {
    redirect("/finance/receivables?erro=falha_baixa");
  }

  revalidatePath("/finance/receivables");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/finance/receivables?ok=baixa_sucesso");
}

export async function cancelReceivableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");

  const receivableId = String(formData.get("receivableId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!receivableId || reason.length < 3) {
    redirect("/finance/receivables?erro=motivo_invalido");
  }

  try {
    await cancelReceivable(ctx.active.id, receivableId, reason, ctx.user.id);
  } catch (err: any) {
    redirect("/finance/receivables?erro=falha_cancelamento");
  }

  revalidatePath("/finance/receivables");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/finance/receivables?ok=cancelado");
}
