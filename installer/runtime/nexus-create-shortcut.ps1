<#
.SYNOPSIS
  Crea un acceso directo de NEXUS en el escritorio de Windows.
.DESCRIPTION
  Apunta al cliente de escritorio del paquete (app\nexus-app.exe) y usa el icono incluido
  (app\icon.ico) o el icono embebido del ejecutable. No requiere Internet ni instalación.
.EXAMPLE
  .\nexus-create-shortcut.ps1
.EXAMPLE
  .\nexus-create-shortcut.ps1 -AllUsers
#>
param(
  [string]$AppExe = "",
  [string]$IconPath = "",
  [string]$Name = "NEXUS",
  [switch]$AllUsers
)
$ErrorActionPreference = 'Stop'

if (-not $AppExe) {
  foreach ($c in @((Join-Path $PSScriptRoot '..\app\nexus-app.exe'), (Join-Path $PSScriptRoot '..\nexus-app.exe'), (Join-Path $PSScriptRoot 'nexus-app.exe'))) {
    if (Test-Path $c) { $AppExe = (Resolve-Path $c).Path; break }
  }
}
if (-not $AppExe -or -not (Test-Path $AppExe)) { throw "No se encontró nexus-app.exe. Pasa -AppExe <ruta>." }
$AppExe = (Resolve-Path $AppExe).Path
$appDir = Split-Path -Parent $AppExe

if (-not $IconPath) {
  foreach ($c in @((Join-Path $appDir 'icon.ico'), (Join-Path $PSScriptRoot '..\app\icon.ico'))) {
    if (Test-Path $c) { $IconPath = (Resolve-Path $c).Path; break }
  }
}
if (-not $IconPath) { $IconPath = "$AppExe,0" }

$desktop = if ($AllUsers) { [Environment]::GetFolderPath('CommonDesktopDirectory') } else { [Environment]::GetFolderPath('Desktop') }
$lnk = Join-Path $desktop "$Name.lnk"

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = $AppExe
$sc.WorkingDirectory = $appDir
$sc.IconLocation = $IconPath
$sc.Description = "NEXUS - mensajería local-first (sin Internet)"
$sc.WindowStyle = 1
$sc.Save()

if (-not (Test-Path $lnk)) { throw "No se pudo crear el acceso directo en $desktop." }
Write-Host "[NEXUS] Acceso directo creado: $lnk"
Write-Host "[NEXUS] Destino: $AppExe"
Write-Host "[NEXUS] Icono:   $IconPath"
