# Backup e recuperação

## O que proteger
Banco PostgreSQL (todos os dados e a auditoria). O site não guarda dados. Arquivos importados não são armazenados.

## Supabase na nuvem
Os recursos de backup dependem do plano contratado (backups diários, recuperação a um instante exato como complemento).
**Confira no painel do projeto, em Database > Backups, o que o seu plano oferece** e não presuma proteção que não esteja ativa.
Além do backup do provedor, mantenha uma cópia sua, fora do provedor:
```powershell
npx supabase db dump --linked -f backup-schema.sql
npx supabase db dump --linked --data-only -f backup-dados.sql
```
Guarde os arquivos criptografados (ex.: 7-Zip com senha) em outro local, com credenciais diferentes.

## Banco local (desenvolvimento)
`scripts/backup.ps1` gera um backup do banco local em `backups/` (formato custom do pg_dump).

Restaurar em um banco limpo (Docker):
```powershell
docker cp .\backups\ARQUIVO.dump supabase_db_fazenda-gado:/tmp/r.dump
docker exec supabase_db_fazenda-gado pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/r.dump
```

## Metas (a confirmar com você)
Proposta do projeto: perda máxima de 15 minutos e retorno em até 4 horas. Só é viável com recuperação a um instante exato ativa.
Sem ela, a perda máxima é o intervalo entre backups.

## Teste de restauração (mensal)
1. Restaure o backup mais recente em um projeto/banco separado.
2. Confira contagens (animais, pesagens, eventos) contra o ambiente de origem.
3. Entre no site apontando para o banco restaurado e use **Auditoria > Verificar integridade do registro**: deve indicar cadeia íntegra.
4. Registre data, resultado e responsável.

## Cenários
| Cenário | Ação |
|---|---|
| Registro apagado/alterado por engano | Eventos são imutáveis e há anulação; dados históricos ficam na auditoria |
| Corrupção ou exclusão em massa | Restaurar o backup mais recente e reaplicar o que for posterior pela auditoria |
| Perda do provedor | Restaurar a cópia externa em um novo projeto e atualizar as variáveis na Vercel |
| Credenciais vazadas | Trocar senhas e chaves no painel do Supabase, revogar chaves de API, revisar a auditoria |

## Limites conhecidos
Sem backup automático próprio agendado (use o do provedor + script manual/agendado do Windows); sem cópia externa automatizada.
