param(
  [Parameter(Mandatory=$true)][ValidateSet('Local','Lan')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$BindAddress,
  [Parameter(Mandatory=$true)][ValidateRange(1,65535)][int]$Port,
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" })
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
Assert-NexusEndpoint $Mode $BindAddress $Port
$cfg = Get-NexusConfig $ConfigPath
$lock = Lock-NexusInstance $cfg.data_dir
try {
$runtime = Get-NexusProcess $cfg.data_dir
if ($runtime -or (Test-NexusTcp $cfg.homeserver_bind $cfg.homeserver_port)) {
  throw 'Detén el servidor antes de aplicar la configuración.'
}
$cfg.mode = $Mode.ToLowerInvariant()
$cfg.homeserver_bind = $BindAddress
$cfg.homeserver_port = $Port
$target = (Resolve-Path -LiteralPath $ConfigPath).Path
$temporary = "$target.$([guid]::NewGuid()).tmp"
$previous = "$temporary.bak"
try {
  [IO.File]::WriteAllText($temporary, ($cfg | ConvertTo-Json -Depth 16))
  [IO.File]::Replace($temporary, $target, $previous)
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
  if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous }
}
Write-Output "Configuración guardada. Dirección del cliente: http://${BindAddress}:$Port"
} finally { $lock.Dispose() }
