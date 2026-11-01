import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

// Cliente anônimo: a autorização é feita pela chave de API, validada dentro do banco.
export const apiClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export function keyHash(request: Request): string | null {
  const m = /^Bearer\s+(fz_[A-Za-z0-9_-]{20,80})$/.exec(request.headers.get("authorization") ?? "");
  return m ? createHash("sha256").update(m[1]).digest("hex") : null;
}

const H = { "Cache-Control": "no-store" };
export const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: H });
export const fail = (status: number, code: string, message: string, extra?: Record<string, string>) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { ...H, ...extra } });
export const unauthorized = () =>
  fail(401, "unauthorized", "Informe a chave no cabeçalho Authorization: Bearer <chave>.", { "WWW-Authenticate": "Bearer" });

export function fromDb(e: { code?: string; message: string }) {
  const m = e.message;
  if (e.code === "P0429") return fail(429, "rate_limited", "Limite de requisições por minuto excedido.", { "Retry-After": "60" });
  if (e.code === "28000") return fail(401, "invalid_key", "Chave inválida, expirada ou revogada.", { "WWW-Authenticate": "Bearer" });
  if (e.code === "42501") return fail(403, "insufficient_scope", "A chave não tem o escopo necessário.");
  if (e.code === "P0404") return fail(404, "not_found", "Recurso não encontrado.");
  if (e.code === "23505") return fail(409, "duplicate", "Registro duplicado (mesmo animal, data e hora).");
  if (/invalid_|22P02|22007|22008/.test(m + (e.code ?? ""))) return fail(422, "validation_error", "Dados inválidos: confira os campos enviados.");
  return fail(500, "internal_error", "Erro interno.");
}
