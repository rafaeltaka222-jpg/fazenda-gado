# Backup do banco LOCAL (Docker). Uso: .\scripts\backup.ps1
param(
  [string]$Container = "supabase_db_fazenda-gado",
  [string]$Out = ".\backups"
)
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$name = "fazenda-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump"
docker exec $Container sh -c "pg_dump -U postgres -d postgres -Fc --no-owner -f /tmp/backup.dump"
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao gerar o backup. O Supabase local está rodando?"; exit 1 }
docker cp "${Container}:/tmp/backup.dump" (Join-Path $Out $name)
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao copiar o backup."; exit 1 }
Write-Host "Backup salvo em $(Join-Path $Out $name)"
