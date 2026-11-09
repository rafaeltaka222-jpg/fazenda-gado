import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import ReportsGeneratorStudio, {
  ReportAnimalRow,
  ReportMovementRow,
  ReportWeighingRow,
} from "@/components/ReportsGeneratorStudio";
import { STANDARD, defUrl } from "@/lib/reports";
import { deleteReport } from "./actions";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, getContext()]);
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "reports" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Gerador de Relatórios e Tabelas Personalizadas</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms = a.permissions ?? resolveRolePermissions(a.role);
  const canView = perms.includes("reports.view");
  const canBuild = perms.includes("reports.builder");

  if (!canView) {
    redirect("/dashboard?erro=sem_permissao");
  }

  const [savedRes, animalsRes, weighingsRes, movementsRes, catsRes, breedsRes, lotsRes, pasturesRes] =
    await Promise.all([
      supabase
        .from("saved_reports")
        .select("id, name, shared, created_by")
        .eq("farm_id", a.id)
        .not("name", "like", "__fin_%")
        .order("name"),
      supabase
        .from("animals")
        .select(
          "id, ear_tag, name, sex, status, birth_date, entry_date, category_id, breed_id, lot_id, pasture_id, dam_id"
        )
        .eq("farm_id", a.id)
        .is("deleted_at", null)
        .order("ear_tag")
        .limit(400),
      supabase
        .from("weighings")
        .select("id, animal_id, weighed_at, weight_kg, notes")
        .eq("farm_id", a.id)
        .is("voided_at", null)
        .order("weighed_at", { ascending: false })
        .limit(350),
      supabase
        .from("animal_events")
        .select("id, animal_id, event_type, event_date, details")
        .eq("farm_id", a.id)
        .order("event_date", { ascending: false })
        .limit(250),
      supabase.from("categories").select("id, name").eq("farm_id", a.id).order("name"),
      supabase.from("breeds").select("id, name").eq("farm_id", a.id).order("name"),
      supabase.from("lots").select("id, name").eq("farm_id", a.id).order("name"),
      supabase.from("pastures").select("id, name").eq("farm_id", a.id).order("name"),
    ]);

  const saved = savedRes.data ?? [];
  const rawAnimals = (animalsRes.data as any[]) ?? [];
  const rawWeighings = (weighingsRes.data as any[]) ?? [];
  const rawMovements = (movementsRes.data as any[]) ?? [];
  const catMap = new Map<string, string>(((catsRes.data as any[]) ?? []).map((c) => [c.id, String(c.name)]));
  const breedMap = new Map<string, string>(((breedsRes.data as any[]) ?? []).map((b) => [b.id, String(b.name)]));
  const lotMap = new Map<string, string>(((lotsRes.data as any[]) ?? []).map((l) => [l.id, String(l.name)]));
  const pastureMap = new Map<string, string>(((pasturesRes.data as any[]) ?? []).map((p) => [p.id, String(p.name)]));
  const animalById = new Map<string, any>(rawAnimals.map((an) => [an.id, an]));

  // Build latest weight map per animal_id and group weighings chronologically per animal
  const latestWeightByAnimalId = new Map<string, number>();
  const weighingsByAnimal = new Map<string, any[]>();
  for (const w of rawWeighings) {
    if (!w.animal_id) continue;
    if (!latestWeightByAnimalId.has(w.animal_id)) {
      latestWeightByAnimalId.set(w.animal_id, Number(w.weight_kg));
    }
    const arr = weighingsByAnimal.get(w.animal_id) ?? [];
    arr.push(w);
    weighingsByAnimal.set(w.animal_id, arr);
  }

  const animalRows: ReportAnimalRow[] = rawAnimals.map((r) => ({
    id: r.id,
    tag: r.ear_tag,
    name: r.name,
    category: (r.category_id && catMap.get(r.category_id)) || "Sem categoria",
    breed: (r.breed_id && breedMap.get(r.breed_id)) || "Sem raça",
    sex: r.sex === "M" ? "M" : "F",
    birth_date: r.birth_date,
    entry_date: r.entry_date,
    weight_kg: latestWeightByAnimalId.get(r.id) ?? null,
    status: r.status ?? "ativo",
    lot: (r.lot_id && lotMap.get(r.lot_id)) || "Sem lote",
    pasture: (r.pasture_id && pastureMap.get(r.pasture_id)) || "Sem pasto",
    mother_tag: (r.dam_id && animalById.get(r.dam_id)?.ear_tag) || null,
  }));

  const weighingRows: ReportWeighingRow[] = rawWeighings.map((w) => {
    const an = animalById.get(w.animal_id);
    const list = weighingsByAnimal.get(w.animal_id) ?? [];
    const idx = list.findIndex((item) => item.id === w.id);
    const prev = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
    const curWeight = Number(w.weight_kg ?? 0);
    const deltaKg = prev ? Number((curWeight - Number(prev.weight_kg)).toFixed(2)) : null;
    const days =
      prev && w.weighed_at && prev.weighed_at
        ? Math.max(1, (new Date(w.weighed_at).getTime() - new Date(prev.weighed_at).getTime()) / 86400000)
        : null;
    const gmdVal = deltaKg !== null && days !== null ? Number((deltaKg / days).toFixed(2)) : null;

    return {
      id: w.id,
      tag: an?.ear_tag ?? "—",
      weighed_on: w.weighed_at ? String(w.weighed_at).slice(0, 10) : "",
      weight_kg: curWeight,
      delta_kg: deltaKg,
      gmd: gmdVal,
      category: (an?.category_id && catMap.get(an.category_id)) || "Sem categoria",
      lot: (an?.lot_id && lotMap.get(an.lot_id)) || "Sem lote",
      status: an?.status ?? "ativo",
    };
  });

  const movementRows: ReportMovementRow[] = rawMovements.map((m) => {
    const an = animalById.get(m.animal_id);
    const d = m.details ?? {};
    const fromParts: string[] = [];
    const toParts: string[] = [];
    if (d.from_lot_id && lotMap.get(d.from_lot_id)) fromParts.push(`Lote ${lotMap.get(d.from_lot_id)}`);
    if (d.from_pasture_id && pastureMap.get(d.from_pasture_id)) fromParts.push(`Pasto ${pastureMap.get(d.from_pasture_id)}`);
    if (d.to_lot_id && lotMap.get(d.to_lot_id)) toParts.push(`Lote ${lotMap.get(d.to_lot_id)}`);
    if (d.to_pasture_id && pastureMap.get(d.to_pasture_id)) toParts.push(`Pasto ${pastureMap.get(d.to_pasture_id)}`);

    return {
      id: m.id,
      tag: an?.ear_tag ?? "—",
      occurred_on: m.event_date ? String(m.event_date).slice(0, 10) : "",
      event_type: m.event_type ?? "Transferência",
      origin: fromParts.join(" / ") || d.from || "—",
      destination: toParts.join(" / ") || d.to || "—",
      notes: d.notes || d.reason || "—",
      status: an?.status ?? "ativo",
    };
  });

  const distinctCategories =
    catMap.size > 0
      ? Array.from(catMap.values())
      : Array.from(new Set(animalRows.map((x) => x.category)));

  return (
    <AppShell {...shell}>
      {sp.ok === "salva" && (
        <div className="flash">Consulta salva com sucesso em Consultas Salvas.</div>
      )}
      {sp.ok === "excluida" && <div className="flash">Consulta excluída com sucesso.</div>}
      {sp.erro && (
        <div className="flash bad" role="alert">
          Não foi possível salvar. Informe um nome único e confira sua permissão.
        </div>
      )}

      {/* Main 3-Column Interactive Studio matching Image 5 */}
      <ReportsGeneratorStudio
        key={a.id}
        farmName={a.name}
        animals={animalRows}
        weighings={weighingRows}
        movements={movementRows}
        savedQueries={saved as any}
        categories={distinctCategories}
        canBuild={canBuild}
      />

      {/* Relatórios Homologados e Consultas Salvas (Server Actions) */}
      <div className="card" style={{ marginTop: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <strong>Relatórios Corporativos Homologados (Execução Direta no Servidor)</strong>
          <span className="badge">{a.name}</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Relatório Corporativo</th>
                <th>Escopo e Critérios</th>
                <th style={{ textAlign: "right" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={defUrl(r.def)}
                      style={{ color: "var(--brand)", fontWeight: 700 }}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="muted">{r.desc}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link
                      href={defUrl(r.def)}
                      className="btn ghost"
                      style={{ padding: "6px 12px", fontSize: 12.5 }}
                    >
                      Abrir & Exportar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {saved.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <strong style={{ display: "block", marginBottom: 10 }}>
              Gerenciar Minhas Consultas Salvas ({saved.length})
            </strong>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {saved.map((s: any) => (
                <div
                  key={s.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--bg-elevated)",
                  }}
                >
                  <Link
                    href={`/reports/run?saved=${s.id}`}
                    style={{ fontWeight: 700, fontSize: 13, color: "var(--brand)" }}
                  >
                    {s.name}
                  </Link>
                  {s.created_by === ctx.user.id && (
                    <form action={deleteReport} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit
                        className="btn ghost"
                        label="Excluir"
                        message="Excluir esta consulta salva?"
                      />
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
