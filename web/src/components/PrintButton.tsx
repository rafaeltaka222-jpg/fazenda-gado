"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn ghost noprint" onClick={() => window.print()}>
      Imprimir / salvar PDF
    </button>
  );
}
