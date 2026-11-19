<#
.SYNOPSIS
  Esqueleto de desinstalación NEXUS.
.DESCRIPTION
  Detiene y elimina servicios/binarios registrados. NO elimina automáticamente los datos del usuario
  ($DataDir) salvo que se indique explícitamente en una opción separada y confirmada.
#>
param(
  [string]$InstallDir = "$env:ProgramFiles\NEXUS",
  [string]$DataDir = "$env:ProgramData\NEXUS\data",
  [switch]$RemoveUserData
)

$ErrorActionPreference = 'Stop'
Write-Host "[NEXUS] Desinstalación (esqueleto)"
# TODO: detener supervisor/servicios, eliminar registros de servicio, eliminar binarios de InstallDir.
if ($RemoveUserData) {
  Write-Warning "Eliminación de datos solicitada explícitamente: $DataDir (implementar borrado seguro)."
} else {
  Write-Host "Datos de usuario conservados en: $DataDir"
}
