import { redirect } from "next/navigation";
import { getContext, resolveRolePermissions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { createSale, voidSale } from "./actions";


const ERR: Record<string, string> = {
  tags: "Algum brinco não foi encontrado entre os animais ativos.",
  comprador: "Comprador inválido (precisa ter o papel Comprador em Pessoas).",
  perm: "Você não tem permissão para realizar esta operação comercial.",
  estorno: "Não foi possível estornar a venda. Informe o motivo (mínimo de 3 caracteres).",
  falha: "Não foi possível registrar a venda. Confira brincos, data (não pode ser futura) e valor.",
};
const money = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const a = ctx.active;
  const shell = { email: ctx.user.email ?? "", farms: ctx.farms, active: a, current: "sales" };

  if (!a) {
    return (
      <AppShell {...shell}>
        <h1 className="title">Gestão Comercial & Vendas</h1>
        <div className="card">Crie uma fazenda primeiro, na página Fazendas.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const perms: string[] = a.permissions ?? resolveRolePermissions(a.role);
  if (!perms.includes("trade.view")) {
    redirect("/dashboard?erro=sem_permissao");
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
  const de = sp.de && DATE.test(sp.de) ? sp.de : today.slice(0, 8) + "01";
  const ate = sp.ate && DATE.test(sp.ate) ? sp.ate : today;

  const [sum, list, buyers] = await Promise.all([
    supabase.rpc("sales_summary", { p_farm: a.id, p_from: de, p_to: ate }),
    supabase
      .from("sales")
      .select("id, sale_date, buyer_id, total_amount, animal_count, document, voided_at, void_reason")
      .eq("farm_id", a.id)
      .gte("sale_date", de)
      .lte("sale_date", ate)
      .order("sale_date", { ascending: false })
      .limit(40),
    supabase.from("people").select("id, name").eq("farm_id", a.id).eq("active", true).contains("person_roles", ["comprador"]).order("name"),
  ]);

  const s: any = sum.data ?? { total: 0, sales: 0, animals: 0, avg_per_head: null, by_buyer: [] };
  const rows: any[] = list.data ?? [];
  const buyerName = (id: string | null) => (id ? (buyers.data ?? []).find((b: any) => b.id === id)?.name ?? "—" : "Não informado");
  const canCreate = perms.includes("trade.create");
  const canVoid = perms.includes("trade.update") || perms.includes("trade.delete");

  return (
    <AppShell {...shell}>
      <div className="head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 28, background: "#10b981", borderRadius: 4, flexShrink: 0 }} />
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Gestão Comercial: Vendas & Emissão GTA
            </h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              Registro de comercialização de lotes, faturamento, documentação fiscal e guias sanitárias
            </p>
          </div>
        </div>
      </div>

      {sp.ok === "1" && (
        <div className="flash">
          Venda comercial registrada com sucesso e integrada automaticamente ao módulo de Contas a Receber.
        </div>
      )}
      {sp.ok === "estornado" && (
        <div className="flash">
          Venda estornada com sucesso. Os animais retornaram automaticamente ao rebanho ativo e a auditoria foi registrada.
        </div>
      )}
      {sp.erro && <div className="flash bad" role="alert">{ERR[sp.erro] ?? ERR.falha}</div>}

      {/* Filtro por Período */}
      <form className="card filters" method="get" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <label>Data Inicial<input type="date" name="de" defaultValue={de} /></label>
          <label>Data Final<input type="date" name="ate" defaultValue={ate} /></label>
          <button className="btn" style={{ height: 42 }}>Filtrar Período</button>
        </div>
      </form>

      {/* Métricas Comerciais */}
      <div className="grid">
        <div className="card" style={{ borderLeft: "4px solid #059669" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Faturamento Líquido no Período</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--brand)" }}>{money(s.total)}</div>
          <small className="muted">{s.sales} operação(ões) ativa(s)</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #0284c7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Animais Comercializados</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="big" style={{ color: "#0284c7" }}>{s.animals} <span style={{ fontSize: 16 }}>cab.</span></div>
          <small className="muted">Baixas efetivas no rebanho</small>
        </div>

        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <small className="muted">Valor Médio por Cabeça</small>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div className="big" style={{ color: "var(--amber)" }}>{s.avg_per_head == null ? "—" : money(s.avg_per_head)}</div>
          <small className="muted">Preço médio de comercialização</small>
        </div>
      </div>

      {/* Formulário de Nova Venda */}
      {canCreate && (
        <form action={createSale} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong>Registrar Nova Venda Comercial</strong>
            <span className="badge">Rastreabilidade Auditada</span>
          </div>
          <div className="form2">
            <label style={{ gridColumn: "1 / -1" }}>
              Identificação dos Brincos Vendidos (separados por vírgula ou espaço) *
              <textarea name="tags" rows={3} required placeholder="Ex: 000101, 000102, 000103, 000104" style={{ fontFamily: "monospace" }} />
            </label>
            <label>Data da Negociação *<input name="date" type="date" defaultValue={today} max={today} required /></label>
            <label>Data de Vencimento (Contas a Receber) *<input name="due_date" type="date" defaultValue={today} required /></label>
            <label>Cliente / Comprador
              <select name="buyer_id" defaultValue="">
                <option value="">(Selecione um comprador cadastrado)</option>
                {(buyers.data ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Forma de Recebimento
              <select name="payment_method" defaultValue="Transferência TED/PIX">
                <option value="Transferência TED/PIX">Transferência TED / PIX</option>
                <option value="Pix">Pix</option>
                <option value="Boleto">Boleto Bancário</option>
                <option value="Cheque">Cheque</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </label>
            <label>Valor Total Negociado (R$) *<input name="total" inputMode="decimal" required placeholder="Ex: 48500,00" /></label>
            <label>Documentação (GTA / Nota Fiscal)<input name="document" placeholder="Ex: GTA 482910 / NF-e 12903" /></label>
            <label style={{ gridColumn: "1 / -1" }}>Observações e Condições Comerciais<input name="notes" placeholder="Ex: Frigorífico Boi Bom, pagamento à vista" /></label>
            <div style={{ alignSelf: "end", gridColumn: "1 / -1" }}>
              <ConfirmSubmit className="btn" label="Concluir e Registrar Venda" message="Confirmar a venda dos animais listados? Eles receberão baixa automática do rebanho ativo com registro contábil e de rastreabilidade." />
            </div>
          </div>
        </form>
      )}

      {/* Histórico de Vendas */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>Livro de Vendas do Período ({rows.length})</strong>
          <span className="badge neutral">Rastreabilidade Comercial</span>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>Nenhuma venda comercial registrada no período selecionado.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Quantidade</th>
                  <th>Comprador / Destino</th>
                  <th>Documento (GTA / NF)</th>
                  <th style={{ textAlign: "right" }}>Valor Total</th>
                  {canVoid && <th style={{ textAlign: "right" }}>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isVoided = !!r.voided_at;
                  return (
                    <tr key={r.id} style={isVoided ? { opacity: 0.6 } : undefined}>
                      <td>{fmtDate(r.sale_date)}</td>
                      <td>
                        {isVoided ? (
                          <span className="badge red" title={r.void_reason || "Venda estornada"}>
                            Estornada
                          </span>
                        ) : (
                          <span className="badge">Ativa</span>
                        )}
                      </td>
                      <td><strong>{r.animal_count} cab.</strong></td>
                      <td>{buyerName(r.buyer_id)}</td>
                      <td>
                        {r.document ? <span className="badge neutral">{r.document}</span> : <span className="muted">—</span>}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: isVoided ? "var(--muted)" : "var(--brand)", textDecoration: isVoided ? "line-through" : "none" }}>
                        {money(r.total_amount)}
                      </td>
                      {canVoid && (
                        <td style={{ textAlign: "right" }}>
                          {isVoided ? (
                            <span className="muted" style={{ fontSize: 12 }}>{r.void_reason ?? "Estornada"}</span>
                          ) : (
                            <form action={voidSale} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <input type="hidden" name="id" value={r.id} />
                              <input
                                type="text"
                                name="reason"
                                required
                                minLength={3}
                                placeholder="Motivo do estorno"
                                style={{ width: 150, padding: "5px 8px", fontSize: 12 }}
                              />
                              <ConfirmSubmit
                                className="btn ghost"
                                label="Estornar"
                                message="Confirmar o estorno desta venda? Os animais retornarão imediatamente ao rebanho ativo."
                              />
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
