import Link from "next/link";
import { connection } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const instant = false;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "search" };
  let res: any = null;
  if (a && q.length >= 2) {
    const supabase = await createClient();
    res = (await supabase.rpc("global_search", { p_farm: a.id, p_q: q })).data;
  }
  const link = { color: "var(--green)", fontWeight: 600 } as const;
  const sections: [string, any[], (r: any) => React.ReactNode][] = [
    ["Animais", res?.animals ?? [], (r) => <Link style={link} href={`/herd/${r.id}`}>{r.ear_tag}</Link>],
    ["Lotes", res?.lots ?? [], (r) => <Link style={link} href={`/herd?lote=${r.id}`}>{r.name}</Link>],
    ["Pastos", res?.pastures ?? [], (r) => <Link style={link} href="/structure">{r.name}</Link>],
    ["Pessoas", res?.people ?? [], (r) => <Link style={link} href="/people">{r.name}</Link>],
  ];
  const total = sections.reduce((n, s) => n + s[1].length, 0);

  return (
    <AppShell {...shell}>
      <h1 className="title">Busca</h1>
      {q.length < 2 ? (
        <div className="card"><p className="muted">Digite pelo menos 2 caracteres na caixa de busca do topo.</p></div>
      ) : total === 0 ? (
        <div className="card"><p className="muted">Nada encontrado para "{q}" (você só vê o que seu perfil permite).</p></div>
      ) : (
        sections.filter((s) => s[1].length > 0).map(([title, rows, render]) => (
          <div className="card" key={title}>
            <strong>{title}</strong>
            {rows.map((r) => (
              <div className="row" key={r.id}>
                <span>{render(r)}{r.name && title === "Animais" ? <span className="muted"> · {r.name}</span> : null}</span>
                {r.status ? <span className="badge">{r.status}</span> : null}
              </div>
            ))}
          </div>
        ))
      )}
    </AppShell>
  );
}
