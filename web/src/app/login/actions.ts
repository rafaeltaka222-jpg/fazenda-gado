"use server";

// Ações do fluxo de autenticação seguro
export async function checkAuthHealth(): Promise<{ ok: boolean }> {
  return { ok: true };
}
