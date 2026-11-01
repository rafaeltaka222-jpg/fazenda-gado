"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordPanel() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setOk(false);
    if (p1.length < 8) return setMsg("A senha deve ter pelo menos 8 caracteres.");
    if (p1 !== p2) return setMsg("As senhas não conferem.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setMsg("Não foi possível trocar a senha. Saia, entre de novo e tente outra vez.");
    setOk(true);
    setP1("");
    setP2("");
  }

  return (
    <form onSubmit={submit} className="card">
      <strong>Trocar senha</strong>
      {ok && <div className="flash" style={{ marginTop: 12 }}>Senha alterada.</div>}
      {msg && <div className="flash bad" role="alert" style={{ marginTop: 12 }}>{msg}</div>}
      <div className="form" style={{ marginTop: 12 }}>
        <input type="password" autoComplete="new-password" placeholder="Nova senha (mínimo 8 caracteres)" aria-label="Nova senha" value={p1} onChange={(e) => setP1(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="Repita a nova senha" aria-label="Repita a nova senha" value={p2} onChange={(e) => setP2(e.target.value)} />
        <button className="btn" disabled={busy}>{busy ? "Salvando..." : "Trocar senha"}</button>
      </div>
    </form>
  );
}
