export type FieldType = "text" | "number" | "date";
export type Field = { key: string; label: string; type: FieldType };
export type ReportDef = {
  source: "animals";
  fields: string[];
  filters?: { field: string; op: string; value?: unknown }[];
  order_by?: { field: string; dir: "asc" | "desc" }[];
};

export function parseDef(raw: string | undefined | null): ReportDef | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d && typeof d === "object" && d.source === "animals" && Array.isArray(d.fields) && d.fields.length > 0) return d;
  } catch {
    /* definição inválida */
  }
  return null;
}

export const STANDARD: { id: string; name: string; desc: string; def: ReportDef }[] = [
  {
    id: "estoque",
    name: "Estoque do rebanho",
    desc: "Todos os animais ativos com categoria, lote, pasto e peso atual.",
    def: {
      source: "animals",
      fields: ["ear_tag", "name", "sex", "breed", "category", "lot", "pasture", "last_weight"],
      filters: [{ field: "status", op: "eq", value: "ativo" }],
      order_by: [{ field: "ear_tag", dir: "asc" }],
    },
  },
  {
    id: "acima400",
    name: "Animais acima de 400 kg",
    desc: "Ativos com peso atual acima de 400 kg, do mais pesado ao mais leve.",
    def: {
      source: "animals",
      fields: ["ear_tag", "sex", "breed", "lot", "last_weight", "last_weighed_on", "gmd"],
      filters: [{ field: "status", op: "eq", value: "ativo" }, { field: "last_weight", op: "gt", value: 400 }],
      order_by: [{ field: "last_weight", dir: "desc" }],
    },
  },
  {
    id: "sempesagem",
    name: "Animais nunca pesados",
    desc: "Ativos que ainda não têm nenhuma pesagem.",
    def: {
      source: "animals",
      fields: ["ear_tag", "name", "sex", "category", "lot", "entry_date"],
      filters: [{ field: "status", op: "eq", value: "ativo" }, { field: "last_weight", op: "empty" }],
      order_by: [{ field: "ear_tag", dir: "asc" }],
    },
  },
  {
    id: "pesagem60",
    name: "Sem pesagem há mais de 60 dias",
    desc: "Ativos cuja última pesagem foi há mais de 60 dias.",
    def: {
      source: "animals",
      fields: ["ear_tag", "lot", "last_weight", "last_weighed_on", "days_since_weighing"],
      filters: [{ field: "status", op: "eq", value: "ativo" }, { field: "days_since_weighing", op: "gt", value: 60 }],
      order_by: [{ field: "days_since_weighing", dir: "desc" }],
    },
  },
  {
    id: "vendidos",
    name: "Animais vendidos",
    desc: "Animais com venda registrada e a data de saída.",
    def: {
      source: "animals",
      fields: ["ear_tag", "name", "sex", "breed", "lot", "exit_date", "last_weight"],
      filters: [{ field: "status", op: "eq", value: "vendido" }],
      order_by: [{ field: "exit_date", dir: "desc" }],
    },
  },
  {
    id: "porlote",
    name: "Animais por lote",
    desc: "Ativos agrupados por lote (ordenados por lote e brinco).",
    def: {
      source: "animals",
      fields: ["lot", "ear_tag", "sex", "category", "last_weight"],
      filters: [{ field: "status", op: "eq", value: "ativo" }],
      order_by: [{ field: "lot", dir: "asc" }, { field: "ear_tag", dir: "asc" }],
    },
  },
];

export const defUrl = (def: ReportDef) => `/reports/run?def=${encodeURIComponent(JSON.stringify(def))}`;

export function fmtCell(value: unknown, type: FieldType, key: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return String(value).split("-").reverse().join("/");
  if (type === "number") {
    if (key.startsWith("cf:")) return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    const d = key === "gmd" ? 2 : key === "last_weight" ? 1 : 0;
    return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return String(value);
}
