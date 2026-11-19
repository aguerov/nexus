param(
  [string]$DataDir,
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" })
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
if (-not $DataDir) { $DataDir = (Get-NexusConfig $ConfigPath).data_dir }
$lock = Lock-NexusInstance $DataDir
try {
  $process = Get-NexusProcess $DataDir
  if ($process) {
    $process.Kill()
    if (-not $process.WaitForExit(5000)) { throw "La instancia sigue en ejecución (PID $($process.Id))." }
    Write-Output "Instancia detenida (PID $($process.Id))."
  } else {
    Write-Output 'Esta instancia no tiene un proceso de Dendrite registrado y activo.'
  }
  $pidFile = Join-Path $DataDir 'homeserver\dendrite.pid'
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
} finally { $lock.Dispose() }
