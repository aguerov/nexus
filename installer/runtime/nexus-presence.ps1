param(
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" })
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
$cfg = Get-NexusConfig $ConfigPath
$lock = Lock-NexusInstance $cfg.data_dir
try {
  $yaml = Join-Path $cfg.data_dir 'homeserver\dendrite.yaml'
  $original = [IO.File]::ReadAllText($yaml)
  $updated = Enable-NexusLocalPresence $original
  if ($original -ceq $updated) {
    Write-Output 'La presencia local ya está habilitada.'
    return
  }
  if ((Get-NexusProcess $cfg.data_dir) -or (Test-NexusTcp $cfg.homeserver_bind $cfg.homeserver_port)) {
    throw 'Detén el servidor antes de habilitar la presencia.'
  }
  $temp = "$yaml.$([guid]::NewGuid()).tmp"
  $backup = "$temp.bak"
  try {
    [IO.File]::WriteAllText($temp, $updated)
    [IO.File]::Replace($temp, $yaml, $backup)
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup }
  }
  Write-Output 'Presencia habilitada. Inicia el servidor para aplicar el cambio.'
} finally { $lock.Dispose() }
