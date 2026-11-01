import ConditionalFields from "./ConditionalFields";
import type { Def } from "@/lib/catalog";

export default function CustomFields({
  defs,
  values,
  role,
  isNew,
}: {
  defs: Def[];
  values: Record<string, any>;
  role: string;
  isNew: boolean;
}) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((d) => {
        const editable = !d.editable_to || role === "administrador" || d.editable_to.includes(role);
        const raw = values[d.field_key];
        const v = raw !== undefined && raw !== null ? raw : isNew ? d.default_value : null;
        const name = `cf_${d.field_key}`;
        const common = {
          name,
          disabled: !editable,
          "data-locked": editable ? undefined : "1",
          required: editable && d.required && !d.condition,
        } as any;
        const cond = d.condition
          ? {
              "data-cond-field": d.condition.field === "sex" ? "sex" : `cf_${d.condition.field}`,
              "data-cond-op": d.condition.op,
              "data-cond-value": d.condition.value,
            }
          : {};
        const title = `${d.label}${d.required ? " *" : ""}`;
        const dv = v === null || v === undefined ? "" : String(v);

        if (d.data_type === "multilist") {
          const sel: string[] = Array.isArray(v) ? v : [];
          return (
            <div key={d.field_key} className="cfield" {...cond}>
              <span>{title}</span>
              <input type="hidden" name={`cfm_${d.field_key}`} value="" disabled={!editable} data-locked={editable ? undefined : "1"} />
              {d.options.map((o) => (
                <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}>
                  <input type="checkbox" name={`cfm_${d.field_key}`} value={o} defaultChecked={sel.includes(o)}
                    disabled={!editable} data-locked={editable ? undefined : "1"} /> {o}
                </label>
              ))}
            </div>
          );
        }

        let input;
        if (d.data_type === "list") {
          input = (
            <select {...common} defaultValue={dv}>
              <option value="">—</option>
              {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        } else if (d.data_type === "boolean") {
          input = (
            <select {...common} defaultValue={v === true || dv === "true" ? "true" : v === false || dv === "false" ? "false" : ""}>
              <option value="">—</option><option value="true">Sim</option><option value="false">Não</option>
            </select>
          );
        } else if (d.data_type === "longtext") {
          input = <textarea {...common} rows={3} defaultValue={dv} />;
        } else if (d.data_type === "date") {
          input = <input {...common} type="date" defaultValue={dv} />;
        } else if (d.data_type === "email") {
          input = <input {...common} type="email" defaultValue={dv} />;
        } else if (d.data_type === "phone") {
          input = <input {...common} type="tel" defaultValue={dv} />;
        } else if (["decimal", "money", "percent"].includes(d.data_type)) {
          input = <input {...common} inputMode="decimal" defaultValue={dv.replace(".", ",")} />;
        } else if (d.data_type === "integer") {
          input = <input {...common} inputMode="numeric" defaultValue={dv} />;
        } else {
          input = <input {...common} defaultValue={dv} />;
        }
        return (
          <label key={d.field_key} className="cfield" {...cond}>
            {title}
            {input}
            {d.description && <small>{d.description}</small>}
          </label>
        );
      })}
      <ConditionalFields />
    </>
  );
}
