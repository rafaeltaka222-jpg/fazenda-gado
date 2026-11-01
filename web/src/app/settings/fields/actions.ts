"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const g = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const intOrNull = (v: string | null) => (v === null ? null : /^\d{1,4}$/.test(v) ? Number(v) : NaN);
const slug = (s: string) => {
  let k = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!/^[a-z]/.test(k)) k = `c_${k}`;
  return k.slice(0, 40);
};
const lines = (v: string | null) => [...new Set((v ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean))];
const roles = (f: FormData, k: string) => {
  const r = f.getAll(k).map(String).filter(Boolean);
  return r.length ? r : null;
};
const errCode = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "dup" : e.message.includes("invalid_options") ? "opcoes" : e.message.includes("invalid_condition") ? "condicao"
  : e.code === "42501" ? "perm" : "falha";

export async function createField(formData: FormData) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/farms");
  const label = g(formData, "label");
  if (!label) redirect("/settings/fields?erro=falha");
  const sexCond = g(formData, "cond_sex");
  const maxLen = intOrNull(g(formData, "max_length"));
  const dec = intOrNull(g(formData, "decimals"));
  const pos = intOrNull(g(formData, "position"));
  if ([maxLen, dec, pos].some((n) => n !== null && Number.isNaN(n))) redirect("/settings/fields?erro=falha");
  const supabase = await createClient();
  const { error } = await supabase.from("field_definitions").insert({
    farm_id: ctx.active.id,
    entity: "animal",
    field_key: g(formData, "field_key") ? slug(g(formData, "field_key")!) : slug(label),
    label,
    description: g(formData, "description"),
    data_type: g(formData, "data_type"),
    required: formData.get("required") === "on",
    default_value: g(formData, "default_value"),
    max_length: maxLen,
    decimals: dec,
    options: lines(g(formData, "options")),
    condition: sexCond ? { field: "sex", op: "eq", value: sexCond } : null,
    position: pos ?? 100,
    in_reports: formData.get("in_reports") === "on",
    filterable: formData.get("filterable") === "on",
    sortable: formData.get("sortable") === "on",
    groupable: formData.get("groupable") === "on",
    visible_to: roles(formData, "visible_to"),
    editable_to: roles(formData, "editable_to"),
  });
  if (error) redirect(`/settings/fields?erro=${errCode(error)}`);
  revalidatePath("/settings/fields");
  redirect("/settings/fields?ok=criado");
}

export async function updateField(formData: FormData) {
  const key = g(formData, "field_key");
  const ctx = await getContext();
  if (!ctx.active || !key) redirect("/settings/fields");
  const sexCond = g(formData, "cond_sex");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_definitions")
    .update({
      label: g(formData, "label"),
      description: g(formData, "description"),
      required: formData.get("required") === "on",
      options: lines(g(formData, "options")),
      condition: sexCond ? { field: "sex", op: "eq", value: sexCond } : null,
      in_reports: formData.get("in_reports") === "on",
      filterable: formData.get("filterable") === "on",
      sortable: formData.get("sortable") === "on",
      groupable: formData.get("groupable") === "on",
      visible_to: roles(formData, "visible_to"),
      editable_to: roles(formData, "editable_to"),
    })
    .eq("farm_id", ctx.active.id)
    .eq("entity", "animal")
    .eq("field_key", key)
    .select("id");
  if (error) redirect(`/settings/fields?erro=${errCode(error)}`);
  if (!data || data.length === 0) redirect("/settings/fields?erro=perm");
  revalidatePath("/settings/fields");
  redirect("/settings/fields?ok=salvo");
}

export async function setFieldStatus(formData: FormData) {
  const key = g(formData, "field_key");
  const status = g(formData, "status");
  const ctx = await getContext();
  if (!ctx.active || !key || !["active", "inactive"].includes(status ?? "")) redirect("/settings/fields");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_definitions")
    .update({ status })
    .eq("farm_id", ctx.active.id)
    .eq("entity", "animal")
    .eq("field_key", key)
    .select("id");
  if (error || !data || data.length === 0) redirect("/settings/fields?erro=perm");
  revalidatePath("/settings/fields");
  redirect("/settings/fields?ok=status");
}
