"use server";

const LOCAL_SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_SECRET_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

export async function getLocalQuickLoginToken(
  email: string
): Promise<{ hashedToken?: string; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isLocal =
    supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");

  if (!isLocal) {
    return { error: "Disponível apenas em ambiente local." };
  }

  const targetEmail = (email || "").trim().toLowerCase();
  if (!targetEmail) {
    return { error: "Informe o e-mail." };
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      apikey: LOCAL_SECRET_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_JWT}`,
    };

    // Gera um token_hash de sessão local sem alterar a senha cadastrada do usuário
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "magiclink",
        email: targetEmail,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      return { error: "Conta não encontrada no ambiente local." };
    }

    const data = await res.json();
    if (data?.hashed_token) {
      return { hashedToken: data.hashed_token };
    }

    return { error: "Token de sessão não retornado." };
  } catch {
    return { error: "Falha de comunicação com o serviço de autenticação local." };
  }
}
