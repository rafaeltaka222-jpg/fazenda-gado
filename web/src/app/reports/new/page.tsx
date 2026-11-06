import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ReportBuilder from "@/components/ReportBuilder";
import { parseDef, type Field } from "@/lib/reports";
import { loadCustomCatalog } from "@/lib/catalog";


export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ def?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  if (!a) notFound();
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reports" };

  const supabase = await createClient();
  const perms = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("reports.builder")) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Nova consulta</h1>
        <div className="card"><p className="muted">Seu perfil não tem permissão para montar consultas.</p></div>
      </AppShell>
    );
  }

  const [cat, breeds, cats, lots, pastures] = await Promise.all([
    supabase.from("report_fields").select("key, label, type").eq("source", "animals").order("position"),
    supabase.from("breeds").select("name").eq("farm_id", a.id).order("name"),
    supabase.from("categories").select("name").eq("farm_id", a.id).order("name"),
    supabase.from("lots").select("name").eq("farm_id", a.id).order("name"),
    supabase.from("pastures").select("name").eq("farm_id", a.id).order("name"),
  ]);
  const names = (r: { data: any[] | null }) => (r.data ?? []).map((x) => x.name as string);
  const options: Record<string, string[]> = {
    sex: ["Macho", "Fêmea"],
    status: ["ativo", "vendido", "morto", "transferido"],
    breed: names(breeds),
    category: names(cats),
    lot: names(lots),
    pasture: names(pastures),
  };

  const custom = await loadCustomCatalog(supabase, a.id, a.role);
  Object.assign(options, custom.options);

  return (
    <AppShell {...shell}>
      <div className="head">
        <h1 className="title">Nova consulta</h1>
        <Link href="/reports" className="btn ghost">Voltar</Link>
      </div>
      <ReportBuilder fields={[...((cat.data ?? []) as Field[]), ...custom.fields]} options={options} initial={parseDef(sp.def)} />
    </AppShell>
  );
}
