"use client";

export default function ConfirmButton({ label }: { label: string }) {
  return (
    <button
      className="btn"
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        const n = form.querySelectorAll('input[name="ids"]:checked, input[type="hidden"][name="ids"]').length;
        if (n === 0) {
          alert("Selecione pelo menos um animal.");
          e.preventDefault();
          return;
        }
        const op = (form.elements.namedItem("op") as HTMLSelectElement | null)?.selectedOptions[0]?.text ?? "Aplicar";
        if (!confirm(`${op}: aplicar a ${n} animal(is)? Esta operação gera registros no histórico.`)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
