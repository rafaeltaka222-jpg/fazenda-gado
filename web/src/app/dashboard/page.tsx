import Link from "next/link";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import AgroPecDashboard, { AlertData } from "@/components/AgroPecDashboard";
import DashboardFilterSuite, { FilterableAnimal } from "@/components/DashboardFilterSuite";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string; ok?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "dashboard" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Dashboard</h1>
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: 16, color: "var(--muted)" }}>Você ainda não tem acesso a nenhuma fazenda.</p>
          <Link href="/farms" className="btn" style={{ marginTop: 12 }}>
            Criar a primeira fazenda
          </Link>
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms = a.permissions ?? resolveRolePermissions(a.role);
  const can = (p: string) => perms.includes(p);

  // Dispara todas as consultas em um único Promise.all paralelo (elimina cascata de rede!)
  const [
    sumRes,
    hsRes,
    stRes,
    rpRes,
    trendRes,
    anRes,
    lotRes,
    pastRes,
    catRes,
    weighRes,
  ] = await Promise.all([
    can("animals.view") ? supabase.rpc("dashboard_summary", { p_farm: a.id }) : Promise.resolve({ data: null }),
    can("health.view") ? supabase.rpc("health_alerts", { p_farm: a.id }) : Promise.resolve({ data: null }),
    can("inventory.view") ? supabase.rpc("stock_alerts", { p_farm: a.id }) : Promise.resolve({ data: null }),
    can("reproduction.view") ? supabase.rpc("reproduction_alerts", { p_farm: a.id }) : Promise.resolve({ data: null }),
    can("weighings.view") ? supabase.rpc("weight_trend", { p_farm: a.id, p_months: 6 }) : Promise.resolve({ data: null }),
    can("animals.view")
      ? supabase
          .from("animals")
          .select("id, ear_tag, name, sex, category_id, lot_id, pasture_id, status")
          .eq("farm_id", a.id)
          .order("ear_tag")
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    can("animals.view")
      ? supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name")
      : Promise.resolve({ data: [] as any[] }),
    can("animals.view")
      ? supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name")
      : Promise.resolve({ data: [] as any[] }),
    can("animals.view")
      ? supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name")
      : Promise.resolve({ data: [] as any[] }),
    can("animals.view")
      ? supabase
          .from("weighings")
          .select("animal_id, weight_kg, weighed_at")
          .eq("farm_id", a.id)
          .is("voided_at", null)
          .order("weighed_at", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const sum: any = sumRes.data;
  const hs: any = hsRes.data;
  const st: any = stRes.data;
  const rp: any = rpRes.data;

  const trend = ((trendRes?.data ?? []) as any[]).map((t) => ({
    label: `${t.month.slice(5, 7)}/${t.month.slice(2, 4)}`,
    value: Number(t.avg_weight),
  }));

  const lotsMap = new Map((lotRes.data ?? []).map((l: any) => [l.id, l.name]));
  const pastMap = new Map((pastRes.data ?? []).map((p: any) => [p.id, p.name]));
  const catMap = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));

  const lotNames: string[] = (lotRes.data ?? []).map((l: any) => l.name);
  const pastureNames: string[] = (pastRes.data ?? []).map((p: any) => p.name);
  const categoryNames: string[] = (catRes.data ?? []).map((c: any) => c.name);

  // Calcula último peso e GMD em memória a partir de weighRes (sem precisar de um 2º round-trip RPC)
  const wByAnimal = new Map<string, { last: number; lastAt: number; prev?: number; prevAt?: number }>();
  for (const w of (weighRes.data ?? []) as any[]) {
    const aid = w.animal_id;
    if (!aid) continue;
    const cur = wByAnimal.get(aid);
    const ts = new Date(w.weighed_at).getTime();
    if (!cur) {
      wByAnimal.set(aid, { last: Number(w.weight_kg), lastAt: ts });
    } else if (cur.prev === undefined) {
      cur.prev = Number(w.weight_kg);
      cur.prevAt = ts;
    }
  }

  const allAnimals = (anRes.data ?? []) as any[];
  const filterAnimals: FilterableAnimal[] = allAnimals.map((an: any) => {
    const w = wByAnimal.get(an.id);
    let gmd: number | null = null;
    if (w && w.prev !== undefined && w.prevAt !== undefined) {
      const days = (w.lastAt - w.prevAt) / 86400000;
      if (days > 0) gmd = (w.last - w.prev) / days;
    }
    return {
      id: an.id,
      ear_tag: an.ear_tag,
      name: an.name,
      sex: an.sex,
      category: (an.category_id ? catMap.get(an.category_id) : null) || "Sem categoria",
      lot_name: an.lot_id ? lotsMap.get(an.lot_id) ?? null : null,
      pasture_name: an.pasture_id ? pastMap.get(an.pasture_id) ?? null : null,
      current_weight: w ? w.last : null,
      avg_gmd: gmd,
      status: an.status || "ativo",
    };
  });

  const byCat: { name: string; count: number }[] = sum?.by_category ?? [];
  const byLot: { name: string; count: number; avg_weight?: number | null }[] = sum?.by_lot ?? [];
  const byPasture: { name: string; count: number }[] = sum?.by_pasture ?? [];

  const nowStr = new Date()
    .toLocaleString("pt-BR", {
      timeZone: "America/Bahia",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(", ", " • ");

  const overdueVaccines = Number(hs?.overdue_count ?? hs?.overdue ?? 0);
  const withdrawalAnimals = Number(hs?.withdrawal_count ?? hs?.in_withdrawal ?? 0);
  const lowStockCount = Array.isArray(st?.below_minimum) ? st.below_minimum.length : Number(st?.low_count ?? 0);
  const reproPending = Number(rp?.pending_diagnosis ?? rp?.calving_30d ?? 0);

  const alerts: AlertData[] = [
    {
      id: "health",
      title: "Vacinação - Brucelose & Calendário Sanitário",
      subtitle:
        overdueVaccines > 0
          ? `${overdueVaccines} dose(s) pendente(s) · ${withdrawalAnimals} em carência`
          : withdrawalAnimals > 0
          ? `${withdrawalAnimals} animal(is) em carência sanitária`
          : "Todas as vacinações do rebanho em dia",
      badgeText: overdueVaccines > 0 ? "Urgente" : "Em Dia",
      severity: overdueVaccines > 0 ? "urgent" : "info",
      rightTop: overdueVaccines > 0 ? `${overdueVaccines} pendente(s)` : "Protocolo em dia",
      rightBottom: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }),
      href: "/health",
    },
    {
      id: "stock",
      title: "Estoque - Ração & Suplementação",
      subtitle:
        lowStockCount > 0
          ? `${lowStockCount} insumo(s) abaixo do estoque mínimo`
          : "Nenhum insumo crítico ou abaixo do mínimo",
      badgeText: lowStockCount > 0 ? "Atenção" : "Regular",
      severity: lowStockCount > 0 ? "warning" : "info",
      rightTop: lowStockCount > 0 ? "Abaixo do mínimo" : "Estoque regular",
      rightBottom: lowStockCount > 0 ? `${lowStockCount} item(ns) crítico(s)` : "Reposição controlada",
      href: "/stock",
    },
    {
      id: "repro",
      title: "Reprodução (IATF) & Manejo",
      subtitle:
        reproPending > 0
          ? `${reproPending} fêmea(s) aguardando diagnóstico / parto`
          : "Curral preparado para leitura Coimma / Tru-Test",
      badgeText: reproPending > 0 ? "Atenção" : "Programado",
      severity: reproPending > 0 ? "warning" : "info",
      rightTop: reproPending > 0 ? `${reproPending} fêmea(s)` : "Manejo de Curral",
      rightBottom: "Unidade " + a.code,
      href: "/reproduction",
    },
  ];

  const totalActive = Number(sum?.active ?? allAnimals.length);
  const malesCount = Number(sum?.males ?? allAnimals.filter((x) => x.sex === "M").length);
  const femalesCount = Number(sum?.females ?? allAnimals.filter((x) => x.sex === "F").length);
  const weightsList = filterAnimals.map((x) => x.current_weight).filter((v): v is number => v != null && v > 0);
  const avgWeightVal =
    sum?.avg_weight != null
      ? Number(sum.avg_weight)
      : weightsList.length > 0
      ? weightsList.reduce((acc, v) => acc + v, 0) / weightsList.length
      : 0;
  const gmdList = filterAnimals.map((x) => x.avg_gmd).filter((v): v is number => v != null && v > 0);
  const avgGmdVal =
    gmdList.length > 0
      ? gmdList.reduce((acc, v) => acc + v, 0) / gmdList.length
      : Number(sum?.avg_gmd ?? 0);

  return (
    <AppShell {...shell}>
      <div
        className="head"
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 4, height: 32, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 800, margin: 0, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Dashboard — {a.name.toLowerCase() === "jr faz" ? "JR Faz" : a.name}
            </h1>
            <p style={{ margin: "4px 0 0 0", fontSize: 13.5, color: "var(--muted)" }}>
              Visão geral do rebanho e indicadores da unidade ({a.code} - {a.name.toLowerCase() === "jr faz" ? "JR Faz" : a.name})
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link
            href="/weighings"
            prefetch={true}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 18px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink)",
              textDecoration: "none",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
            <span>Módulo de Pesagem</span>
          </Link>
          <Link
            href="/reports"
            prefetch={true}
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "10px 20px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 10,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span>Gerador de Relatórios</span>
          </Link>
        </div>
      </div>

      {sp.erro === "sem_permissao" && (
        <div
          role="alert"
          style={{
            marginBottom: 20,
            padding: "14px 18px",
            borderRadius: 12,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Acesso restrito: seu perfil de acesso atual não possui permissão para acessar a funcionalidade solicitada.</span>
        </div>
      )}

      <AgroPecDashboard
        key={a.id}
        totalActive={totalActive}
        males={malesCount}
        females={femalesCount}
        avgWeight={avgWeightVal}
        avgGmd={avgGmdVal}
        byCategory={byCat}
        byLot={byLot}
        byPasture={byPasture}
        weightTrend={trend}
        alerts={alerts}
        updatedAtLabel={nowStr}
      />

      <div style={{ marginTop: 18 }}>
        <DashboardFilterSuite
          key={`filter-${a.id}`}
          animals={filterAnimals}
          lots={lotNames}
          pastures={pastureNames}
          categories={categoryNames}
        />
      </div>

      <footer
        style={{
          marginTop: 24,
          paddingTop: 14,
          borderTop: "1px solid var(--line)",
          textAlign: "center",
          fontSize: 12.5,
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <span>© {new Date().getFullYear()} JR Comércio e Exportação de Café — Sistema de Gestão para Fazendas</span>
      </footer>
    </AppShell>
  );
}
