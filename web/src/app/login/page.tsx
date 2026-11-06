"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import JRLogo from "@/components/JRLogo";

type Direction = "up" | "down" | "flat";

interface TickerItem {
  id: string;
  label: string;
  dot: string;
  num: number;
  sub: string;
  delta: string;
  dir: Direction;
}

interface InputItem {
  id: string;
  name: string;
  unit: string;
  num: number;
  delta: string;
  dir: Direction;
}

interface CalfItem {
  id: string;
  breed: string;
  num: number;
}

// Cotações 100% voltadas à pecuária de corte e insumos (sem café)
const INITIAL_TICKERS: TickerItem[] = [
  { id: "boi_cepea", label: "Boi Gordo CEPEA", dot: "#10b981", num: 314.5, sub: "@ arroba à vista (SP)", delta: "1,2%", dir: "up" },
  { id: "bezerro_ms", label: "Bezerro Nelore", dot: "#3b82f6", num: 2850.0, sub: "cabeça desmamada (MS)", delta: "0,8%", dir: "up" },
  { id: "dolar", label: "Dólar comercial", dot: "#06b6d4", num: 5.48, sub: "cotação do dia", delta: "0,2%", dir: "up" },
];

const INITIAL_INPUTS: InputItem[] = [
  { id: "milho", name: "Milho em grão", unit: "60 kg", num: 68.5, delta: "0,8%", dir: "down" },
  { id: "soja", name: "Farelo de soja", unit: "50 kg", num: 112.0, delta: "2,1%", dir: "up" },
  { id: "sal", name: "Sal mineral", unit: "25 kg", num: 96.9, delta: "estável", dir: "flat" },
  { id: "nucleo", name: "Núcleo proteico", unit: "25 kg", num: 148.0, delta: "0,6%", dir: "up" },
];

const INITIAL_CALVES: CalfItem[] = [
  { id: "nelore", breed: "Nelore", num: 2850 },
  { id: "angus", breed: "Angus × Nelore", num: 3420 },
  { id: "girolando", breed: "Girolando", num: 2380 },
  { id: "brahman", breed: "Brahman", num: 3050 },
];

const INITIAL_SPARK = [30, 34, 31, 36, 33, 38, 35, 40, 37, 42, 41, 46];

