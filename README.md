# Fazenda Gado — sistema web de gestão de fazendas de gado

Protótipo funcional (Next.js + Supabase/PostgreSQL). Multi-fazenda, com permissões por perfil, auditoria encadeada por hash,
rebanho, movimentações, pesagens, importação de arquivos, sanidade, estoque e custos, relatórios, campos personalizados e API.

## Estrutura
```
supabase/migrations/   banco de dados (tabelas, regras, RLS, funções) — a fonte da verdade das regras de negócio
supabase/tests/        testes do banco (pgTAP): isolamento entre fazendas, permissões, auditoria, injeção de SQL etc.
supabase/load_test/    carga de dados e consultas para medir desempenho
web/                   site (Next.js, TypeScript)
docs/                  arquitetura, segurança, deploy, backup, operação, API
scripts/               utilitários (backup)
.github/workflows/     integração contínua (testes do banco e build do site)
```

## Rodar no seu computador (Windows)
Requisitos: Node.js LTS, Git, Docker Desktop.
```powershell
cd C:\Projetos\fazenda-gado
npx supabase start            # sobe o banco local e aplica as migrações
npx supabase test db          # roda todos os testes do banco
cd web
copy .env.example .env.local  # e preencha a chave sb_publishable (npx supabase status)
npm install
npm run dev                   # http://localhost:3000
```
Zerar o banco local: `npx supabase db reset` (apaga os dados). Estúdio do banco: http://127.0.0.1:54323

## Documentação
- [Arquitetura](docs/ARQUITETURA.md) · [Segurança](docs/SEGURANCA.md) · [Deploy](docs/DEPLOY.md)
- [Backup e recuperação](docs/BACKUP.md) · [Operação e administração](docs/OPERACAO.md) · [API](docs/API.md) · [Conta e segurança](docs/CONTA.md) · [Demonstração](docs/DEMO.md)

## Estado
Veja a seção "Limites conhecidos" em cada documento. Nada é declarado como funcionando sem teste: o que depende de equipamento
(balança Coimma KM-3) ou de serviço externo (WhatsApp, e-mail) está marcado como TODO.
