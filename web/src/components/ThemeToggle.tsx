"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Detect current theme from html attribute or localStorage
    const saved = localStorage.getItem("theme");
    const current: "light" | "dark" =
      saved === "dark" || (!saved && document.documentElement.getAttribute("data-theme") === "dark")
        ? "dark"
        : "light";
    setTheme(current);
    setMounted(true);

    const onStorage = () => {
      const updated: "light" | "dark" = localStorage.getItem("theme") === "dark" ? "dark" : "light";
      setTheme(updated);
    };
    window.addEventListener("theme-change", onStorage);
    return () => window.removeEventListener("theme-change", onStorage);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.dispatchEvent(new Event("theme-change"));
  }

  if (!mounted) {
    // Avoid hydration layout shift
    return (
      <div
        style={{
          width: compact ? 36 : 110,
          height: 36,
          borderRadius: 10,
          background: "var(--bg-subtle)",
          border: "1px solid var(--line)",
        }}
      />
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={theme === "light" ? "Alternar para Modo Escuro" : "Alternar para Modo Claro"}
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
        }}
      >
        {theme === "light" ? (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        padding: "6px 10px",
        borderRadius: 10,
        background: "var(--bg-subtle)",
        border: "1px solid var(--line)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink-secondary)",
        transition: "all 0.15s ease",
        userSelect: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
      title="Clique para alternar o tema do sistema"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {theme === "light" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <span>{theme === "light" ? "Modo Claro" : "Modo Escuro"}</span>
      </div>
      <span
        style={{
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 6,
          background: theme === "light" ? "#fef3c7" : "rgba(56, 189, 248, 0.2)",
          color: theme === "light" ? "#92400e" : "#38bdf8",
          fontWeight: 700,
        }}
      >
        {theme === "light" ? "DIA" : "NOITE"}
      </span>
    </div>
  );
}