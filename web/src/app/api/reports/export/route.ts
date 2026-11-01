import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { fmtCell, parseDef, type Field } from "@/lib/reports";
import { loadCustomCatalog } from "@/lib/catalog";
import { buildXlsx, type XCol } from "@/lib/xlsx";
import { buildPdf } from "@/lib/pdf";

const q = (s: string) => `"${s.replaceAll('"', '""')}"`;
const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "relatorio";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return new NextResponse("Origem não permitida", { status: 403 });

  const ctx = await getContext();
  const a = ctx.active;
  if (!a) return new NextResponse("Sem fazenda ativa", { status: 400 });
  const form = await request.formData();
  const def = parseDef(String(form.get("def") ?? ""));
  if (!def) return new NextResponse("Consulta inválida", { status: 400 });
  const fmtRaw = String(form.get("format") ?? "csv");
  const format = fmtRaw === "xlsx" || fmtRaw === "pdf" ? fmtRaw : "csv";
  const title = String(form.get("title") ?? "").trim().slice(0, 80) || "Relatório";

  const supabase = await createClient();
  const [res, cat] = await Promise.all([
    // as exportações (CSV, Excel e PDF) são registradas com o canal "csv" (= exportação)
    supabase.rpc("run_report", { p_farm: a.id, p_def: def, p_limit: 5000, p_offset: 0, p_channel: "csv" }),
    supabase.from("report_fields").select("key, label, type").eq("source", "animals"),
  ]);
  if (res.error) {
    return new NextResponse("Não foi possível gerar o arquivo.", { status: res.error.code === "42501" ? 403 : 400 });
  }
  const customCat = await loadCustomCatalog(supabase, a.id, a.role);
  const catalog = new Map([...((cat.data ?? []) as Field[]), ...customCat.fields].map((f) => [f.key, f]));
  const out = res.data as { total: number; rows: any[]; columns: string[] };
  const fields: Field[] = out.columns.map((k) => catalog.get(k) ?? { key: k, label: k, type: "text" });
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" }).replaceAll("-", "");
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });
  const base = `${slug(title)}-${stamp}`;
  const noStore = { "Cache-Control": "no-store" };

  if (format === "xlsx") {
    const cols: XCol[] = fields.map((f) => ({ header: f.label, type: f.type }));
    const rows = out.rows.map((r) =>
      fields.map((f) => {
        const v = r[f.key];
        if (v === null || v === undefined) return null;
        if (f.type === "number") return Number(v);
        if (typeof v === "boolean") return v ? "Sim" : "Não";
        return String(v);
      })
    );
    const buf = buildXlsx(title, cols, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const rows = out.rows.map((r) =>
      fields.map((f) => (typeof r[f.key] === "boolean" ? (r[f.key] ? "Sim" : "Não") : fmtCell(r[f.key], f.type, f.key)))
    );
    const buf = buildPdf({
      title,
      subtitle: `${a.code} · ${a.name} · ${out.rows.length} registro(s)${out.total > out.rows.length ? ` de ${out.total}` : ""} · gerado em ${when}`,
      columns: fields.map((f) => ({ header: f.label, align: f.type === "number" ? "right" : "left" })),
      rows,
      footer: "Fazenda Gado",
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
    });
  }

  const cell = (f: Field, v: unknown) => {
    if (v === null || v === undefined) return "";
    if (f.type === "number") return String(v).replace(".", ",");
    if (f.type === "date") return String(v).split("-").reverse().join("/");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    let s = String(v);
    // Evita que o Excel interprete texto como fórmula
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return q(s);
  };
  const lines = [fields.map((f) => q(f.label)).join(";")];
  for (const r of out.rows) lines.push(fields.map((f) => cell(f, r[f.key])).join(";"));
  return new NextResponse("\uFEFF" + lines.join("\r\n") + "\r\n", {
    headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
  });
}
