"use client";
import { useActionState } from "react";
import { createApiKey } from "@/app/settings/api/actions";
import type { KeyState } from "@/lib/apiTypes";

export default function ApiKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createApiKey, null);
  return (
    <form action={action} className="card">
      <strong>Nova chave de API</strong>
      {state?.key && (
        <div className="flash" style={{ marginTop: 12 }}>
          <p><strong>Copie a chave agora: ela não será mostrada de novo.</strong></p>
          <p><code style={{ wordBreak: "break-all" }}>{state.key}</code></p>
        </div>
      )}
      {state?.error && <div className="flash bad" role="alert" style={{ marginTop: 12 }}>{state.error}</div>}
      <div className="form2" style={{ marginTop: 12 }}>
        <label>Nome (ex.: Sistema da balança)<input name="name" required maxLength={80} /></label>
        <label>Validade em dias (0 = sem validade)<input name="days" inputMode="numeric" defaultValue="365" /></label>
        <div className="cfield">
          <span>Escopos</span>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}><input type="checkbox" name="scopes" value="read" defaultChecked /> Leitura (animais e pesagens)</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}><input type="checkbox" name="scopes" value="write_weighings" /> Gravar pesagens</label>
        </div>
        <div style={{ alignSelf: "end" }}><button className="btn" disabled={pending}>{pending ? "Criando..." : "Criar chave"}</button></div>
      </div>
    </form>
  );
}
