"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import BullLogo from "./BullLogo";
import TopbarProfileMenu from "./TopbarProfileMenu";
import SidebarNav, { NavGroupDef, NavItemDef } from "./SidebarNav";
import { resolveRolePermissions, type FarmItem } from "@/lib/permissions";

const GROUPS: NavGroupDef[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", key: "dashboard", perm: null },
      { href: "/herd", label: "Animais", key: "herd", perm: "animals.view" },
      { href: "/structure", label: "Lotes & Pastagens", key: "structure", perm: "lots.view" },
      { href: "/weighings", label: "Pesagens", key: "weighings", perm: "weighings.view" },
      { href: "/import", label: "Balança & Importação", key: "import", perm: "imports.view" },
      { href: "/reports", label: "Relatórios", key: "reports", perm: "reports.view" },
    ],
  },
  {
    title: "Manejo & Sanidade",
    items: [
      { href: "/health", label: "Sanidade & Vacinas", key: "health", perm: "health.view" },
      { href: "/reproduction", label: "Reprodução & IATF", key: "reproduction", perm: "reproduction.view" },
      { href: "/stock", label: "Nutrição & Estoque", key: "stock", perm: "inventory.view" },
      { href: "/inventory", label: "Contagem de Curral", key: "inventory", perm: "counts.view" },
      { href: "/tasks", label: "Alertas & Tarefas", key: "tasks", perm: "tasks.view" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/finance", label: "Dashboard Financeiro", key: "finance", perm: "costs.view" },
      { href: "/finance/payables", label: "Contas a Pagar", key: "payables", perm: "costs.view" },
      { href: "/finance/receivables", label: "Contas a Receber", key: "receivables", perm: "trade.view" },
      { href: "/costs", label: "Custos & Despesas", key: "costs", perm: "costs.view" },
    ],
  },
  {
    title: "Comercial & Gestão",
    items: [
      { href: "/sales", label: "Vendas & GTA", key: "sales", perm: "trade.view" },
      { href: "/people", label: "Pessoas & Parceiros", key: "people", perm: "people.view" },
    ],
  },
  {
    title: "Configurações",
    items: [
      { href: "/farms", label: "Fazendas", key: "farms", perm: null },
      { href: "/users", label: "Usuários & Perfis", key: "users", perm: "users.view" },
      { href: "/settings/fields", label: "Campos Extras", key: "fields", perm: "settings.view" },
      { href: "/settings/api", label: "Dispositivos & API", key: "api", perm: "settings.update" },
      { href: "/audit", label: "Auditoria", key: "audit", perm: "audit.view" },
      { href: "/security", label: "Segurança (2FA)", key: "security", perm: null },
    ],
  },
];

function SidebarPanelIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

