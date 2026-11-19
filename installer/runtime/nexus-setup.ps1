<#
.SYNOPSIS
  Provisión inicial de NEXUS en Windows 11 (MODO LOCAL o LAN) usando el paquete portable.
.DESCRIPTION
  Crea la estructura de datos, inicializa la base de datos PostgreSQL, genera claves y la
  configuración del homeserver Matrix (sin federación) y escribe %ProgramData%\NEXUS\config\nexus.json.

  Requisitos: PostgreSQL 17 instalado y su servicio en ejecución (el paquete NO lo instala todavía).
  No descarga nada de Internet.
.EXAMPLE
  .\nexus-setup.ps1 -PgSuperPassword $pgPassword -ServerName nexus.local
.EXAMPLE
  .\nexus-setup.ps1 -Mode Lan -BindAddress 192.168.1.50 -ServerName nexus.lan
#>
param(
  [ValidateSet('Local','Lan')][string]$Mode = 'Local',
  [string]$DataDir = "$env:ProgramData\NEXUS\data",
  [string]$ConfigDir = "$env:ProgramData\NEXUS\config",
  [string]$ServerName = 'nexus.local',
  [string]$BindAddress = '127.0.0.1',
  [int]$Port = 8008,
  [string]$PgHost = '127.0.0.1',
  [int]$PgPort = 5432,
  [string]$PgSuperUser = 'postgres',
  [string]$PgSuperPassword = '',
  [string]$PgAppUser = 'nexus',
  [string]$PgAppPassword = '',
  [string]$PgDatabase = 'nexus',
  [switch]$SkipDatabase
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
Assert-NexusEndpoint $Mode $BindAddress $Port
if ($PgPort -lt 1 -or $PgPort -gt 65535) { throw 'Puerto PostgreSQL inválido.' }
if ($ServerName -cnotmatch '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$') {
  throw 'Dominio Matrix inválido.'
}
foreach ($identifier in @($PgAppUser, $PgDatabase)) {
  if ($identifier -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') { throw 'Usa identificadores PostgreSQL simples en minúsculas.' }
}
$DataDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DataDir)
$ConfigDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigDir)
$cfgPath = Join-Path $ConfigDir 'nexus.json'
if ((Test-Path -LiteralPath $cfgPath) -or (Test-Path -LiteralPath (Join-Path $DataDir 'homeserver\dendrite.yaml'))) {
  throw 'Ya existe una instancia provisionada. Usa nexus-admin.ps1 o nexus-configure.ps1 para cambiar la red.'
}

Write-Host "[NEXUS] Provisión: Mode=$Mode Server=$ServerName Bind=$BindAddress`:$Port Data=$DataDir"

# --- 1. Estructura de directorios ---
$hsDir = Join-Path $DataDir 'homeserver'
foreach ($d in @($DataDir, $hsDir, (Join-Path $DataDir 'media'), (Join-Path $DataDir 'logs'), (Join-Path $DataDir 'backups'), (Join-Path $hsDir 'log'), $ConfigDir)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}
Write-Host "[NEXUS] Directorios creados."

# --- 2. Herramientas del paquete ---
function Find-Tool([string]$name) {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\homeserver\$name"),
    (Join-Path $PSScriptRoot $name)
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return (Resolve-Path $c).Path } }
  throw "No se encontró $name en el paquete."
}
$genKeys = Find-Tool 'generate-keys.exe'
$genConfig = Find-Tool 'generate-config.exe'

# --- 3. PostgreSQL: rol y base de datos ---
$pgReady = $false
$pgReady = Test-NexusTcp $PgHost $PgPort

