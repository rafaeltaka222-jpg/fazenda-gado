"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import type { KeyState } from "@/lib/apiTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createApiKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const ctx = await getContext();
  if (!ctx.active) return { error: "Crie uma fazenda primeiro." };
  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData.getAll("scopes").map(String).filter((s) => ["read", "write_weighings"].includes(s));
  const days = Number(String(formData.get("days") ?? "").trim() || "0");
  if (!name || scopes.length === 0 || !Number.isInteger(days) || days < 0 || days > 3650) {
    return { error: "Informe um nome, ao menos um escopo e uma validade válida (em dias)." };
  }
  // A chave em texto só existe aqui e na resposta desta tela; o banco guarda apenas o hash.
  const key = "fz_" + randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_api_key", {
    p_farm: ctx.active.id, p_name: name, p_scopes: scopes, p_prefix: key.slice(0, 11), p_hash: hash, p_days: days || null,
  });
  if (error) return { error: error.code === "42501" ? "Você não tem permissão para criar chaves." : "Não foi possível criar a chave." };
  revalidatePath("/settings/api");
  return { key };
}

export async function revokeApiKey(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/settings/api");
  const supabase = await createClient();
  await supabase.rpc("revoke_api_key", { p_id: id });
  revalidatePath("/settings/api");
  redirect("/settings/api?ok=revogada");
}
