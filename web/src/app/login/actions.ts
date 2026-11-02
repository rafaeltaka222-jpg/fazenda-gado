"use server";

const LOCAL_SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_SECRET_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

export async function getLocalQuickLoginToken(
  email: string,
  newPassword?: string
): Promise<{ hashedToken?: string; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isLocal =
    supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");

  if (!isLocal) {
    return { error: "Acesso rápido disponível apenas em ambiente local." };
  }

  const targetEmail = (email || "rafaeltaka222@gmail.com").trim().toLowerCase();

  try {
    const headers = {
      "Content-Type": "application/json",
      apikey: LOCAL_SECRET_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_JWT}`,
    };

    // Gera um magiclink token_hash para autenticar sem exigir redigitação de senha
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
      return { error: "Não foi possível gerar sessão local para este e-mail." };
    }

    const data = await res.json();

    // Se o usuário informou uma nova senha válida no ambiente local, sincroniza no GoTrue
    if (newPassword && newPassword.length >= 6 && data?.id) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${data.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          password: newPassword,
          email_confirm: true,
        }),
        cache: "no-store",
      }).catch(() => {});
    }

    if (data?.hashed_token) {
      return { hashedToken: data.hashed_token };
    }

    return { error: "Token de acesso local não retornado." };
  } catch {
    return { error: "Falha de comunicação com o serviço de autenticação local." };
  }
}
