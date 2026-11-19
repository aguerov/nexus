param(
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" }),
  [string]$DataDir
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
$cfg = Get-NexusConfig $ConfigPath
if (-not $DataDir) { $DataDir = $cfg.data_dir }
[ordered]@{
  mode = $cfg.mode
  postgres = if (Test-NexusTcp $cfg.pg_host $cfg.pg_port) { 'ready' } else { 'down' }
  homeserver = if (Test-NexusMatrix $cfg.homeserver_bind $cfg.homeserver_port) { 'ready' } else { 'down' }
  homeserver_url = "http://$($cfg.homeserver_bind):$($cfg.homeserver_port)"
  server_name = $cfg.server_name
  data_dir = $DataDir
} | ConvertTo-Json -Compress
