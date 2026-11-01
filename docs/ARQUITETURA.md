# Arquitetura

## Visão geral
```
Navegador ── Next.js (Vercel) ── Supabase Auth (login, sessão, 2FA)
                 │
                 └── Supabase Postgres  ← regras, permissões (RLS), auditoria e validações vivem aqui
Sistemas externos ── /api/v1 (chave de API) ─┘
```
- **Frontend e servidor web:** Next.js (TypeScript). As páginas chamam funções do banco; não há regra de negócio só na tela.
- **Banco:** PostgreSQL (Supabase). Toda tabela de negócio tem `farm_id`; a RLS (Row-Level Security) limita cada consulta às
  fazendas do usuário e às permissões do perfil. Chaves estrangeiras compostas `(farm_id, id)` impedem apontar para outra fazenda.
- **Escritas críticas** (movimentação, pesagem, estoque, sanidade, importação) são funções SQL que validam e gravam em uma
  única transação. Eventos são imutáveis: correção = anulação com motivo.
- **Auditoria:** tabela somente-inserção, gravada por gatilhos na mesma transação, com cadeia de hash verificável na tela.

## Diferenças em relação à análise inicial (PDF)
| Análise inicial | Protótipo | Motivo |
|---|---|---|
| Django + DRF | Next.js + funções SQL | Chegar rápido a algo demonstrável com Vercel + Supabase |
| Login próprio (Argon2id) | Supabase Auth (bcrypt) + 2FA TOTP | Menos código de segurança próprio |
| Celery + Redis | Sem fila ainda | Consultas e importações rodam na hora (limites documentados) |
| S3/MinIO | Sem upload persistente | Arquivos importados são lidos e descartados; o hash fica no histórico |
| AWS | Vercel + Supabase | Migração para AWS continua possível: o modelo e as regras estão no PostgreSQL |

## Módulos (migrações)
1 núcleo e permissões · 2 auditoria · 3 rebanho · 4 movimentações · 5 pesagens · 6 importação · 7 painel · 8 relatórios ·
9 usuários e auditoria · 10 sanidade · 11 campos personalizados · 12 segurança · 13 estoque e custos · 14 API · 15 reprodução e genealogia · 16 pessoas e vendas · 17 evolução do peso e busca · 18 contagem do rebanho · 19 tarefas.

## Campos personalizados (decisão técnica)
Modelo híbrido: campos nucleares são colunas reais; campos criados pelo administrador ficam em `animals.custom` (JSONB),
descritos por `field_definitions`. EAV puro foi descartado (relatórios lentos, sem tipos no banco). A coluna `custom` não é
legível nem gravável diretamente: leitura e escrita passam por funções que aplicam validação e permissão por campo.

## Limites conhecidos
Sem fila de tarefas; sem índices por expressão nos campos personalizados; exportação em Excel/PDF por geradores próprios simples (uma aba, fonte padrão); relatórios só sobre animais; sem webhooks de saída;
reprodução sem estação de monta e sem calendário por categoria; vendas sem estorno e sem GTA; desempenho com 100 mil animais ainda não medido (ver `supabase/load_test`).
