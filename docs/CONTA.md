# Conta: recuperar senha, trocar senha e cabeçalhos de segurança

## Esqueci a senha (teste local)
1. Em `supabase/config.toml`, na seção `[auth]`, confira que:
   ```
   site_url = "http://localhost:3000"
   additional_redirect_urls = ["http://localhost:3000/**"]
   ```
   Depois reinicie: `npx supabase stop` e `npx supabase start`.
2. Na tela de login, clique em **Esqueci a senha** e informe o e-mail.
3. O e-mail de teste aparece no Mailpit: http://127.0.0.1:54324. Abra o link **no mesmo navegador** em que pediu a recuperação.
4. Defina a nova senha. Em produção, configure SMTP próprio e inclua o endereço do site em Redirect URLs (veja DEPLOY.md).

## Trocar senha
Em **Segurança (2FA)** > Trocar senha.

## Cabeçalhos de segurança (recomendado antes de publicar)
Em `web/next.config.ts`, dentro do objeto `nextConfig`, acrescente:
```ts
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    },
  ];
},
```
A `Content-Security-Policy` ainda é TODO: precisa ser testada com o Next.js e com o QR code do 2FA (imagem `data:`).

## Limites conhecidos
Sem códigos de recuperação do 2FA; sem lista de sessões em outros dispositivos; recuperação de senha depende do e-mail configurado.
