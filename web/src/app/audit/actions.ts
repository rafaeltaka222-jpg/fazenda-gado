"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

export async function verifyChain() {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_audit_chain", { p_farm: ctx.active.id });
  if (error) redirect("/audit?chain=erro");
  if (data === null || data === undefined) redirect("/audit?chain=ok");
  redirect(`/audit?chain=quebra&linha=${encodeURIComponent(String(data))}`);
}
