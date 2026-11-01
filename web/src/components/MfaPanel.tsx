"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; status: string };

export default function MfaPanel({ mandatory }: { mandatory: boolean }) {
  const supabase = createClient();
  const [verified, setVerified] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setVerified((data?.totp ?? []) as Factor[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (isMounted) {
        setVerified((data?.totp ?? []) as Factor[]);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  async function start() {
    setMsg("");
    setOk("");
    // remove tentativas anteriores não concluídas
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all?.all ?? []) as any[]) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `App ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) return setMsg("Não foi possível iniciar a ativação. Tente de novo.");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm() {
    if (!enroll) return;
    setMsg("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) return setMsg("Código inválido. Confira o código atual do aplicativo e tente de novo.");
    setEnroll(null);
    setCode("");
    setOk("Autenticação em dois fatores ativada.");
    load();
  }

  async function disable(id: string) {
    if (!window.confirm("Desativar a autenticação em dois fatores? A sua conta ficará menos protegida.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return setMsg("Não foi possível desativar. Saia e entre de novo com o código do aplicativo e tente outra vez.");
    setOk("Autenticação em dois fatores desativada.");
    load();
  }

  if (loading) return <p className="muted">Carregando...</p>;
  return (
    <div className="card">
      <strong>Autenticação em dois fatores (2FA)</strong>
      {mandatory && verified.length === 0 && (
        <p className="error" role="alert">Seu perfil de administrador exige o 2FA. Ative abaixo para continuar usando o sistema.</p>
      )}
      {ok && <div className="flash" style={{ marginTop: 12 }}>{ok}</div>}
      {msg && <div className="flash bad" role="alert" style={{ marginTop: 12 }}>{msg}</div>}

      {verified.length > 0 && !enroll ? (
        <div style={{ marginTop: 12 }}>
          <p>2FA ativo nesta conta. No login será pedido o código de 6 dígitos do aplicativo autenticador.</p>
          <button className="btn ghost" onClick={() => disable(verified[0].id)}>Desativar 2FA</button>
        </div>
      ) : enroll ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12, maxWidth: 360 }}>
          <p>1. Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy...) e leia o QR code.</p>
          <img src={enroll.qr} alt="QR code para o aplicativo autenticador" width={200} height={200} />
          <p className="muted">Sem câmera? Digite esta chave no aplicativo: <code>{enroll.secret}</code></p>
          <p>2. Digite o código de 6 dígitos que o aplicativo mostrar.</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" aria-label="Código de 6 dígitos" />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={confirm}>Confirmar e ativar</button>
            <button className="btn ghost" onClick={() => setEnroll(null)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p className="muted">Protege a sua conta mesmo que alguém descubra a senha. Você vai precisar de um aplicativo autenticador no celular.</p>
          <button className="btn" onClick={start}>Ativar 2FA</button>
        </div>
      )}
      <p className="muted" style={{ marginTop: 12 }}>TODO: códigos de recuperação. Guarde bem o acesso ao aplicativo autenticador.</p>
    </div>
  );
}
