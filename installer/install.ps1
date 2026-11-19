<#
.SYNOPSIS
  Esqueleto de instalación NEXUS en Windows 11 (modo offline).
.DESCRIPTION
  Debe ejecutarse desde paquete offline firmado/verificado. No descarga dependencias.
  Pasos previstos: copiar binarios, crear directorios, inicializar Postgres, generar secretos,
  configurar Synapse, registrar servicios/supervisor, health checks.
  NOTA: completar con rutas reales del paquete, manejo de errores, rollback y registro de instalación.
#>
param(
  [string]$InstallDir = "$env:ProgramFiles\NEXUS",
  [string]$DataDir = "$env:ProgramData\NEXUS\data",
  [ValidateSet('Local','Lan')][string]$Mode = 'Local',
  [string]$ServerName = 'nexus.local',
  [string]$BindAddress = '127.0.0.1',
  [int]$Port = 8008
)

$ErrorActionPreference = 'Stop'
Write-Host "[NEXUS] Instalación (esqueleto) Mode=$Mode InstallDir=$InstallDir DataDir=$DataDir"

# 1) Verificar integridad del paquete (manifest + firmas) - TODO
# 2) Crear directorios
New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir, "$DataDir\pg", "$DataDir\synapse", "$DataDir\media", "$DataDir\logs", "$DataDir\backups" | Out-Null

# 3) Copiar binarios/runtimes desde payload del paquete - TODO
#    (incluye app\nexus-app.exe, app\icon.ico y scripts\*.ps1 del paquete portable)
# 4) Inicializar PostgreSQL y BD - TODO (initdb, crear usuario/DB)
# 5) Generar secretos y homeserver.yaml desde plantillas - TODO
# 6) Registrar servicio/supervisor (Windows Service / tarea programada / proceso) - TODO
# 7) Health checks - TODO
# 8) Acceso directo en el escritorio (ya implementado en scripts\nexus-create-shortcut.ps1)
#    Tras copiar binarios a $InstallDir:
#      & "$InstallDir\scripts\nexus-create-shortcut.ps1" -AppExe "$InstallDir\app\nexus-app.exe"
#    Usar -AllUsers desde un instalador con privilegios para crear el acceso en el escritorio público.

Write-Host "[NEXUS] Esqueleto completado. Implementar pasos marcados TODO para instalador funcional."
