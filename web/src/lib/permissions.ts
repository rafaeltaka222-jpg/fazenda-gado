export type FarmItem = {
  membershipId: string;
  role: string;
  id: string;
  code: string;
  name: string;
  permissions?: string[];
};

export const ALL_RESOURCES = [
  "farms",
  "users",
  "roles",
  "animals",
  "lots",
  "pastures",
  "movements",
  "weighings",
  "imports",
  "reports",
  "settings",
  "health",
  "reproduction",
  "counts",
  "tasks",
  "inventory",
  "costs",
  "people",
  "trade",
];

export const ALL_ACTIONS = ["view", "create", "update", "delete", "export", "print", "import"];

export const ADMIN_PERMS: string[] = [
  ...ALL_RESOURCES.flatMap((r) => ALL_ACTIONS.map((a) => `${r}.${a}`)),
  "audit.view",
  "reports.builder",
];

export function resolveRolePermissions(role: string, dbPerms?: string[] | null): string[] {
  if (dbPerms && dbPerms.length > 0) return dbPerms;

  // Matriz de Acesso Oficial (JR Com. e Exp. de Café · Versão de 03/11/2026)
  // Administrador: Acesso Total
  if (role === "administrador") return ADMIN_PERMS;

  // Gerente: E na maioria; V em Sanidade e Reprodução; SEM ACESSO a Equipe & Perfis (users.*)
  if (role === "gerente") {
    return [
      "animals.view", "animals.create", "animals.update", "animals.delete", "animals.export", "animals.print", "animals.import",
      "lots.view", "lots.create", "lots.update", "lots.delete",
      "pastures.view", "pastures.create", "pastures.update", "pastures.delete",
      "movements.view", "movements.create", "movements.update",
      "weighings.view", "weighings.create", "weighings.update", "weighings.export", "weighings.import",
      "imports.view", "imports.create",
      "health.view",
      "reproduction.view",
      "inventory.view", "inventory.create", "inventory.update",
      "stock.view", "stock.create", "stock.update",
      "counts.view", "counts.create", "counts.update",
      "trade.view", "trade.create", "trade.update",
      "costs.view", "costs.create", "costs.update",
      "reports.view", "reports.export", "reports.print",
      "tasks.view", "tasks.create", "tasks.update",
      "people.view", "people.create", "people.update",
      "farms.view", "farms.update",
      "settings.view",
    ];
  }

  // Veterinário: E em Sanidade e Reprodução; V em Animais, Pesagens, Estoque, Contagem, Relatórios; SEM ACESSO a Vendas, Custos, Equipe
  if (role === "veterinario") {
    return [
      "animals.view",
      "lots.view",
      "pastures.view",
      "movements.view",
      "weighings.view",
      "health.view", "health.create", "health.update", "health.delete",
      "reproduction.view", "reproduction.create", "reproduction.update",
      "inventory.view", "stock.view",
      "counts.view",
      "reports.view", "reports.print",
      "tasks.view", "tasks.create", "tasks.update",
      "farms.view",
    ];
  }

  // Zootecnista: E em Pesagens, Reprodução, Nutrição/Estoque; V em Animais, Sanidade, Contagem, Relatórios; SEM ACESSO a Vendas, Custos, Equipe
  if (role === "zootecnista") {
    return [
      "animals.view",
      "lots.view",
      "pastures.view",
      "movements.view",
      "weighings.view", "weighings.create", "weighings.update", "weighings.import",
      "health.view",
      "reproduction.view", "reproduction.create", "reproduction.update",
      "inventory.view", "inventory.create", "inventory.update",
      "stock.view", "stock.create", "stock.update",
      "counts.view",
      "reports.view", "reports.print",
      "tasks.view", "tasks.create", "tasks.update",
      "farms.view",
    ];
  }

  // Operador / Cuidador: E em Pesagens e Contagem de Curral; V em Animais, Sanidade, Nutrição; SEM ACESSO a Reprodução, Vendas, Custos, Relatórios, Equipe
  if (role === "operador" || role === "cuidador" || role === "funcionario") {
    return [
      "animals.view",
      "lots.view",
      "pastures.view",
      "weighings.view", "weighings.create", "weighings.import",
      "health.view",
      "inventory.view", "stock.view",
      "counts.view", "counts.create", "counts.update",
      "tasks.view", "tasks.update",
      "farms.view",
    ];
  }

  return ALL_RESOURCES.map((r) => `${r}.view`);
}
