"use client";
import { useEffect, useRef } from "react";

// Mostra ou esconde campos condicionais (ex.: só para fêmeas) conforme o valor de outro campo do formulário.
export default function ConditionalFields() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const apply = () => {
      form.querySelectorAll<HTMLElement>("[data-cond-field]").forEach((w) => {
        const el = form.elements.namedItem(w.dataset.condField ?? "") as HTMLInputElement | null;
        const cur = el && typeof (el as any).value === "string" ? el.value : "";
        const ok = w.dataset.condOp === "eq" ? cur === w.dataset.condValue : cur !== w.dataset.condValue;
        w.hidden = !ok;
        w.querySelectorAll<HTMLInputElement>("input, select, textarea").forEach((i) => {
          if (!i.dataset.locked) i.disabled = !ok;
        });
      });
    };
    apply();
    form.addEventListener("change", apply);
    form.addEventListener("input", apply);
    return () => {
      form.removeEventListener("change", apply);
      form.removeEventListener("input", apply);
    };
  }, []);
  return <span ref={ref} hidden />;
}
