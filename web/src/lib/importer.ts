// Leitura de arquivos TXT/CSV de pesagem conforme o layout escolhido.
// Só interpreta o texto; a validação de negócio (animal, duplicidade, faixa de peso) é feita no banco.

export type Layout = {
  delimiter: string;
  has_header: boolean;
  date_format: string;
  decimal_separator: string;
  col_animal: number;
  col_date: number;
  col_time: number | null;
  col_weight: number;
  default_time: string;
};

export type ParsedRow = {
  line: number;
  raw: string;
  ear_tag?: string;
  weighed_at?: string;
  weight_kg?: number;
  parse_error?: string;
};

const DELIMS: Record<string, string> = { ponto_e_virgula: ";", virgula: ",", tab: "\t", barra: "|", espaco: " " };

function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function splitLine(line: string, d: string): string[] {
  if (d === " ") return line.trim().split(/\s+/);
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === d && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(s: string, fmt: string): string | null {
  let d: number, m: number, y: number;
  let r: RegExpExecArray | null;
  if (fmt === "DD/MM/YYYY") {
    r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!r) return null;
    [d, m, y] = [+r[1], +r[2], +r[3]];
  } else if (fmt === "DD-MM-YYYY") {
    r = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (!r) return null;
    [d, m, y] = [+r[1], +r[2], +r[3]];
  } else if (fmt === "MM/DD/YYYY") {
    r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!r) return null;
    [m, d, y] = [+r[1], +r[2], +r[3]];
  } else {
    r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!r) return null;
    [y, m, d] = [+r[1], +r[2], +r[3]];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseTime(s: string): string | null {
  const r = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!r) return null;
  const [h, mi, se] = [+r[1], +r[2], r[3] ? +r[3] : 0];
  if (h > 23 || mi > 59 || se > 59) return null;
  return `${pad(h)}:${pad(mi)}:${pad(se)}`;
}

function parseWeight(s: string, dec: string): number | null {
  let t = s.replace(/\s|kg/gi, "");
  t = dec === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

export function parseWeighingFile(buf: ArrayBuffer, layout: Layout): ParsedRow[] {
  const d = DELIMS[layout.delimiter] ?? ";";
  const lines = decode(buf).split(/\r\n|\n|\r/);
  const rows: ParsedRow[] = [];
  let headerSkipped = !layout.has_header;
  const need = Math.max(layout.col_animal, layout.col_date, layout.col_time ?? 0, layout.col_weight);

  lines.forEach((line, idx) => {
    if (line.trim() === "") return;
    if (!headerSkipped) {
      headerSkipped = true;
      return;
    }
    const raw = line.slice(0, 300);
    const base = { line: idx + 1, raw };
    const cols = splitLine(line, d);
    if (cols.length < need) {
      rows.push({ ...base, parse_error: `Linha com colunas faltando (esperado ao menos ${need}, encontrado ${cols.length})` });
      return;
    }
    const tag = cols[layout.col_animal - 1];
    const date = parseDate(cols[layout.col_date - 1], layout.date_format);
    const time = layout.col_time ? parseTime(cols[layout.col_time - 1]) : parseTime(layout.default_time);
    const weight = parseWeight(cols[layout.col_weight - 1], layout.decimal_separator);
    if (!tag) return void rows.push({ ...base, parse_error: "Brinco não informado" });
    if (!date) return void rows.push({ ...base, ear_tag: tag, parse_error: `Data inválida: "${cols[layout.col_date - 1]}"` });
    if (!time) return void rows.push({ ...base, ear_tag: tag, parse_error: "Horário inválido" });
    if (weight === null) return void rows.push({ ...base, ear_tag: tag, parse_error: `Peso inválido: "${cols[layout.col_weight - 1]}"` });
    // Horário do arquivo interpretado como horário de Brasília/Bahia (UTC-3).
    rows.push({ ...base, ear_tag: tag, weighed_at: `${date}T${time}-03:00`, weight_kg: weight });
  });
  return rows;
}
