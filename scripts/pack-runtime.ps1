<#
.SYNOPSIS
  Ensambla el paquete portable/preview de NEXUS en dist\NEXUS-win64 con binarios locales.
.DESCRIPTION
  Copia: app (nexus-app.exe, nexus-supervisor.exe), homeserver Matrix nativo (Dendrite) y scripts
  de provisión/arranque. Genera manifest.json con SHA-256 y LEEME.txt.

  IMPORTANTE: este paquete NO es todavía el instalador offline completo de docs/06: no incluye
  PostgreSQL empaquetado ni firma Authenticode. Sirve para validar el producto en Windows 11
  con PostgreSQL preinstalado.
.EXAMPLE
  .\scripts\pack-runtime.ps1
#>
param(
  [string]$OutDir = "C:\Proyecto\dist\NEXUS-win64",
  [string]$AppExe = "C:\Proyecto\.cargo-target\release\nexus-app.exe",
  [string]$SupervisorExe = "C:\Proyecto\nexus-supervisor\target\release\nexus-supervisor.exe",
  [string]$GoBin = "$env:USERPROFILE\go\bin"
)
$ErrorActionPreference = 'Stop'

foreach ($f in @($AppExe, $SupervisorExe)) {
  if (-not (Test-Path $f)) { throw "Falta $f. Compila la app/supervisor antes de empaquetar." }
}
$hsTools = @('dendrite.exe','generate-keys.exe','generate-config.exe','create-account.exe')
foreach ($t in $hsTools) {
  if (-not (Test-Path (Join-Path $GoBin $t))) { throw "Falta $t en $GoBin (go install github.com/matrix-org/dendrite/cmd/...)"; }
}

$OutDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
if (Test-Path -LiteralPath $OutDir) {
  $existing = Get-Item -LiteralPath $OutDir
  if (-not $existing.PSIsContainer -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      -not (Test-Path -LiteralPath (Join-Path $OutDir 'manifest.json') -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $OutDir 'app\nexus-app.exe') -PathType Leaf)) {
    throw "La ruta ya existe y no parece un paquete NEXUS: $OutDir"
  }
  Remove-Item -LiteralPath $existing.FullName -Recurse -Force
}
$appDir = Join-Path $OutDir 'app'
$hsDir = Join-Path $OutDir 'homeserver'
$scriptDir = Join-Path $OutDir 'scripts'
New-Item -ItemType Directory -Force -Path $appDir, $hsDir, $scriptDir | Out-Null

Copy-Item $AppExe $appDir
Copy-Item $SupervisorExe $appDir
$iconSrc = Join-Path $PSScriptRoot '..\nexus-app\src-tauri\icons\icon.ico'
if (Test-Path $iconSrc) { Copy-Item $iconSrc $appDir }
foreach ($t in $hsTools) { Copy-Item (Join-Path $GoBin $t) $hsDir }
Copy-Item (Join-Path $PSScriptRoot '..\installer\runtime\*.ps1') $scriptDir
Copy-Item (Join-Path $PSScriptRoot '..\installer\runtime\NEXUS-Administracion.cmd') $OutDir

# PowerShell 5.1 lee los .ps1 sin BOM como ANSI: reescribir con BOM para conservar acentos.
Get-ChildItem $scriptDir -Filter *.ps1 | ForEach-Object {
  $text = Get-Content $_.FullName -Raw -Encoding UTF8
  [System.IO.File]::WriteAllText($_.FullName, $text, (New-Object System.Text.UTF8Encoding($true)))
}

$version = (Get-Content (Join-Path $PSScriptRoot '..\nexus-app\src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
@"
NEXUS $version — paquete portable (preview) para Windows 11 x64
================================================================
Contenido
  app\nexus-app.exe          Cliente de escritorio (Tauri). Ejecutar para abrir NEXUS.
  NEXUS-Administracion.cmd  Consola del equipo que hospeda Matrix. Ejecutar desde ese equipo.
  app\icon.ico              Icono de la aplicación (acceso directo).
  app\nexus-supervisor.exe   Diagnóstico/provisión: status, init, paths.
  homeserver\*.exe           Homeserver Matrix nativo (Dendrite v0.13.8, Go) sin federación.
  scripts\*.ps1              Provisión, arranque, parada, usuarios, estado y acceso directo.

Requisitos en esta máquina
  - Windows 11 x64 con WebView2 (incluido en Windows 11).
  - PostgreSQL 17 instalado y su servicio en ejecución (este paquete aún no lo instala).
  - PowerShell 5.1+ (el incluido en Windows 11).

Puesta en marcha (PowerShell)
  1) .\scripts\nexus-setup.ps1 -PgSuperPassword '<clave del superusuario postgres>'
  2) Abrir NEXUS-Administracion.cmd e iniciar el servidor.
     Para activar presencia en un servidor ya instalado: Detener, Habilitar presencia e Iniciar.
  3) Crear dos cuentas Matrix en la consola.
  4) Abrir app\nexus-app.exe y entrar con una de esas cuentas:
       Homeserver: http://127.0.0.1:8008
       Usuario:    @ana:nexus.local
       Contraseña: la asignada a la cuenta
     Para el segundo usuario, abrir otra instancia/ventana y entrar como @beto:nexus.local.
     Crear DM con "@beto:nexus.local" o unirse a la misma sala.

Acceso directo en el escritorio
  .\scripts\nexus-create-shortcut.ps1            # crea NEXUS.lnk en el escritorio del usuario
  .\scripts\nexus-create-shortcut.ps1 -AllUsers  # para todos los usuarios (requiere administrador)

MODO LAN
  En Administración, detener el servidor, elegir LAN, indicar la IP privada y el puerto,
  aplicar e iniciar. Permitir ese puerto en el Firewall de Windows para la red institucional.
  En cada equipo cliente, elegir LAN e introducir la URL y el dominio Matrix de la consola.

Parar el servidor
  .\scripts\nexus-stop.ps1

Datos y configuración
  %ProgramData%\NEXUS\data       datos del homeserver (NO se borra al desinstalar)
  %ProgramData%\NEXUS\config     nexus.json (modo, bind, puertos, dominio)

Pendiente para ser el instalador definitivo (docs/06, docs/08)
  - Empaquetar PostgreSQL y servicio propio (sin asumir instalación previa).
  - Registrar servicios de Windows para homeserver y PostgreSQL (arranque automático).
  - Firma Authenticode, manifiesto verificado y actualización offline.
  - E2EE con almacenamiento seguro de claves, archivos cifrados y TLS en LAN.
"@ | Set-Content (Join-Path $OutDir 'LEEME.txt') -Encoding utf8

& (Join-Path $PSScriptRoot 'build-offline-manifest.ps1') -ArtifactsDir $OutDir -OutFile (Join-Path $OutDir 'manifest.json') | Out-Null

$total = (Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("[NEXUS] Paquete generado en {0} ({1:N1} MB)" -f $OutDir, $total)
Get-ChildItem $OutDir -Recurse -File | Select-Object @{n='rel';e={$_.FullName.Substring($OutDir.Length+1)}}, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
