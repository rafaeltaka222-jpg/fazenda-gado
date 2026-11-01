"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [step, setStep] = useState<"senha" | "mfa">("senha");
  const [factorId, setFactorId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function needMfa(): Promise<boolean> {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        setStep("mfa");
        return true;
      }
    }
    return false;
  }

  // Se já entrou com a senha mas falta o código do 2FA (redirecionado pelo sistema)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mfa") === "1") needMfa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const { error } =
      mode === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) {
      setBusy(false);
      // Mensagem genérica de propósito: não revela se o e-mail existe.
      setMsg(mode === "entrar" ? "E-mail ou senha inválidos." : "Não foi possível criar a conta. Verifique os dados.");
      return;
    }
    if (await needMfa()) {
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setMsg("Código inválido. Confira o código atual do aplicativo.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function cancelMfa() {
    await createClient().auth.signOut();
    setStep("senha");
    setCode("");
    setMsg("");
  }

  if (step === "mfa") {
    return (
      <main className="auth">
        <div className="card">
          <h1 className="title" style={{ fontSize: 22 }}>Verificação em dois fatores</h1>
          <p className="muted">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
          <form onSubmit={verify} className="form" style={{ maxWidth: "none" }}>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000" aria-label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={busy}>{busy ? "Aguarde..." : "Verificar"}</button>
          </form>
          {msg && <p role="alert" className="error">{msg}</p>}
          <button type="button" className="btn link" onClick={cancelMfa}>Voltar</button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="card">
        <h1 className="title" style={{ fontSize: 22 }}>Fazenda Gado</h1>
        <p className="muted">{mode === "entrar" ? "Entre na sua conta" : "Crie a sua conta"}</p>
        <form onSubmit={submit} className="form" style={{ maxWidth: "none" }}>
          <input type="email" required placeholder="E-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required minLength={8} placeholder="Senha (mínimo 8 caracteres)" aria-label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? "Aguarde..." : mode === "entrar" ? "Entrar" : "Criar conta"}</button>
        </form>
        {msg && <p role="alert" className="error">{msg}</p>}
        {mode === "entrar" && <p style={{ margin: 0 }}><a href="/forgot-password" style={{ color: "var(--green)", fontWeight: 600 }}>Esqueci a senha</a></p>}
        <button type="button" className="btn link" onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}>
          {mode === "entrar" ? "Não tenho conta" : "Já tenho conta"}
        </button>
      </div>
    </main>
  );
}
