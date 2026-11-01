import Link from "next/link";
import FarmSelect from "./FarmSelect";
import { createClient } from "@/lib/supabase/server";
import type { FarmItem } from "@/lib/context";

type Item = { href: string; label: string; key: string; perm: string | null };
// perm = permissão necessária para o item aparecer (null = sempre). O banco continua sendo a barreira real.
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Abrir menu" />
        <label htmlFor="navtoggle" className="burger">
          <span>Fazenda Gado</span>
          <span aria-hidden="true">☰ Menu</span>
        </label>
        <div className="brand">Fazenda Gado</div>
        <nav className="nav" aria-label="Menu principal">
          {GROUPS.map((g) => {
            const items = g.items.filter(show);
            if (items.length === 0) return null;
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{g.title}</div>
                {items.map((n) => (
                  <Link key={n.key} href={n.href} className={"nav-item" + (n.key === current ? " active" : "")}>
                    {n.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <FarmSelect farms={farms} activeId={active?.id ?? ""} />
          <form action="/search" method="get" role="search" className="searchbox">
            <input name="q" type="search" minLength={2} placeholder="Buscar brinco, nome, lote, pasto..." aria-label="Busca global" />
          </form>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="muted">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="btn ghost">Sair</button>
            </form>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