$dbUri = $null
if (-not $SkipDatabase) {
  if (-not $pgReady) {
    throw "PostgreSQL no responde en ${PgHost}:${PgPort}. Inicia el servicio (p. ej. Start-Service postgresql-X64-17) o usa -SkipDatabase."
  }
  $psql = $null
  $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($cmd) { $psql = $cmd.Source }
  if (-not $psql) {
    foreach ($p in @("$env:ProgramFiles\PostgreSQL\17\bin\psql.exe", "$env:ProgramFiles\PostgreSQL\16\bin\psql.exe")) {
      if (Test-Path $p) { $psql = $p; break }
    }
  }
  if (-not $psql) { throw "No se encontró psql.exe. Añade PostgreSQL al PATH o pasa -SkipDatabase y crea la BD manualmente." }

  $hasAppPassword = [bool]$PgAppPassword
  if (-not $hasAppPassword) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $PgAppPassword = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    Write-Host "[NEXUS] Contraseña generada para el usuario de BD '$PgAppUser' (se guarda en la config del homeserver)."
  }
  $previousPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $PgSuperPassword
    $psqlArgs = @('-X', '-w', '-h', $PgHost, '-p', $PgPort, '-U', $PgSuperUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
    $role = & $psql @psqlArgs -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PgAppUser'"
    if ($LASTEXITCODE -ne 0) { throw 'Falló la consulta de roles PostgreSQL.' }
    if ($role -eq '1') {
      if (-not $hasAppPassword) {
        throw "El rol '$PgAppUser' ya existe. Indica su contraseña con -PgAppPassword o usa otro rol."
      }
    } else {
      $quoted = $PgAppPassword.Replace("'", "''")
      "SET standard_conforming_strings = on; CREATE ROLE `"$PgAppUser`" LOGIN PASSWORD '$quoted';" | & $psql @psqlArgs | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Falló la creación del rol PostgreSQL.' }
    }
    $exists = & $psql @psqlArgs -tAc "SELECT 1 FROM pg_database WHERE datname='$PgDatabase'"
    if ($LASTEXITCODE -ne 0) { throw 'Falló la consulta de bases PostgreSQL.' }
    if ($exists -ne '1') {
      & $psql @psqlArgs -c "CREATE DATABASE `"$PgDatabase`" OWNER `"$PgAppUser`";" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Falló la creación de la base PostgreSQL.' }
    }
    $env:PGPASSWORD = $PgAppPassword
    & $psql -X -w -h $PgHost -p $PgPort -U $PgAppUser -d $PgDatabase -tAc 'SELECT 1' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Falló la conexión con el rol de NEXUS.' }
  } finally { $env:PGPASSWORD = $previousPassword }
  $encodedPassword = [uri]::EscapeDataString($PgAppPassword)
  $dbUri = "postgres://${PgAppUser}:${encodedPassword}@${PgHost}:${PgPort}/${PgDatabase}?sslmode=disable"
} else {
  Write-Host "[NEXUS] -SkipDatabase: no se toca PostgreSQL."
}

# --- 4. Claves y configuración del homeserver ---
$keyFile = Join-Path $hsDir 'matrix_key.pem'
if (-not (Test-Path $keyFile)) {
  Push-Location $hsDir
  try {
    & $genKeys -private-key 'matrix_key.pem' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar la clave Matrix.' }
  } finally { Pop-Location }
  Write-Host "[NEXUS] Clave de firma generada."
}
$hsConfig = Join-Path $hsDir 'dendrite.yaml'
if ($dbUri) {
  $tmp = Join-Path $env:TEMP ("dendrite-{0}.yaml" -f ([guid]::NewGuid()))
  Push-Location $hsDir
  try {
    & $genConfig -server $ServerName -dir $hsDir -db $dbUri | Out-File -FilePath $tmp -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar la configuración de Dendrite.' }
  } finally { Pop-Location }

  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
  $yaml = Get-Content $tmp -Raw
  $yaml = $yaml -replace 'disable_federation: false', 'disable_federation: true'
  $yaml = Enable-NexusLocalPresence $yaml
  $yaml = $yaml -replace 'max_file_size_bytes: 10485760', 'max_file_size_bytes: 52428800'
  $yaml = $yaml -replace 'private_key: matrix_key.pem', "private_key: $($keyFile.Replace('\','/'))"
  $yaml = $yaml -replace 'registration_shared_secret: ""', "registration_shared_secret: `"$secret`""
  # Sin BOM: algunos lectores YAML/JSON fallan con BOM UTF-8 (PowerShell 5.1 -Encoding utf8 lo añade).
  [System.IO.File]::WriteAllText($hsConfig, $yaml, (New-Object System.Text.UTF8Encoding($false)))
  Remove-Item $tmp -Force
  Write-Host "[NEXUS] Configuración del homeserver generada: $hsConfig"
} else {
  Write-Warning 'Directorios preparados. Ejecuta la provisión con conexión a PostgreSQL para completar la instalación.'
  return
}

# --- 5. Configuración del supervisor y del cliente ---
$nexusCfg = [ordered]@{
  mode             = $Mode.ToLower()
  data_dir         = $DataDir
  homeserver_bind  = $BindAddress
  homeserver_port  = $Port
  server_name      = $ServerName
  pg_host          = $PgHost
  pg_port          = $PgPort
}
$cfgPath = Join-Path $ConfigDir 'nexus.json'
# Sin BOM: los lectores JSON (Rust/serde_json) fallan con BOM UTF-8.
[System.IO.File]::WriteAllText($cfgPath, ($nexusCfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[NEXUS] Configuración de NEXUS escrita: $cfgPath"

# --- 6. Resumen de siguientes pasos ---
Write-Host ""
Write-Host "[NEXUS] Provisión completada. Siguientes pasos:"
Write-Host "  1) Abre NEXUS-Administracion.cmd, inicia el servidor y crea una cuenta."
Write-Host "  2) Abre NEXUS y entra a http://${BindAddress}:${Port} con el dominio $ServerName."
if ($Mode -eq 'Lan') {
  Write-Host "  LAN: permite el puerto $Port en el Firewall de Windows y usa la IP privada en los clientes."
}
