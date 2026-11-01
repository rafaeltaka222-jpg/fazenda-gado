export const TABLE_LABEL: Record<string, string> = {
  animals: "Animal",
  lots: "Lote",
  pastures: "Pasto",
  weighings: "Pesagem",
  animal_events: "Evento do animal",
  memberships: "Acesso de usuário",
  farms: "Fazenda",
  organizations: "Organização",
  import_batches: "Importação",
  import_layouts: "Layout de importação",
  saved_reports: "Consulta salva",
  roles: "Perfil",
  role_permissions: "Permissão do perfil",
  field_permissions: "Permissão de campo",
};
export const OP_LABEL: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };

const FIELD_LABEL: Record<string, string> = {
  ear_tag: "Brinco", name: "Nome", sex: "Sexo", birth_date: "Nascimento", origin: "Origem", status: "Situação",
  entry_date: "Entrada", exit_date: "Saída", notes: "Observações", weight_kg: "Peso (kg)", code: "Código",
  area_ha: "Área (ha)", capacity_heads: "Capacidade", city: "Município", state: "UF", legal_name: "Razão social",
  tax_id: "CNPJ/CPF", address: "Endereço", voided_at: "Anulada em", void_reason: "Motivo da anulação",
  shared: "Compartilhada", role_id: "Perfil", file_name: "Arquivo", event_type: "Tipo",
};
const SKIP = new Set(["version", "updated_at", "updated_by", "created_at", "created_by", "id", "farm_id", "deleted_at", "deleted_by"]);

const val = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
};

export type AuditEntry = {
  id: number;
  occurred_at: string;
  user_email: string | null;
  operation: string;
  table_name: string;
  record_id: string | null;
  changed_fields: Record<string, { old: unknown; new: unknown }> | null;
  old_data: any;
  new_data: any;
};

export function recordLabel(e: AuditEntry): string {
  const d = e.new_data ?? e.old_data ?? {};
  if (e.table_name === "weighings" && d.weight_kg != null) return `${d.weight_kg} kg`;
  if (e.table_name === "animal_events" && d.event_type) return String(d.event_type);
  return d.ear_tag ?? d.name ?? d.file_name ?? (e.record_id ? e.record_id.slice(0, 8) : "");
}

export function details(e: AuditEntry): string[] {
  if (e.operation !== "UPDATE" || !e.changed_fields) return [];
  return Object.entries(e.changed_fields)
    .filter(([k]) => !SKIP.has(k))
    .map(([k, v]) => {
      const label = FIELD_LABEL[k] ?? (k.endsWith("_id") ? k.replace(/_id$/, "") : k);
      if (k.endsWith("_id")) return `${label}: alterado`;
      return `${label}: ${val(v.old)} → ${val(v.new)}`;
    });
}
