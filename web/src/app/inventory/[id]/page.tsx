import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<string, string> = {
  desconhecido: "brinco não cadastrado", nao_ativo: "animal não está ativo (vendido, morto...)", outro_local: "animal ativo em outro lote/pasto",
};
const SCOPE: Record<string, string> = { fazenda: "Fazenda toda", lote: "Lote", pasto: "Pasto" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getContext()]);
  if (!UUID.test(id)) notFound();
  const a = ctx.active;
  if (!a) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("inventory_counts").select("*").eq("id", id).eq("farm_id", a.id).maybeSingle();
  if (!c) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "inventory" };
  const link = { color: "var(--green)", fontWeight: 600 } as const;
  const missing: any[] = c.missing ?? [];
  const extra: any[] = c.extra ?? [];

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Contagem de {c.count_date.split("-").reverse().join("/")}</h1>
        <Link href="/inventory" className="btn ghost">Voltar</Link>
      </div>
      <p className="muted">{SCOPE[c.scope]}{c.notes ? ` · ${c.notes}` : ""}</p>
      <div className="grid">
        <div className="card"><small className="muted">Esperado no sistema</small><div className="big">{c.expected_total}</div></div>
        <div className="card"><small className="muted">Contado</small><div className="big">{c.counted_total}</div></div>
        <div className="card"><small className="muted">Faltando</small><div className="big">{c.missing_total}</div></div>
        <div className="card"><small className="muted">Sobrando</small><div className="big">{c.extra_total}</div></div>
      </div>
      <div className="card">
        <strong>Faltando (estão no sistema, não foram encontrados)</strong>
        {missing.length === 0 ? <p className="muted">Nenhum.</p> : missing.map((m) => (
          <div className="row" key={m.animal_id}><Link href={`/herd/${m.animal_id}`} style={link}>{m.ear_tag}</Link></div>
        ))}
        {c.missing_total > missing.length && <p className="muted">Mostrando {missing.length} de {c.missing_total}.</p>}
      </div>
      <div className="card">
        <strong>Sobrando (encontrados, mas não esperados neste local)</strong>
        {extra.length === 0 ? <p className="muted">Nenhum.</p> : extra.map((e) => (
          <div className="row" key={e.tag}>
            <span>{e.animal_id ? <Link href={`/herd/${e.animal_id}`} style={link}>{e.tag}</Link> : e.tag}</span>
            <span className="muted">{STATUS[e.status] ?? e.status}</span>
          </div>
        ))}
        {c.extra_total > extra.length && <p className="muted">Mostrando {extra.length} de {c.extra_total}.</p>}
      </div>
      <p className="muted">A contagem não altera o cadastro. Para corrigir, use a ficha do animal (movimentação, venda, morte ou edição).</p>
    </AppShell>
  );
}
