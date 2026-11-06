"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const g = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const int = (v: string | null) => (v === null ? null : /^\d{1,2}$/.test(v) ? Number(v) : NaN);

export async function createLayout(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const rawBack = String(formData.get("back") ?? "/import");
  const back = rawBack.startsWith("/weighings") ? "/weighings" : "/import";
  const colAnimal = int(g(formData, "col_animal"));
  const colDate = int(g(formData, "col_date"));
  const colTime = int(g(formData, "col_time"));
  const colWeight = int(g(formData, "col_weight"));
  const cols = [colAnimal, colDate, colTime, colWeight].filter((c) => c !== null) as number[];
  if (
    [colAnimal, colDate, colWeight].some((c) => c === null || Number.isNaN(c) || (c as number) < 1) ||
    Number.isNaN(colTime) ||
    new Set(cols).size !== cols.length
  ) {
    redirect(`${back}?erro=layoutinvalido`);
  }
  const supabase = await createClient();
  const rawName = g(formData, "name") ?? `Layout Curral ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const layoutData = {
    delimiter: g(formData, "delimiter"),
    has_header: formData.get("has_header") === "on",
    date_format: g(formData, "date_format"),
    decimal_separator: g(formData, "decimal_separator"),
    col_animal: colAnimal,
    col_date: colDate,
    col_time: colTime,
    col_weight: colWeight,
    default_time: g(formData, "default_time") ?? "12:00",
    device_name: g(formData, "device_name") ?? "",
  };
  // O índice único é (farm_id, lower(name)): se o nome já existir, atualiza o layout existente em vez de falhar.
  const { data: existing } = await supabase
    .from("import_layouts")
    .select("id, name")
    .eq("farm_id", ctx.active.id);
  const match = (existing ?? []).find((r: any) => String(r.name).toLowerCase() === rawName.toLowerCase());
  const { error } = match
    ? await supabase.from("import_layouts").update(layoutData).eq("id", match.id)
    : await supabase.from("import_layouts").insert({ farm_id: ctx.active.id, name: rawName, ...layoutData });
  if (error) redirect(`${back}?erro=layoutinvalido`);
  revalidatePath("/import");
  revalidatePath("/weighings");
  redirect(`${back}?ok=layout`);
}

export async function createScalePresets(formData?: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const rawBack = formData ? String(formData.get("back") ?? "/import") : "/import";
  const back = rawBack.startsWith("/weighings") ? "/weighings" : "/import";
  const supabase = await createClient();
  const farmId = ctx.active.id;

  const presets: Array<{
    farm_id: string;
    name: string;
    delimiter: string;
    has_header: boolean;
    date_format: string;
    decimal_separator: string;
    col_animal: number;
    col_date: number;
    col_time: number | null;
    col_weight: number;
    default_time: string;
    device_name: string;
  }> = [
    {
      farm_id: farmId,
      name: "Balança Coimma KM-3 Plus (CSV)",
      delimiter: "ponto_e_virgula",
      has_header: true,
      date_format: "DD/MM/YYYY",
      decimal_separator: ",",
      col_animal: 1,
      col_date: 2,
      col_time: 3,
      col_weight: 4,
      default_time: "08:00",
      device_name: "Coimma KM-3 Plus",
    },
    {
      farm_id: farmId,
      name: "Tru-Test XR5000 / S3 (CSV)",
      delimiter: "virgula",
      has_header: true,
      date_format: "DD/MM/YYYY",
      decimal_separator: ".",
      col_animal: 1,
      col_date: 2,
      col_time: 3,
      col_weight: 4,
      default_time: "08:00",
      device_name: "Tru-Test XR5000",
    },
    {
      farm_id: farmId,
      name: "IdBeck 3.0 Curral (TXT)",
      delimiter: "tab",
      has_header: false,
      date_format: "YYYY-MM-DD",
      decimal_separator: ".",
      col_animal: 1,
      col_date: 2,
      col_time: null,
      col_weight: 3,
      default_time: "12:00",
      device_name: "IdBeck 3.0",
    },
  ];

  const { data: existing } = await supabase
    .from("import_layouts")
    .select("name")
    .eq("farm_id", farmId);
  const existingNames = new Set((existing ?? []).map((r) => String(r.name).toLowerCase()));

  for (const p of presets) {
    if (!existingNames.has(p.name.toLowerCase())) {
      await supabase.from("import_layouts").insert(p);
    }
  }

  revalidatePath("/import");
  revalidatePath("/weighings");
  redirect(`${back}?ok=presets`);
}

export async function confirmImport(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const batch = String(formData.get("batch") ?? "");
  if (!UUID.test(batch)) redirect("/import");

  const map = new Map<string, { row_id: string; ignore?: boolean; ear_tag?: string; weight_kg?: number | null }>();
  for (const [key, val] of formData.entries()) {
    const m = /^(ign|ear|w)_([0-9a-f-]{36})$/i.exec(key);
    if (!m || !UUID.test(m[2])) continue;
    const o = map.get(m[2]) ?? { row_id: m[2] };
    if (m[1] === "ign") o.ignore = true;
    else if (m[1] === "ear") o.ear_tag = String(val).trim();
    else {
      const n = Number(String(val).trim().replace(",", "."));
      o.weight_kg = String(val).trim() === "" || !Number.isFinite(n) ? null : n;
    }
    map.set(m[2], o);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("commit_import", { p_batch: batch, p_overrides: [...map.values()] });
  if (error) {
    const code = error.code === "42501" ? "perm" : error.message.includes("rows_pending") ? "pendente" : "falha";
    redirect(`/import/${batch}?erro=${code}`);
  }
  revalidatePath("/herd");
  revalidatePath("/weighings");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/import");
  redirect(`/import/${batch}?ok=1`);
}

export async function cancelImport(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const batch = String(formData.get("batch") ?? "");
  if (!UUID.test(batch)) redirect("/import");
  const supabase = await createClient();
  await supabase.rpc("cancel_import", { p_batch: batch });
  revalidatePath("/import");
  redirect("/import");
}
