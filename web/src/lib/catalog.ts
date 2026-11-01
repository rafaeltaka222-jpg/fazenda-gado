import type { Field } from "./reports";

export type Def = {
  field_key: string;
  label: string;
  description: string | null;
  data_type: string;
  required: boolean;
  default_value: string | null;
  options: string[];
  condition: { field: string; op: string; value: string } | null;
  editable_to: string[] | null;
  visible_to: string[] | null;
  status: string;
};

const TYPE: Record<string, Field["type"]> = { integer: "number", decimal: "number", money: "number", percent: "number", date: "date" };
const seeIt = (d: { visible_to: string[] | null }, role: string) => !d.visible_to || role === "administrador" || d.visible_to.includes(role);

// Campos personalizados visíveis para o perfil (o banco também filtra os valores)
export async function loadAnimalDefs(supabase: any, farmId: string, role: string, includeInactive = false): Promise<Def[]> {
  let q = supabase
    .from("field_definitions")
    .select("field_key, label, description, data_type, required, default_value, options, condition, editable_to, visible_to, status")
    .eq("farm_id", farmId)
    .eq("entity", "animal")
    .order("position")
    .order("label");
  if (!includeInactive) q = q.eq("status", "active");
  const { data } = await q;
  return ((data ?? []) as any[])
    .filter((d) => seeIt(d, role))
    .map((d) => ({ ...d, options: Array.isArray(d.options) ? d.options : [] }));
}

// Campos personalizados disponíveis nos relatórios (chave "cf:<chave>")
export async function loadCustomCatalog(supabase: any, farmId: string, role: string) {
  const { data } = await supabase
    .from("field_definitions")
    .select("field_key, label, data_type, options, visible_to")
    .eq("farm_id", farmId)
    .eq("entity", "animal")
    .eq("in_reports", true)
    .order("position");
  const rows = ((data ?? []) as any[]).filter((d) => seeIt(d, role));
  const fields: Field[] = rows.map((d) => ({ key: `cf:${d.field_key}`, label: d.label, type: TYPE[d.data_type] ?? "text" }));
  const options: Record<string, string[]> = {};
  for (const d of rows) {
    if (d.data_type === "list" || d.data_type === "multilist") options[`cf:${d.field_key}`] = d.options ?? [];
    if (d.data_type === "boolean") options[`cf:${d.field_key}`] = ["true", "false"];
  }
  return { fields, options };
}
