"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const current: "light" | "dark" = saved === "light" ? "light" : "dark";
    setTheme(current);
    
    // Apply theme to documentElement and body
    document.documentElement.setAttribute("data-theme", current);
    document.body.setAttribute("data-theme", current);
    if (current === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
    setMounted(true);

    const onStorage = () => {
      const updated: "light" | "dark" = localStorage.getItem("theme") === "dark" ? "dark" : "light";
      setTheme(updated);
      document.documentElement.setAttribute("data-theme", updated);
      document.body.setAttribute("data-theme", updated);
      if (updated === "dark") {
        document.documentElement.classList.add("dark");
        document.body.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.body.classList.remove("dark");
      }
    };
    window.addEventListener("theme-change", onStorage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("theme-change", onStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle() {
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}

    document.documentElement.setAttribute("data-theme", next);
    document.body.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
    window.dispatchEvent(new Event("theme-change"));
  }

  const isDark = mounted ? theme === "dark" : false;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={isDark ? "Mudar para Modo Claro (Dia)" : "Mudar para Modo Escuro (Noite)"}
        aria-label="Alternar tema claro/escuro"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          color: "var(--ink)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "var(--shadow-sm)",
          padding: 0,
        }}
      >
        {isDark ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div
      onClick={toggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(); }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 10,
        background: "var(--bg-subtle)",
        border: "1px solid var(--line)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink)",
        transition: "all 0.15s ease",
        userSelect: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
      title="Clique para alternar o tema do sistema"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isDark ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
        <span>{isDark ? "Modo Escuro" : "Modo Claro"}</span>
      </div>
      <span
        style={{
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 6,
          background: isDark ? "rgba(56, 189, 248, 0.2)" : "#fef3c7",
          color: isDark ? "#38bdf8" : "#92400e",
          fontWeight: 700,
        }}
      >
        {isDark ? "NOITE" : "DIA"}
      </span>
    </div>
  );
}