"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

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
    const { error } =
      mode === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) {
      setBusy(false);
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
            <div style={{
              width: 54, height: 54, margin: "0 auto 14px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 14px rgba(5, 150, 105, 0.3)", color: "#fff"
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>Verificação em 2 Fatores</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>Digite o código de 6 dígitos gerado pelo seu app autenticador (TOTP).</p>
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
                  borderColor: "var(--brand-border)"
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
              ← Cancelar e voltar ao login
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
          <div style={{
            width: 58, height: 58, margin: "0 auto 12px",
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 20px rgba(5, 150, 105, 0.35)", color: "#fff"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 0 0-7.07 17.07L12 22l7.07-2.93A10 10 0 0 0 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: "var(--ink)", letterSpacing: "-0.02em" }}>Fazenda Gado</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Plataforma Inteligente de Gestão Pecuária</p>
        </div>

        {/* Card Principal */}
        <div className="card" style={{ padding: "32px 30px", borderRadius: 20 }}>
          {/* Segmented Mode Control */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4,
            background: "var(--bg-subtle)", padding: 4, borderRadius: 12, marginBottom: 24,
            border: "1px solid var(--line)"
          }}>
            <button
              type="button"
              onClick={() => { setMode("entrar"); setMsg(""); }}
              style={{
                border: 0, borderRadius: 8, padding: "8px 12px", fontSize: 13.5, fontWeight: mode === "entrar" ? 600 : 500,
                background: mode === "entrar" ? "var(--surface)" : "transparent",
                color: mode === "entrar" ? "var(--ink)" : "var(--muted)",
                boxShadow: mode === "entrar" ? "var(--shadow-sm)" : "none",
                cursor: "pointer", transition: "all 0.15s ease"
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode("criar"); setMsg(""); }}
              style={{
                border: 0, borderRadius: 8, padding: "8px 12px", fontSize: 13.5, fontWeight: mode === "criar" ? 600 : 500,
                background: mode === "criar" ? "var(--surface)" : "transparent",
                color: mode === "criar" ? "var(--ink)" : "var(--muted)",
                boxShadow: mode === "criar" ? "var(--shadow-sm)" : "none",
                cursor: "pointer", transition: "all 0.15s ease"
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
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-secondary)" }}>
                  Senha de acesso
                </label>
                {mode === "entrar" && (
                  <a href="/forgot-password" style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>
                    Esqueceu?
                  </a>
                )}
              </div>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mínimo de 8 caracteres"
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
                width: "100%", padding: "13px", fontSize: 15, marginTop: 6,
                borderRadius: 12, boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)"
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
          <div style={{
            marginTop: 24, paddingTop: 18, borderTop: "1px dashed var(--line-strong)",
            display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5
          }}>
            <span className="muted">Ambiente Local Homologado</span>
            <span className="badge" style={{ fontSize: 11 }}>v1.2 Pro</span>
          </div>
        </div>

        {/* Feature Pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Rastreabilidade SISBOV
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Balança & GMD
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Trânsito & GTA
          </span>
        </div>
      </div>
    </main>
  );
}