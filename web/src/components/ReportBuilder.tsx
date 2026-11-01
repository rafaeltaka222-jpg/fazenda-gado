"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Field } from "@/lib/reports";

type Filter = { field: string; op: string; value: string; value2: string };
const OPS_TEXT: [string, string][] = [["eq", "é igual a"], ["ne", "é diferente de"], ["contains", "contém"], ["empty", "está vazio"], ["notempty", "não está vazio"]];
const OPS_NUM: [string, string][] = [["eq", "="], ["ne", "≠"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["between", "entre"], ["empty", "está vazio"], ["notempty", "não está vazio"]];

export default function ReportBuilder({
  fields,
  options,
  initial,
}: {
  fields: Field[];
  options: Record<string, string[]>;
  initial: any | null;
}) {
  const router = useRouter();
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const [selected, setSelected] = useState<string[]>(
    initial?.fields?.length ? initial.fields : ["ear_tag", "sex", "breed", "lot", "last_weight"]
  );
  const [filters, setFilters] = useState<Filter[]>(
    (initial?.filters ?? []).map((f: any) => ({
      field: f.field,
      op: f.op,
      value: Array.isArray(f.value) ? String(f.value[0] ?? "") : String(f.value ?? ""),
      value2: Array.isArray(f.value) ? String(f.value[1] ?? "") : "",
    }))
  );
  const [orderField, setOrderField] = useState<string>(initial?.order_by?.[0]?.field ?? "ear_tag");
  const [orderDir, setOrderDir] = useState<string>(initial?.order_by?.[0]?.dir ?? "asc");
  const [msg, setMsg] = useState("");

  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const setF = (i: number, patch: Partial<Filter>) => setFilters((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  function run() {
    if (selected.length === 0) return setMsg("Escolha pelo menos um campo.");
    const out: any[] = [];
    for (const f of filters) {
      const t = byKey.get(f.field)?.type ?? "text";
      if (f.op === "empty" || f.op === "notempty") {
        out.push({ field: f.field, op: f.op });
        continue;
      }
      if (f.value.trim() === "" || (f.op === "between" && f.value2.trim() === "")) return setMsg("Preencha o valor de todos os filtros.");
      const conv = (v: string) => {
        if (t !== "number") return v.trim();
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) ? n : NaN;
      };
      const value = f.op === "between" ? [conv(f.value), conv(f.value2)] : conv(f.value);
      if (Array.isArray(value) ? value.some((x) => Number.isNaN(x)) : Number.isNaN(value as number)) return setMsg("Há um número inválido em um filtro.");
      out.push({ field: f.field, op: f.op, value });
    }
    const ordered = fields.map((f) => f.key).filter((k) => selected.includes(k));
    const def = { source: "animals", fields: ordered, filters: out, order_by: [{ field: orderField, dir: orderDir }] };
    router.push(`/reports/run?def=${encodeURIComponent(JSON.stringify(def))}`);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card">
        <strong>1. Campos que aparecem no relatório</strong>
        <div className="form2" style={{ marginTop: 12 }}>
          {fields.map((f) => (
            <label key={f.key} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)", fontSize: 14 }}>
              <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} /> {f.label}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <strong>2. Filtros</strong>
        {filters.length === 0 && <p className="muted">Sem filtros: todos os animais entram.</p>}
        {filters.map((f, i) => {
          const t = byKey.get(f.field)?.type ?? "text";
          const ops = t === "text" ? OPS_TEXT : OPS_NUM;
          const opts = options[f.field];
          const noValue = f.op === "empty" || f.op === "notempty";
          const inputType = t === "date" ? "date" : "text";
          return (
            <div key={i} className="filters" style={{ marginTop: 12 }}>
              <select value={f.field} aria-label="Campo" onChange={(e) => setF(i, { field: e.target.value, op: "eq", value: "", value2: "" })}>
                {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <select value={f.op} aria-label="Condição" onChange={(e) => setF(i, { op: e.target.value })}>
                {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {!noValue &&
                (opts && (f.op === "eq" || f.op === "ne") ? (
                  <select value={f.value} aria-label="Valor" onChange={(e) => setF(i, { value: e.target.value })}>
                    <option value="">Selecione</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={inputType} value={f.value} aria-label="Valor" placeholder="Valor" onChange={(e) => setF(i, { value: e.target.value })} />
                ))}
              {f.op === "between" && (
                <input type={inputType} value={f.value2} aria-label="Valor final" placeholder="até" onChange={(e) => setF(i, { value2: e.target.value })} />
              )}
              <button type="button" className="btn ghost" onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}>Remover</button>
            </div>
          );
        })}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={() => setFilters((fs) => [...fs, { field: "sex", op: "eq", value: "", value2: "" }])}>
            + Adicionar filtro
          </button>
        </div>
      </div>

      <div className="card">
        <strong>3. Ordenação</strong>
        <div className="filters" style={{ marginTop: 12 }}>
          <select value={orderField} aria-label="Ordenar por" onChange={(e) => setOrderField(e.target.value)}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select value={orderDir} aria-label="Sentido" onChange={(e) => setOrderDir(e.target.value)}>
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </div>
      </div>

      {msg && <div className="flash bad" role="alert">{msg}</div>}
      <div><button type="button" className="btn" onClick={run}>Gerar consulta</button></div>
    </div>
  );
}