export default function AppShell({
  email,
  farms,
  active,
  current,
  children,
}: {
  email: string;
  farms: FarmItem[];
  active: FarmItem | null;
  current: string;
  children: React.ReactNode;
}) {
  // Estado do menu lateral retrátil (aberto por padrão)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Lê preferência do usuário salva no localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jr_sidebar_open");
      if (saved !== null) {
        setIsSidebarOpen(saved === "true");
      }
    } catch {
      // Ignora silenciosamente caso o armazenamento local esteja bloqueado
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("jr_sidebar_open", String(next));
      } catch {
        // Ignora silenciosamente
      }
      return next;
    });
  };

  // Atalho de teclado rápido Ctrl+B / Cmd+B para abrir/fechar o menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Resolve permissões instantaneamente em memória sem round-trip extra ao banco
  const perms: string[] | null = active
    ? active.permissions ?? resolveRolePermissions(active.role)
    : null;

  const show = (i: NavItemDef) =>
    i.perm === null || perms === null || perms.includes(i.perm) || i.key === current;

  const visibleGroups: NavGroupDef[] = GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter(show),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={`shell ${!isSidebarOpen ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        {/* Identidade Corporativa Oficial no Topo da Barra Lateral (Sem botão duplicado) */}
        <div className="brand-wrapper">
          <Link
            href="/dashboard"
            prefetch={true}
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}
          >
            <BullLogo size={40} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                JR Comércio
              </span>
              <span style={{ fontWeight: 600, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.25 }}>
                Gestão Pecuária
              </span>
            </div>
          </Link>
        </div>

        <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Abrir menu" />
        <label htmlFor="navtoggle" className="burger">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BullLogo size={32} />
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>JR Comércio e Exportação de Café</span>
          </div>
          <span
            aria-hidden="true"
            style={{
              fontSize: 13,
              background: "var(--brand-light)",
              padding: "4px 8px",
              borderRadius: 6,
              color: "var(--brand)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Menu
          </span>
        </label>

        {/* Navegação Acordeão Exclusivo */}
        <SidebarNav groups={visibleGroups} currentKey={current} />

        {/* Bloco Integrado das Informações da Fazenda no Rodapé da Sidebar (Fiel à Imagem 2) */}
        <div className="sidebar-footer">
          <div className="sidebar-farm-card">
            <div style={{ padding: "10px 12px 6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                  {active ? (active.name.toLowerCase() === "jr faz" ? "Fazenda jr faz" : `Fazenda ${active.name}`) : "Fazenda jr faz"}
                </span>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 8px rgba(16, 185, 129, 0.8)",
                  }}
                  title="Unidade Ativa"
                />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span style={{ fontWeight: 500 }}>
                  {active ? `Unidade ${active.code} • Ativa` : "Unidade 01 • Ativa"}
                </span>
              </div>
            </div>

            {/* Ilustração Vetorial Noturna da Fazenda com Silhuetas de Bovinos */}
            <div style={{ margin: "0 10px 8px", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <svg viewBox="0 0 260 70" style={{ width: "100%", height: 56, display: "block" }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="nightSkyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#081014" stopOpacity="0.95" />
                    <stop offset="60%" stopColor="#0b1b1c" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#05100e" stopOpacity="1" />
                  </linearGradient>
                </defs>
                <rect width="260" height="70" fill="url(#nightSkyGrad)" />
                {/* Colinas ao fundo */}
                <path d="M0 48 Q 70 28, 140 40 T 260 32 L 260 70 L 0 70 Z" fill="#0c1f18" opacity="0.6" />
                <path d="M0 54 Q 90 38, 180 48 T 260 42 L 260 70 L 0 70 Z" fill="#091812" opacity="0.85" />
                <path d="M0 60 Q 110 50, 260 56 L 260 70 L 0 70 Z" fill="#06120b" />
                {/* Árvore silhueta à esquerda */}
                <circle cx="100" cy="40" r="12" fill="#050e09" opacity="0.75" />
                <circle cx="108" cy="38" r="9" fill="#050e09" opacity="0.85" />
                <circle cx="94" cy="41" r="8" fill="#050e09" opacity="0.8" />
                <rect x="99" y="44" width="3" height="12" fill="#040906" />
                {/* Silhuetas de Bovinos Pastando */}
                <g transform="translate(26, 46) scale(0.65)" fill="#040a06" opacity="0.92">
                  <path d="M4 12 c1-3 4-5 8-5 h12 c3 0 5 2 6 5 l1 2 c1 0 3-1 4-2 c0 3-1 5-3 6 l-1 6 c0 1-1 2-2 2 h-2 l-1-6 h-10 l-1 6 h-2 c-1 0-2-1-2-2 l1-8 c-2-1-4-2-6-4 z" />
                </g>
                <g transform="translate(142, 48) scale(0.55)" fill="#040a06" opacity="0.85">
                  <path d="M4 12 c1-3 4-5 8-5 h12 c3 0 5 2 6 5 l1 2 c1 0 3-1 4-2 c0 3-1 5-3 6 l-1 6 c0 1-1 2-2 2 h-2 l-1-6 h-10 l-1 6 h-2 c-1 0-2-1-2-2 l1-8 c-2-1-4-2-6-4 z" />
                </g>
              </svg>
            </div>

            {/* Controle de Modo Escuro Integrado Conforme Referência */}
            <div style={{ padding: "0 10px 10px" }}>
              <ThemeToggle compact={false} />
            </div>
          </div>
        </div>
      </aside>

      <div className="content">
        {/* Topbar Formal: Seletor de Fazenda à esquerda, Busca Central e Notificações + Perfil à direita */}
        <header className="topbar">
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
            {/* Bloco de Controle do Menu e Marca JR quando o menu estiver recolhido */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={toggleSidebar}
                className="sidebar-toggle-btn"
                aria-label={isSidebarOpen ? "Recolher menu lateral (Ctrl+B)" : "Expandir menu lateral (Ctrl+B)"}
                title={isSidebarOpen ? "Recolher menu lateral (Ctrl+B)" : "Expandir menu lateral (Ctrl+B)"}
              >
                <SidebarPanelIcon isOpen={isSidebarOpen} />
              </button>

              {!isSidebarOpen && (
                <Link
                  href="/dashboard"
                  prefetch={true}
                  className="topbar-collapsed-brand"
                  style={{ textDecoration: "none" }}
                >
                  <BullLogo size={36} />
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                      JR Comércio
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)", lineHeight: 1.25 }}>
                      Gestão Pecuária
                    </span>
                  </div>
                </Link>
              )}
            </div>

            <form action="/search" method="get" role="search" className="searchbox" style={{ maxWidth: 520, flex: 1 }}>
              <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                name="q"
                type="search"
                minLength={2}
                placeholder="Buscar animais, lotes, pastagens..."
                aria-label="Busca global"
                style={{ borderRadius: 999, paddingLeft: 42, height: 42 }}
              />
            </form>
          </div>

          <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ThemeToggle compact />
            <TopbarProfileMenu
              email={email}
              farmName={active?.name}
              farmCode={active?.code}
              userRole={active?.role ?? "administrador"}
              isAdmin={active?.role === "administrador" || perms?.includes("users.view") || false}
            />
          </div>
        </header>

        <main className="main page-transition">{children}</main>
      </div>
    </div>
  );
}
