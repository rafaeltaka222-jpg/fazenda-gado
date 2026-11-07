"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavItemDef = {
  href: string;
  label: string;
  key: string;
  perm: string | null;
};

export type NavGroupDef = {
  title: string;
  items: NavItemDef[];
};

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case "dashboard":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "herd":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 11V7a3 3 0 013-3h10a3 3 0 013 3v4M4 11l2 8h12l2-8M4 11h16M9 15h.01M15 15h.01" />
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
    case "stock":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
    case "sales":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
    case "finance":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      );
    case "payables":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "receivables":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m0 0v5m0-5H10M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "costs":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "people":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "farms":
      return (
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}

/**
 * Localiza qual grupo contém a rota ativa (por key, por href exato ou por prefixo de rota).
 */
function getMatchingGroupTitle(
  groups: NavGroupDef[],
  currentKey: string,
  pathname: string
): string | null {
  // 1. Tenta correspondência exata de chave ou URL
  for (const g of groups) {
    if (g.items.some((item) => item.key === currentKey || item.href === pathname)) {
      return g.title;
    }
  }

  // 2. Tenta correspondência de prefixo (ex: /herd/new, /herd/123 -> /herd)
  for (const g of groups) {
    if (
      g.items.some(
        (item) => item.href !== "/dashboard" && pathname.startsWith(item.href)
      )
    ) {
      return g.title;
    }
  }

  // 3. Fallback para o primeiro grupo com itens visíveis
  return groups[0]?.title ?? null;
}

export default function SidebarNav({
  groups,
  currentKey,
  onNavigate,
}: {
  groups: NavGroupDef[];
  currentKey: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticKey, setOptimisticKey] = useState<string>(currentKey);

  // Guarda no estado estritamente qual grupo está aberto (um único valor string ou null)
  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    getMatchingGroupTitle(groups, currentKey, pathname)
  );

  useEffect(() => {
    setOptimisticKey(currentKey);
  }, [currentKey, pathname]);

  // Ao navegar para outra rota (pelo menu, links do dashboard ou voltar do navegador),
  // abre automaticamente o grupo correspondente e fecha o anterior
  useEffect(() => {
    const matchingGroup = getMatchingGroupTitle(groups, currentKey, pathname);
    if (matchingGroup) {
      setOpenGroup(matchingGroup);
    }
  }, [pathname, currentKey, groups]);

  // Alterna o grupo: se já estiver aberto, recolhe (deixa todos fechados);
  // se estiver fechado, expande este e fecha o que estava aberto (acordeão exclusivo)
  const handleGroupToggle = (groupTitle: string) => {
    setOpenGroup((prev) => (prev === groupTitle ? null : groupTitle));
  };

  // Prefetch das principais rotas logo após a montagem para transições instantâneas
  useEffect(() => {
    const coreRoutes = ["/dashboard", "/herd", "/weighings", "/import", "/reports", "/structure"];
    const timer = setTimeout(() => {
      coreRoutes.forEach((r) => {
        try {
          router.prefetch(r);
        } catch {
          // ignore
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      {/* Barra superior fluida de transição instantânea */}
      {isPending && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 9999,
            background: "linear-gradient(90deg, var(--brand), #4ade80, var(--brand))",
            backgroundSize: "200% 100%",
            animation: "agroProgressPulse 0.9s linear infinite",
            boxShadow: "0 1px 6px rgba(35, 92, 42, 0.45)",
          }}
        />
      )}

      <nav className="nav" aria-label="Menu principal">
        {groups.map((g) => {
          if (g.items.length === 0) return null;
          const isOpen = openGroup === g.title;
          const safeId = g.title.toLowerCase().replace(/[^a-z0-9]/g, "-");
          const buttonId = `nav-group-btn-${safeId}`;
          const contentId = `nav-group-content-${safeId}`;

          return (
            <div key={g.title} className="nav-group">
              <button
                type="button"
                id={buttonId}
                className={`nav-group-btn ${isOpen ? "open" : ""}`}
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => handleGroupToggle(g.title)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    handleGroupToggle(g.title);
                  }
                }}
              >
                <span className="nav-group-title-text">{g.title}</span>
                <svg
                  className={`nav-group-chevron ${isOpen ? "open" : ""}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <div
                id={contentId}
                role="region"
                aria-labelledby={buttonId}
                className={`nav-group-content ${isOpen ? "open" : ""}`}
                aria-hidden={!isOpen}
              >
                <div className="nav-group-inner">
                  {g.items.map((n) => {
                    const isActive = optimisticKey === n.key;
                    return (
                      <Link
                        key={n.key}
                        href={n.href}
                        prefetch={true}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.preventDefault();
                          setOptimisticKey(n.key);
                          onNavigate?.();
                          // Fecha gaveta mobile se estiver aberta
                          const toggle = document.getElementById("navtoggle") as HTMLInputElement | null;
                          if (toggle && toggle.checked) toggle.checked = false;
                          startTransition(() => {
                            router.push(n.href);
                          });
                        }}
                        className={"nav-item" + (isActive ? " active" : "")}
                        style={{
                          transition: "background 0.14s ease, color 0.14s ease, transform 0.1s ease",
                        }}
                      >
                        <NavIcon name={n.key} />
                        <span style={{ flex: 1 }}>{n.label}</span>
                        {isPending && optimisticKey === n.key && currentKey !== n.key && (
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              border: "2px solid currentColor",
                              borderTopColor: "transparent",
                              display: "inline-block",
                              animation: "agroSpin 0.55s linear infinite",
                            }}
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}
