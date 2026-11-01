"use client";
import { selectFarm } from "@/app/actions";
import type { FarmItem } from "@/lib/context";

export default function FarmSelect({ farms, activeId }: { farms: FarmItem[]; activeId: string }) {
  if (farms.length === 0) return <span className="muted">Nenhuma fazenda</span>;
  return (
    <form action={selectFarm}>
      <select
        name="farm"
        defaultValue={activeId}
        aria-label="Fazenda ativa"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {farms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.code} · {f.name}
          </option>
        ))}
      </select>
    </form>
  );
}
