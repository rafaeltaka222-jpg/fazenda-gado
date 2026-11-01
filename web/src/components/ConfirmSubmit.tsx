"use client";

export default function ConfirmSubmit({ label, message, className }: { label: string; message: string; className?: string }) {
  return (
    <button
      className={className ?? "btn ghost"}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
