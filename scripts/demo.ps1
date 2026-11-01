# Carrega dados de demonstração na fazenda do administrador (banco LOCAL, Docker).
# Uso:  .\scripts\demo.ps1 -Email seu@email.com [-N 120]
param(
  [Parameter(Mandatory = $true)][string]$Email,
  [int]$N = 120,
  [string]$Container = "supabase_db_fazenda-gado"
)
$seed = Join-Path $PSScriptRoot "..\supabase\demo\seed_demo.sql"
if (-not (Test-Path $seed)) { Write-Error "Arquivo não encontrado: $seed"; exit 1 }
docker cp $seed "${Container}:/tmp/seed_demo.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Não foi possível copiar o arquivo. O Supabase local está rodando?"; exit 1 }
docker exec $Container psql -U postgres -d postgres -v "email=$Email" -v "n=$N" -f /tmp/seed_demo.sql
