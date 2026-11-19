<#
.SYNOPSIS
  Crea un usuario local en el homeserver NEXUS (MODO LOCAL, sin registro público).
.EXAMPLE
  .\nexus-create-user.ps1 -User ana -Password $accountPassword
#>
param(
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$true)][string]$Password,
  [string]$DataDir,
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" }),
  [switch]$Admin
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
$cfg = Get-NexusConfig $ConfigPath
if (-not $DataDir) { $DataDir = $cfg.data_dir }
if ($User -cnotmatch '^[a-z0-9._=/-]+$' -or $User.Length -gt 128) { throw 'Introduce un nombre Matrix local en minúsculas.' }
if ($Password.Length -lt 8 -or $Password -match '[\r\n]' -or $Password.Trim() -cne $Password) {
  throw 'La contraseña debe tener al menos 8 caracteres, sin espacios al inicio o al final ni saltos de línea.'
}
$bind = $cfg.homeserver_bind
$port = $cfg.homeserver_port

$hsDir = Join-Path $DataDir 'homeserver'
$create = Join-Path $PSScriptRoot '..\homeserver\create-account.exe'
if (-not (Test-Path $create)) { $create = Join-Path $PSScriptRoot 'create-account.exe' }
if (-not (Test-Path $create)) { throw "No se encontró create-account.exe junto al paquete." }

$hsConfig = Join-Path $hsDir 'dendrite.yaml'
if (-not (Test-Path $hsConfig)) { throw "No existe $hsConfig. Ejecuta nexus-setup.ps1 primero." }

$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = (Resolve-Path -LiteralPath $create).Path
$start.Arguments = "-config `"$hsConfig`" -username $User -passwordstdin -url http://$bind`:$port"
if ($Admin) { $start.Arguments += ' -admin' }
$start.CreateNoWindow = $true
$start.UseShellExecute = $false
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($start)
try {
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  $bytes = [Text.Encoding]::UTF8.GetBytes($Password + "`n")
  try { $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length) }
  finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
  }
  $process.WaitForExit()
  $diagnostic = "$($stdout.Result)`n$($stderr.Result)"
  if ($process.ExitCode -ne 0) {
    $message = $diagnostic -replace '(?im)^.*(?:access.?token|password).*$',''
    throw "No se pudo crear el usuario $User (código $($process.ExitCode)). $($message.Trim())"
  }
} finally { $process.Dispose() }
$server = $cfg.server_name
Write-Output "[NEXUS] Usuario creado: @$User`:$server"
