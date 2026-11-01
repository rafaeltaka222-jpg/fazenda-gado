import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { OP_LABEL, TABLE_LABEL, details, recordLabel, type AuditEntry } from "@/lib/audit";
import { verifyChain } from "./actions";

export const instant = false;

const PAGE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type SP = { tabela?: string; op?: string; de?: string; ate?: string; p?: string; chain?: string; linha?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "audit" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Auditoria</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const tabela = sp.tabela && sp.tabela in TABLE_LABEL ? sp.tabela : "";
  const op = sp.op && sp.op in OP_LABEL ? sp.op : "";
  const de = sp.de && DATE.test(sp.de) ? sp.de : "";
  const ate = sp.ate && DATE.test(sp.ate) ? sp.ate : "";
  const page = Math.max(1, parseInt(sp.p ?? "1", 10) || 1);

  const supabase = await createClient();
  const res = await supabase.rpc("audit_entries", {
    p_farm: a.id,
    p_table: tabela || null,
    p_op: op || null,
    p_from: de || null,
    p_to: ate || null,
    p_limit: PAGE,
    p_offset: (page - 1) * PAGE,
  });

  if (res.error?.code === "42501") {
    return (
      <AppShell {...shell}>
        <h1 className="title">Auditoria</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para consultar a auditoria.</p></div>
      </AppShell>
    );
  }

  const rows = (res.data ?? []) as (AuditEntry & { total: number })[];
  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (tabela) u.set("tabela", tabela);
    if (op) u.set("op", op);
    if (de) u.set("de", de);
    if (ate) u.set("ate", ate);
    if (p > 1) u.set("p", String(p));
    const s = u.toString();
    return `/audit${s ? `?${s}` : ""}`;
  };
  const fmt = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "medium" });

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Auditoria</h1>
        <form action={verifyChain}>
          <button className="btn ghost">Verificar integridade do registro</button>
        </form>
      </div>
      {sp.chain === "ok" && <div className="flash">Registro íntegro: nenhuma adulteração foi detectada na cadeia de auditoria desta fazenda.</div>}
      {sp.chain === "quebra" && (
        <div className="flash bad" role="alert">Atenção: a cadeia de auditoria está quebrada a partir do registro {sp.linha}. Isso indica alteração indevida.</div>
      )}
      {sp.chain === "erro" && <div className="flash bad" role="alert">Não foi possível verificar a integridade agora.</div>}

      <form className="card filters" method="get">
        <label>Tipo de registro
          <select name="tabela" defaultValue={tabela}>
            <option value="">Todos</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Operação
          <select name="op" defaultValue={op}>
            <option value="">Todas</option>
            {Object.entries(OP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>De<input type="date" name="de" defaultValue={de} /></label>
        <label>Até<input type="date" name="ate" defaultValue={ate} /></label>
        <button className="btn">Filtrar</button>
        <Link href="/audit" className="btn ghost">Limpar</Link>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted">Nenhum registro encontrado.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(e.occurred_at)}</td>
                  <td>{e.user_email ?? "sistema"}</td>
                  <td>{OP_LABEL[e.operation] ?? e.operation} {TABLE_LABEL[e.table_name] ?? e.table_name} <strong>{recordLabel(e)}</strong></td>
                  <td>{details(e).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pager" style={{ marginTop: 12 }}>
          <span className="muted">{total} registro(s) · página {page} de {pages}</span>
          {page > 1 && <Link href={qs(page - 1)} className="btn ghost">Anterior</Link>}
          {page < pages && <Link href={qs(page + 1)} className="btn ghost">Próxima</Link>}
        </div>
      </div>
      <p className="muted">O registro é somente-inserção e encadeado por hash: qualquer alteração indevida é detectada pela verificação acima.</p>
    </AppShell>
  );
}
