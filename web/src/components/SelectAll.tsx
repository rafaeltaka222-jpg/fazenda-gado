"use client";

export default function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos"
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>('input[name="ids"]')
          .forEach((c) => {
            c.checked = checked;
          });
      }}
    />
  );
}
