import Link from "next/link";
import FarmSelect from "./FarmSelect";
import { createClient } from "@/lib/supabase/server";
import type { FarmItem } from "@/lib/context";

type Item = { href: string; label: string; key: string; perm: string | null };

const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Visão geral", items: [{ href: "/dashboard", label: "Painel", key: "dashboard", perm: null }] },
  {
    title: "Rebanho",
    items: [
      { href: "/herd", label: "Rebanho", key: "herd", perm: "animals.view" },
      { href: "/structure", label: "Lotes e pastos", key: "structure", perm: "lots.view" },
      { href: "/weighings", label: "Pesagens", key: "weighings", perm: "weighings.view" },
      { href: "/health", label: "Sanidade", key: "health", perm: "health.view" },
      { href: "/reproduction", label: "Reprodução", key: "reproduction", perm: "reproduction.view" },
      { href: "/inventory", label: "Contagem", key: "inventory", perm: "counts.view" },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/tasks", label: "Tarefas", key: "tasks", perm: "tasks.view" },
      { href: "/stock", label: "Estoque", key: "stock", perm: "inventory.view" },
      { href: "/costs", label: "Custos", key: "costs", perm: "costs.view" },
      { href: "/sales", label: "Vendas", key: "sales", perm: "trade.view" },
      { href: "/people", label: "Pessoas", key: "people", perm: "people.view" },
      { href: "/import", label: "Importação", key: "import", perm: "imports.view" },
    ],
  },
  { title: "Análise", items: [{ href: "/reports", label: "Relatórios", key: "reports", perm: "reports.view" }] },
  {
    title: "Administração",
    items: [
      { href: "/farms", label: "Fazendas", key: "farms", perm: null },
      { href: "/users", label: "Usuários", key: "users", perm: "users.view" },
      { href: "/settings/fields", label: "Campos personalizados", key: "fields", perm: "settings.view" },
      { href: "/settings/api", label: "API e integrações", key: "api", perm: "settings.update" },
      { href: "/audit", label: "Auditoria", key: "audit", perm: "audit.view" },
      { href: "/security", label: "Segurança (2FA)", key: "security", perm: null },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case "dashboard":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
        </svg>
      );
    case "herd":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case "structure":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case "weighings":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      );
    case "health":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      );
    case "reproduction":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      );
    case "inventory":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "tasks":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "stock":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case "costs":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "sales":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
    case "people":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "import":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      );
    case "reports":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case "farms":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "users":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case "fields":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    case "api":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      );
    case "audit":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "security":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    default:
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
}

export default async function AppShell({
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
  let perms: string[] | null = null;
  if (active) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_permissions", { p_farm: active.id });
    perms = error ? null : ((data as string[] | null) ?? []);
  }
  const show = (i: Item) => i.perm === null || perms === null || perms.includes(i.perm) || i.key === current;
  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <div className="shell">
      <aside className="sidebar">
        <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Abrir menu" />
        <label htmlFor="navtoggle" className="burger">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🌱</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Fazenda Gado</span>
          </div>
          <span aria-hidden="true" style={{ fontSize: 13, background: "#ecfdf5", padding: "4px 8px", borderRadius: 6, color: "#059669" }}>☰ Menu</span>
        </label>
        
        <div className="brand-wrapper">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <path d="M12 12L2.5 7.5" />
            </svg>
          </div>
          <span className="brand-name">Fazenda Gado</span>
          <span className="brand-badge">PRO</span>
        </div>

        <nav className="nav" aria-label="Menu principal">
          {GROUPS.map((g) => {
            const items = g.items.filter(show);
            if (items.length === 0) return null;
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{g.title}</div>
                {items.map((n) => (
                  <Link key={n.key} href={n.href} className={"nav-item" + (n.key === current ? " active" : "")}>
                    <NavIcon name={n.key} />
                    <span>{n.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar-left">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <FarmSelect farms={farms} activeId={active?.id ?? ""} />
            </div>
            <form action="/search" method="get" role="search" className="searchbox">
              <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input name="q" type="search" minLength={2} placeholder="Buscar brinco, nome, lote, pasto..." aria-label="Busca global" />
            </form>
          </div>

          <div className="topbar-right">
            <div className="user-badge" title={email}>
              <div className="user-avatar">{initial}</div>
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {email}
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn ghost" style={{ padding: "8px 14px", fontSize: 13 }} title="Desconectar da conta">
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
