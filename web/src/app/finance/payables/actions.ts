"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import {
  savePayable,
  registerPayablePayment,
  cancelPayable,
  parseMoney,
} from "@/lib/finance";

export async function createPayableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("costs.create")) {
    redirect("/finance/payables?erro=sem_permissao");
  }

  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "Despesas Operacionais").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const documentNumber = String(formData.get("documentNumber") ?? "").trim();
  const issueDate = String(formData.get("issueDate") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const totalAmount = parseMoney(String(formData.get("totalAmount") ?? ""));
  const paymentMethodDefault = String(formData.get("paymentMethodDefault") ?? "Pix").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!description || !dueDate || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    redirect("/finance/payables?erro=campos_obrigatorios");
  }

  await savePayable(
    ctx.active.id,
    {
      description,
      category,
      supplier: supplier || "Fornecedor não informado",
      documentNumber,
      issueDate,
      dueDate,
      totalAmount,
      paymentMethodDefault,
      notes,
    },
    ctx.user.id
  );

  revalidatePath("/finance/payables");
  revalidatePath("/finance");
  revalidatePath("/costs");
  revalidatePath("/dashboard");
  redirect("/finance/payables?ok=cadastrado");
}

export async function settlePayableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("costs.update") && !perms.includes("costs.create")) {
    redirect("/finance/payables?erro=sem_permissao");
  }

  const payableId = String(formData.get("payableId") ?? "");
  const amount = parseMoney(String(formData.get("amount") ?? ""));
  const date = String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const method = String(formData.get("method") ?? "Pix").trim();
  const bankAccount = String(formData.get("bankAccount") ?? "").trim();
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!payableId || !Number.isFinite(amount) || amount <= 0) {
    redirect("/finance/payables?erro=valor_invalido");
  }

  try {
    await registerPayablePayment(
      ctx.active.id,
      payableId,
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
    redirect("/finance/payables?erro=falha_baixa");
  }

  revalidatePath("/finance/payables");
  revalidatePath("/finance");
  revalidatePath("/costs");
  revalidatePath("/dashboard");
  redirect("/finance/payables?ok=baixa_sucesso");
}

export async function cancelPayableAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const perms = ctx.active.permissions ?? resolveRolePermissions(ctx.active.role);
  if (!perms.includes("costs.update")) {
    redirect("/finance/payables?erro=sem_permissao");
  }

  const payableId = String(formData.get("payableId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!payableId || reason.length < 3) {
    redirect("/finance/payables?erro=motivo_invalido");
  }

  try {
    await cancelPayable(ctx.active.id, payableId, reason, ctx.user.id);
  } catch (err: any) {
    redirect("/finance/payables?erro=falha_cancelamento");
  }

  revalidatePath("/finance/payables");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/finance/payables?ok=cancelado");
}
