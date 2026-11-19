param(
  [string]$DataDir,
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" })
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
$cfg = Get-NexusConfig $ConfigPath
if (-not $DataDir) { $DataDir = $cfg.data_dir }
$lock = Lock-NexusInstance $DataDir
try {
  $cfg = Get-NexusConfig $ConfigPath
  $bind = $cfg.homeserver_bind
  $port = $cfg.homeserver_port
  Assert-NexusEndpoint $cfg.mode $bind $port
  $running = Get-NexusProcess $DataDir
  if ($running -or (Test-NexusTcp $bind $port)) {
    if ($running -and (Test-NexusMatrix $bind $port)) {
      Write-Output "Homeserver listo en http://${bind}:$port."
      return
    }
    throw "La instancia ya está arrancando o el puerto $port está ocupado."
  }
  $hsDir = Join-Path $DataDir 'homeserver'
  $yaml = Join-Path $hsDir 'dendrite.yaml'
  if (-not (Test-Path -LiteralPath $yaml -PathType Leaf)) { throw "Falta $yaml." }
  $exe = Join-Path $PSScriptRoot '..\homeserver\dendrite.exe'
  if (-not (Test-Path -LiteralPath $exe)) { $exe = Join-Path $PSScriptRoot 'dendrite.exe' }
  if (-not (Test-Path -LiteralPath $exe)) { throw 'Falta dendrite.exe en el paquete.' }
  if (-not (Test-NexusTcp $cfg.pg_host $cfg.pg_port)) { throw 'PostgreSQL no responde.' }

  $log = Join-Path $hsDir 'log'
  New-Item -ItemType Directory -Force -Path $log | Out-Null
  $proc = Start-Process -FilePath $exe -ArgumentList @('-config', ('"{0}"' -f $yaml), '-http-bind-address', "${bind}:$port") `
    -WorkingDirectory $hsDir -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $log 'stdout.log') -RedirectStandardError (Join-Path $log 'stderr.log')
  try {
    [IO.File]::WriteAllText((Join-Path $hsDir 'dendrite.pid'), "$($proc.Id)|$($proc.StartTime.ToUniversalTime().Ticks)")
  } catch {
    if (-not $proc.HasExited) { $proc.Kill() }
    throw
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  do {
    if ($proc.HasExited) { break }
    if (Test-NexusMatrix $bind $port) {
      Write-Output "Homeserver listo en http://${bind}:$port."
      return
    }
    Start-Sleep -Milliseconds 400
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "El homeserver no respondió. Revisa $(Join-Path $log 'stderr.log')."
} finally { $lock.Dispose() }
