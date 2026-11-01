export const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  gerente: "Gerente",
  veterinario: "Veterinário",
  zootecnista: "Zootecnista",
  funcionario: "Funcionário",
  operador: "Operador",
  visualizacao: "Visualização",
};
export const ROLE_ORDER = ["administrador", "gerente", "veterinario", "zootecnista", "funcionario", "operador", "visualizacao"];
export const roleLabel = (n: string) => ROLE_LABEL[n] ?? n;
