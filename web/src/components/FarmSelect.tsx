"use client";

import React, { useEffect, useState, useTransition } from "react";
import { selectFarm } from "@/app/actions";
import type { FarmItem } from "@/lib/context";

export default function FarmSelect({
  farms,
  activeId,
}: {
  farms: FarmItem[];
  activeId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [currentId, setCurrentId] = useState(activeId);

  useEffect(() => {
    setCurrentId(activeId);
  }, [activeId]);

  if (farms.length === 0) return <span className="muted">Nenhuma fazenda</span>;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextFarmId = e.target.value;
    if (nextFarmId === activeId) return;
    setCurrentId(nextFarmId);

    const fd = new FormData();
    fd.set("farm", nextFarmId);

    startTransition(async () => {
      await selectFarm(fd);
      // Limpa qualquer rota pré-carregada da fazenda anterior e recarrega os dados reais da nova fazenda
      window.location.reload();
    });
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <select
        name="farm"
        value={currentId}
        disabled={isPending}
        aria-label="Fazenda ativa"
        onChange={handleChange}
        style={{
          background: "transparent",
          border: 0,
          outline: "none",
          color: "var(--ink)",
          fontWeight: 700,
          fontSize: 13.5,
          padding: "2px 4px",
          opacity: isPending ? 0.65 : 1,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {farms.map((f) => (
          <option key={f.id} value={f.id} style={{ background: "#111827", color: "#f1f5f9" }}>
            {f.code} - {f.name}
          </option>
        ))}
      </select>
      {isPending && (
        <span
          aria-label="Carregando fazenda..."
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--brand)",
            borderTopColor: "transparent",
            display: "inline-block",
            animation: "agroSpin 0.55s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}
