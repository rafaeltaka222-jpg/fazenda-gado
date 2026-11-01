"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (p1.length < 8) return setMsg("A senha deve ter pelo menos 8 caracteres.");
    if (p1 !== p2) return setMsg("As senhas não conferem.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setMsg("Não foi possível definir a senha. O link pode ter expirado: peça um novo em \"Esqueci a senha\".");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth">
      <div className="card">
        <h1 className="title" style={{ fontSize: 22 }}>Nova senha</h1>
        <form onSubmit={submit} className="form" style={{ maxWidth: "none" }}>
          <input type="password" autoComplete="new-password" required placeholder="Nova senha (mínimo 8 caracteres)" aria-label="Nova senha" value={p1} onChange={(e) => setP1(e.target.value)} />
          <input type="password" autoComplete="new-password" required placeholder="Repita a nova senha" aria-label="Repita a nova senha" value={p2} onChange={(e) => setP2(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? "Salvando..." : "Definir senha"}</button>
        </form>
        {msg && <p role="alert" className="error">{msg}</p>}
      </div>
    </main>
  );
}
