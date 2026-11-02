# Deploy (Supabase na nuvem + Vercel)

> Primeira publicação: use **dados fictícios**. Itens de segurança pendentes estão em SEGURANCA.md.

## 1. Banco (Supabase)
1. Crie um projeto em supabase.com (região mais próxima, ex.: São Paulo). Guarde a senha do banco no seu gerenciador de senhas.
2. No PC: `npx supabase login`, depois `npx supabase link --project-ref SEU_REF` (o ref está na URL do painel).
3. Aplique as migrações: `npx supabase db push`. Confira no painel (Table Editor) se as tabelas existem.
4. Autenticação (Authentication > Providers/URL): defina **Site URL** com o endereço do site na Vercel e inclua-o nas **Redirect URLs**.
   Em produção, mantenha a confirmação de e-mail ligada e configure um SMTP próprio (o padrão do Supabase tem limite baixo).
5. Em Project Settings > API copie a **URL** e a chave **publishable**. A chave **secret** não é usada pelo site.

## 2. Site (Vercel)
1. Suba o projeto para um repositório privado no GitHub.
2. Na Vercel: Add New Project > importe o repositório > **Root Directory = `web`**.
3. Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `REQUIRE_ADMIN_2FA` (true recomendado).
4. Deploy. Abra o endereço, crie a conta e a primeira fazenda.

## 3. Cabeçalhos de segurança (configurados)
Em `web/next.config.ts` já estão configurados `headers()` com `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` e `Content-Security-Policy` compatível com QR code `data:` do 2FA e conexões `https://*.supabase.co` / `wss://*.supabase.co`.

## 4. Ambientes
Desenvolvimento = banco local (Docker). Homologação = segundo projeto Supabase + segundo projeto Vercel. Produção = terceiro par.
Nunca copie dados reais de produção para os outros ambientes sem anonimizar.

## 5. Atualizações do banco
Crie sempre uma nova migração em `supabase/migrations` (nunca edite uma já aplicada em produção), rode `npx supabase test db`
localmente e só então `npx supabase db push`. Faça backup antes (BACKUP.md).

## 6. Reversão
Site: na Vercel, promova a implantação anterior. Banco: restaure o backup (BACKUP.md); migrações não têm "desfazer" automático.
