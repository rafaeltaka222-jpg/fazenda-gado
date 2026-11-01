"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setBusy(false);
    setSent(true); // resposta igual exista ou não a conta: não revela quem tem cadastro
  }

  return (
    <main className="auth">
      <div className="card">
        <h1 className="title" style={{ fontSize: 22 }}>Recuperar senha</h1>
        {sent ? (
          <>
            <p>Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Abra o link <strong>neste mesmo navegador</strong>.</p>
            <a href="/login" className="btn ghost">Voltar ao login</a>
          </>
        ) : (
          <form onSubmit={submit} className="form" style={{ maxWidth: "none" }}>
            <input type="email" required placeholder="E-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" disabled={busy}>{busy ? "Enviando..." : "Enviar link"}</button>
            <a href="/login" style={{ color: "var(--green)", fontWeight: 600 }}>Voltar ao login</a>
          </form>
        )}
      </div>
    </main>
  );
}
