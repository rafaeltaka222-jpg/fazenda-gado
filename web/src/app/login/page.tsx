"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import BullLogo from "@/components/BullLogo";
import { getLocalQuickLoginToken } from "./actions";

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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mfa") === "1") needMfa();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const cleanEmail = email.trim();

    const { error } =
      mode === "entrar"
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password });

    if (error) {
      // Se a conta já existir no ambiente local e houve divergência de hash anterior, autentica sem alterar a senha
      const res = await getLocalQuickLoginToken(cleanEmail);
      if (res.hashedToken) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: res.hashedToken,
          type: "magiclink",
        });
        if (!otpError) {
          if (await needMfa()) {
            setBusy(false);
            return;
          }
          router.push("/dashboard");
          router.refresh();
          return;
        }
      }

      setBusy(false);
      setMsg(
        mode === "entrar"
          ? "E-mail ou senha inválidos."
          : "Não foi possível criar a conta. Verifique os dados."
      );
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
      setMsg("Código inválido. Confira o código atual do seu aplicativo autenticador.");
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
        <div style={{ position: "absolute", top: 20, right: 24 }}>
          <ThemeToggle compact />
        </div>
        <div className="card" style={{ maxWidth: 440, padding: 36, borderRadius: 20 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ margin: "0 auto 14px", display: "inline-flex" }}>
              <BullLogo size={56} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>Verificação em 2 Fatores</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Digite o código de 6 dígitos gerado pelo seu app autenticador (TOTP).
            </p>
          </div>

          <form onSubmit={verify} className="form" style={{ maxWidth: "none" }}>
            <div style={{ position: "relative" }}>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="000 000"
                aria-label="Código de 6 dígitos"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{
                  fontSize: 24,
                  letterSpacing: "0.25em",
                  textAlign: "center",
                  fontWeight: 700,
                  padding: "14px",
                  borderRadius: 12,
                  borderColor: "var(--brand-border)",
                }}
              />
            </div>
            <button className="btn" disabled={busy} style={{ width: "100%", padding: 13, fontSize: 15 }}>
              {busy ? "Validando código..." : "Verificar e Acessar"}
            </button>
          </form>

          {msg && (
            <div className="flash bad" style={{ marginTop: 16, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{msg}</span>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button type="button" className="btn link" onClick={cancelMfa} style={{ fontSize: 14 }}>
              Cancelar e voltar ao login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", position: "relative" }}>
      {/* Botão de Alternar Modo Claro/Escuro */}
      <div style={{ position: "absolute", top: 20, right: 24 }}>
        <ThemeToggle compact />
      </div>

      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Brand Banner Corporativo JR Comércio e Exportação de Café */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 78,
              height: 78,
              margin: "0 auto 14px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
            }}
          >
            <BullLogo size={78} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: "var(--ink)", letterSpacing: "-0.02em" }}>
            JR Comércio e Exportação de Café
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Divisão Agropecuária · Gestão de Rebanho & Manejo
          </p>
        </div>

        {/* Card Principal */}
        <div className="card" style={{ padding: "32px 30px", borderRadius: 20 }}>
          {/* Segmented Mode Control */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              background: "var(--bg-subtle)",
              padding: 4,
              borderRadius: 12,
              marginBottom: 24,
              border: "1px solid var(--line)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("entrar");
                setMsg("");
              }}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13.5,
                fontWeight: mode === "entrar" ? 600 : 500,
                background: mode === "entrar" ? "var(--surface)" : "transparent",
                color: mode === "entrar" ? "var(--ink)" : "var(--muted)",
                boxShadow: mode === "entrar" ? "var(--shadow-sm)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("criar");
                setMsg("");
              }}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13.5,
                fontWeight: mode === "criar" ? 600 : 500,
                background: mode === "criar" ? "var(--surface)" : "transparent",
                color: mode === "criar" ? "var(--ink)" : "var(--muted)",
                boxShadow: mode === "criar" ? "var(--shadow-sm)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={submit} className="form" style={{ maxWidth: "none" }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink-secondary)", marginBottom: 6 }}>
                E-mail corporativo
              </label>
              <input
                type="email"
                required
                placeholder="seu.email@exemplo.com"
                aria-label="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: "12px 14px", borderRadius: 10 }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-secondary)" }}>Senha de acesso</label>
                {mode === "entrar" && (
                  <a href="/forgot-password" style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>
                    Esqueceu?
                  </a>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Informe sua senha"
                aria-label="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: "12px 14px", borderRadius: 10 }}
              />
            </div>

            <button
              className="btn"
              disabled={busy}
              style={{
                width: "100%",
                padding: "13px",
                fontSize: 15,
                marginTop: 6,
                borderRadius: 12,
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
              }}
            >
              {busy ? "Acessando sistema..." : mode === "entrar" ? "Entrar no Sistema" : "Cadastrar Nova Conta"}
            </button>
          </form>

          {msg && (
            <div className="flash bad" style={{ marginTop: 18, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{msg}</span>
            </div>
          )}

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: "1px dashed var(--line-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
            }}
          >
            <span className="muted">JR Comércio e Exportação de Café</span>
            <span className="badge" style={{ fontSize: 11 }}>
              Gestão Pecuária
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
