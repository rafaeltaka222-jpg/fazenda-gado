# Segurança

## Controles implementados
| Ameaça | Controle |
|---|---|
| Acesso entre fazendas (IDOR) | RLS em todas as tabelas + FKs compostas por fazenda; testes de isolamento |
| Escalada de privilégios | Gatilho impede conceder perfil com permissões que quem concede não tem; último administrador protegido |
| Mass assignment | Privilégios por coluna: só colunas permitidas são graváveis pela API; lote/pasto/situação só por função |
| SQL Injection | Funções com parâmetros; relatórios usam catálogo fixo de campos e valores escapados; testes de injeção |
| XSS | React escapa o conteúdo; sem HTML dinâmico; texto longo tratado como texto |
| CSRF | Cookies SameSite do Supabase; ações do Next.js; rotas POST conferem a origem |
| Força bruta / enumeração | Mensagens genéricas no login; limites do Supabase Auth; API com 120 req/min por chave |
| Sessão | Cookies HttpOnly geridos pelo Supabase; renovação automática (proxy); 2FA TOTP |
| Adulteração de logs | Auditoria sem UPDATE/DELETE, encadeada por hash, verificação na tela |
| Segredos | Chave `secret` do Supabase nunca no código; só `NEXT_PUBLIC_*` (chave pública) no site; chaves de API guardadas como hash |
| Dados históricos | Eventos imutáveis; correção por anulação com motivo e usuário |
| LGPD (parte técnica) | Controle de acesso, auditoria, permissão por campo; falta: política de retenção, exportação e anonimização sob pedido |

## Limites conhecidos (TODO)
- 2FA é exigido pela aplicação, não pelo banco. Chamadas diretas à API do Supabase com sessão sem 2FA não são barradas pelo banco.
- Sem códigos de recuperação do 2FA e sem lista de sessões em outros dispositivos (troca e recuperação de senha existem: ver CONTA.md).
- Chaves de API inválidas não têm limite por IP.
- Upload de arquivos: só leitura em memória de TXT/CSV até 5 MB; antivírus não aplicável porque nada é armazenado.
- Cabeçalhos de segurança (CSP, HSTS) devem ser configurados no deploy (Vercel) — ver DEPLOY.md.
- A parte jurídica da LGPD (base legal, termos, encarregado) exige revisão de profissional de direito.
- Revisar dependências: `npm audit` mostrou vulnerabilidades nas dependências padrão; tratar antes de produção.
