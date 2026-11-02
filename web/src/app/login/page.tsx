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
  const [email, setEmail] = useState("rafaeltaka222@gmail.com");
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

  async function quickLogin(targetEmail?: string, newPass?: string): Promise<boolean> {
    const supabase = createClient();
    const res = await getLocalQuickLoginToken(targetEmail || email || "rafaeltaka222@gmail.com", newPass);
    if (res.hashedToken) {
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: res.hashedToken,
        type: "magiclink",
      });
      if (!otpError) {
        if (await needMfa()) {
          setBusy(false);
          return true;
        }
        router.push("/dashboard");
        router.refresh();
        return true;
      }
    }
    return false;
  }

  async function handleQuickAccess() {
    setBusy(true);
    setMsg("");
    const ok = await quickLogin("rafaeltaka222@gmail.com");
    if (!ok) {
      setBusy(false);
      setMsg("Não foi possível iniciar o acesso rápido local.");
    }
  }

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
      // Em ambiente local, se a conta já existe ou a senha foi redefinida, sincroniza e autentica automaticamente
      const recovered = await quickLogin(cleanEmail, password);
      if (recovered) return;

      setBusy(false);
      setMsg(
        mode === "entrar"
          ? "E-mail ou senha inválidos."
          : "Não foi possível criar a conta. Verifique os dados ou use a aba Entrar."
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
            <div
              style={{
                width: 54,
                height: 54,
                margin: "0 auto 14px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 14px rgba(5, 150, 105, 0.3)",
                color: "#fff",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
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
        {/* Brand Banner */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 58,
              height: 58,
              margin: "0 auto 12px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(5, 150, 105, 0.2)",
            }}
          >
            <BullLogo size={36} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: "var(--ink)", letterSpacing: "-0.02em" }}>
            FAZENDA GADO <span className="pro-tag" style={{ verticalAlign: "middle", marginLeft: 4 }}>PRO</span>
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Plataforma Corporativa de Gestão Pecuária
          </p>
        </div>

        {/* Card Principal */}
        <div className="card" style={{ padding: "30px 28px", borderRadius: 20 }}>
          {/* Botão de Acesso Direto 1-Clique (Ambiente Local) */}
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={handleQuickAccess}
              disabled={busy}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--brand-border)",
                background: "var(--brand-light)",
                color: "var(--brand)",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: busy ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>{busy ? "Autenticando..." : "Acesso Rápido: rafaeltaka222@gmail.com"}</span>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 18,
              color: "var(--muted)",
              fontSize: 11.5,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span>ou acesse com credenciais</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          {/* Segmented Mode Control */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              background: "var(--bg-subtle)",
              padding: 4,
              borderRadius: 12,
              marginBottom: 20,
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
                E-mail corporativo ou pessoal
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
              {busy ? "Acessando sistema..." : mode === "entrar" ? "Entrar na Fazenda" : "Cadastrar Nova Conta"}
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

          {/* Quick Helper for Demo User */}
          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: "1px dashed var(--line-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12.5,
            }}
          >
            <span className="muted">Ambiente Local Homologado</span>
            <span className="badge" style={{ fontSize: 11 }}>
              v1.2 Pro
            </span>
          </div>
        </div>

        {/* Feature Pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Rastreabilidade SISBOV
          </span>
          <span style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Balança & GMD
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Trânsito & GTA
          </span>
        </div>
      </div>
    </main>
  );
}