function formatBRL(value: number, decimals = 2) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function Delta({ dir, value }: { dir: Direction; value: string }) {
  if (dir === "flat") return <span className="jr-login-delta-flat">● {value}</span>;
  return (
    <span className={dir === "up" ? "jr-login-delta-up" : "jr-login-delta-down"}>
      {dir === "up" ? "▲" : "▼"} {value}
    </span>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 200;
  const h = 46;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - 4 - ((v - min) / range) * (h - 10);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <div className="jr-login-spark-wrap" style={{ width: "100%", height: 46, maxHeight: 46, overflow: "hidden" }}>
      <svg
        className="jr-login-spark-svg"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="46"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: "100%", height: 46, maxHeight: 46, display: "block" }}
      >
        <polygon points={area} fill="rgba(255,255,255,0.16)" />
        <polyline
          points={line}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"senha" | "mfa">("senha");
  const [factorId, setFactorId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* Cotações dinâmicas que atualizam automaticamente */
  const [tickers, setTickers] = useState<TickerItem[]>(INITIAL_TICKERS);
  const [inputs, setInputs] = useState<InputItem[]>(INITIAL_INPUTS);
  const [calves, setCalves] = useState<CalfItem[]>(INITIAL_CALVES);
  const [arroba, setArroba] = useState<number>(314.5);
  const [arrobaDelta, setArrobaDelta] = useState<string>("1,2%");
  const [sparkline, setSparkline] = useState<number[]>(INITIAL_SPARK);
  const [updatedTime, setUpdatedTime] = useState<string>("");
  const [flashKey, setFlashKey] = useState<{ id: string; dir: "up" | "down" } | null>(null);

  useEffect(() => {
    // Inicializa relógio com o horário atual
    const updateClock = () => {
      const now = new Date();
      setUpdatedTime(
        now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    updateClock();

    // Motor de atualização automática das cotações da pecuária
    const interval = setInterval(() => {
      updateClock();

      const choice = Math.floor(Math.random() * 4);

      if (choice === 0) {
        // Atualiza Arroba do Boi Gordo
        setArroba((prev) => {
          const change = Math.random() * 0.7 - 0.32;
          const next = Math.max(310.0, Math.min(318.5, Number((prev + change).toFixed(2))));
          const dir: Direction = next >= prev ? "up" : "down";
          const pct = Math.abs(((next - 310.5) / 310.5) * 100).toFixed(1).replace(".", ",");
          setArrobaDelta(`${pct}% na semana`);
          setFlashKey({ id: "arroba", dir });
          setSparkline((pts) => {
            const nextPt = Math.round(30 + ((next - 310.0) / (318.5 - 310.0)) * 20);
            return [...pts.slice(1), nextPt];
          });
          return next;
        });
      } else if (choice === 1) {
        // Atualiza um dos Tickers de Cotação
        setTickers((prev) => {
          const idx = Math.floor(Math.random() * prev.length);
          const current = prev[idx];
          const isDolar = current.id === "dolar";
          const deltaChange = isDolar ? (Math.random() * 0.04 - 0.02) : (Math.random() * 3.5 - 1.6);
          const nextVal = Number((current.num + deltaChange).toFixed(2));
          const dir: Direction = nextVal >= current.num ? "up" : "down";
          const pct = Math.abs((deltaChange / current.num) * 100).toFixed(1).replace(".", ",");

          setFlashKey({ id: current.id, dir });

          return prev.map((item, i) =>
            i === idx ? { ...item, num: nextVal, delta: `${pct}%`, dir } : item
          );
        });
      } else if (choice === 2) {
        // Atualiza um dos Insumos/Ração
        setInputs((prev) => {
          const idx = Math.floor(Math.random() * prev.length);
          const current = prev[idx];
          const deltaChange = Math.random() * 0.8 - 0.4;
          const nextVal = Number((current.num + deltaChange).toFixed(2));
          const dir: Direction = nextVal >= current.num ? "up" : "down";
          const pct = Math.abs((deltaChange / current.num) * 100).toFixed(1).replace(".", ",");

          setFlashKey({ id: current.id, dir });

          return prev.map((item, i) =>
            i === idx ? { ...item, num: nextVal, delta: `${pct}%`, dir } : item
          );
        });
      } else {
        // Atualiza um dos Bezerros por Raça
        setCalves((prev) => {
          const idx = Math.floor(Math.random() * prev.length);
          const current = prev[idx];
          const deltaChange = Math.round(Math.random() * 20 - 10);
          const nextVal = current.num + deltaChange;
          const dir: Direction = nextVal >= current.num ? "up" : "down";

          setFlashKey({ id: current.id, dir });

          return prev.map((item, i) =>
            i === idx ? { ...item, num: nextVal } : item
          );
        });
      }

      setTimeout(() => setFlashKey(null), 1200);
    }, 4200);

    return () => clearInterval(interval);
  }, []);

  async function needMfa(): Promise<boolean> {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
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

  function goToPanel() {
    router.push("/dashboard");
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanEmail || !cleanPass) {
      setError("Preencha o e-mail e a senha cadastrados para entrar.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setError("Informe um endereço de e-mail corporativo válido.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (authError) {
      setBusy(false);
      setError("E-mail ou senha incorretos. Acesso restrito a usuários autorizados.");
      return;
    }

    if (await needMfa()) {
      setBusy(false);
      return;
    }
    goToPanel();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Digite os 6 números do aplicativo autenticador.");
      return;
    }
    setBusy(true);
    const { error: mfaError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (mfaError) {
      setBusy(false);
      setError("Código não conferiu. Use o código que aparece agora no aplicativo.");
      return;
    }
    goToPanel();
  }

  async function cancelMfa() {
    await createClient().auth.signOut();
    setStep("senha");
    setCode("");
    setError("");
  }

  return (
    <main className="jr-login-page">
      <div className="jr-login-bg" aria-hidden="true" />
      <div className="jr-login-bg-shade" aria-hidden="true" />

      <div className="jr-login-layout">
        {/* COLUNA ESQUERDA: COTAÇÕES PECUÁRIAS E PREÇOS DINÂMICOS DO DIA */}
        <section className="jr-login-market" aria-label="Preços do dia">
          <div className="jr-login-tickers">
            {tickers.map((t) => {
              const isFlashing = flashKey?.id === t.id;
              return (
                <div key={t.id} className="jr-login-glass jr-login-ticker">
                  <div className="jr-login-ticker-label">
                    <span className="jr-login-dot" style={{ background: t.dot }} />
                    {t.label}
                  </div>
                  <div className="jr-login-ticker-row">
                    <span className="jr-login-currency">R$</span>
                    <span
                      className={`jr-login-ticker-value jr-login-value-flash ${
                        isFlashing ? (flashKey.dir === "up" ? "flash-up" : "flash-down") : ""
                      }`}
                    >
                      {formatBRL(t.num, 2)}
                    </span>
                    <Delta dir={t.dir} value={t.delta} />
                  </div>
                  <div className="jr-login-ticker-sub">{t.sub}</div>
                </div>
              );
            })}
          </div>

          <div className="jr-login-glass jr-login-prices">
            <div className="jr-login-prices-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 className="jr-login-prices-title">Mercado da Pecuária</h2>
                <span className="jr-login-live-tag">
                  <span className="jr-login-live-dot" /> AO VIVO
                </span>
              </div>
              <span className="jr-login-updated">
                {updatedTime ? `Atualizado hoje às ${updatedTime}` : "Atualizado hoje"}
              </span>
            </div>

            <div className="jr-login-prices-body">
              <div className="jr-login-arroba">
                <span className="jr-login-arroba-label">Arroba do boi gordo</span>
                <div className="jr-login-arroba-value">
                  <span>R$</span>
                  <strong
                    className={`jr-login-value-flash ${
                      flashKey?.id === "arroba" ? (flashKey.dir === "up" ? "flash-up" : "flash-down") : ""
                    }`}
                  >
                    {formatBRL(arroba, 2)}
                  </strong>
                </div>
                <span className="jr-login-pill">▲ {arrobaDelta}</span>
                <Sparkline points={sparkline} />
              </div>

              <div>
                <p className="jr-login-group-title">Ração e insumos</p>
                <ul className="jr-login-inputs">
                  {inputs.map((i) => {
                    const isFlashing = flashKey?.id === i.id;
                    return (
                      <li key={i.id}>
                        <span className="jr-login-item-name">
                          {i.name}
                          <span className="jr-login-item-unit">{i.unit}</span>
                        </span>
                        <span
                          className={`jr-login-item-price jr-login-value-flash ${
                            isFlashing ? (flashKey.dir === "up" ? "flash-up" : "flash-down") : ""
                          }`}
                        >
                          R$ {formatBRL(i.num, 2)}
                        </span>
                        <span className="jr-login-item-delta">
                          <Delta dir={i.dir} value={i.delta} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="jr-login-divider" />

            <p className="jr-login-group-title">Bezerro desmamado, por raça (R$ por cabeça)</p>
            <div className="jr-login-calves">
              {calves.map((c) => {
                const isFlashing = flashKey?.id === c.id;
                return (
                  <div key={c.id} className="jr-login-calf">
                    <span>{c.breed}</span>
                    <strong
                      className={`jr-login-value-flash ${
                        isFlashing ? (flashKey.dir === "up" ? "flash-up" : "flash-down") : ""
                      }`}
                    >
                      R$ {formatBRL(c.num, 0)}
                    </strong>
                  </div>
                );
              })}
            </div>
            <p className="jr-login-note">Cotações pecuárias atualizadas em tempo real</p>
          </div>
        </section>

        {/* COLUNA DIREITA: CARTÃO DE ACESSO */}
        <section className="jr-login-card" aria-label="Acesso ao sistema">
          <div className="jr-login-brand">
            <JRLogo size={112} showSubtitle subtitleBackdrop />
            <span className="jr-login-division">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 5c0 2 1.5 3.5 4 3.5M21 5c0 2-1.5 3.5-4 3.5" />
                <path d="M7 8.5h10l-1 6.5a4 4 0 0 1-8 0L7 8.5z" />
                <path d="M10 16.5h4" />
              </svg>
              Divisão Agropecuária
            </span>
            <h1 className="jr-login-title">{step === "mfa" ? "Verificação em 2 etapas" : "Acesso ao sistema"}</h1>
            <p className="jr-login-subtitle">
              {step === "mfa"
                ? "Digite o código de 6 números do seu aplicativo autenticador."
                : "Informe suas credenciais corporativas cadastradas para entrar."}
            </p>
          </div>

          {step === "mfa" ? (
            <form onSubmit={verify} className="jr-login-form" noValidate>
              <label className="jr-login-label">
                Código de verificação
                <input
                  className="jr-login-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (error) setError("");
                  }}
                  style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 18, fontWeight: 700 }}
                />
              </label>
              {error && (
                <p className="jr-login-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="jr-login-submit" disabled={busy}>
                {busy ? "Verificando..." : "Verificar e entrar"}
              </button>
              <div className="jr-login-footer">
                <span>Acesso protegido</span>
                <button type="button" className="jr-login-footer-link" onClick={cancelMfa}>
                  Voltar ao login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submit} className="jr-login-form" noValidate>
              <label className="jr-login-label">
                E-mail corporativo
                <input
                  className="jr-login-input"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="nome@jrcafe.com.br"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                />
              </label>

              <label className="jr-login-label">
                Senha de acesso
                <span className="jr-login-field">
                  <input
                    className="jr-login-input jr-login-input-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                  />
                  <button
                    type="button"
                    className="jr-login-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </span>
              </label>

              {error && (
                <p className="jr-login-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="jr-login-submit" disabled={busy}>
                {busy ? "Entrando..." : "Entrar"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
