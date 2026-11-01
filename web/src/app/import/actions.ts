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
    redirect("/import?erro=layoutinvalido");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("import_layouts").insert({
    farm_id: ctx.active.id,
    name: g(formData, "name"),
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
  });
  if (error) redirect("/import?erro=layoutinvalido");
  revalidatePath("/import");
  redirect("/import?ok=layout");
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
  revalidatePath("/import");
  redirect(`/import/${batch}?ok=1`);
}

export async function cancelImport(formData: FormData) {
  const batch = String(formData.get("batch") ?? "");
  if (!UUID.test(batch)) redirect("/import");
  const supabase = await createClient();
  await supabase.rpc("cancel_import", { p_batch: batch });
  revalidatePath("/import");
  redirect("/import");
}
