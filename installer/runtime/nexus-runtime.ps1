function Lock-NexusInstance([string]$DataDir) {
  $path = Join-Path $DataDir 'homeserver\operation.lock'
  if (-not (Test-Path -LiteralPath (Split-Path $path) -PathType Container)) {
    throw "No existe el directorio del homeserver en $DataDir."
  }
  try { [IO.File]::Open($path, 'OpenOrCreate', 'ReadWrite', 'None') }
  catch [IO.IOException] { throw "No se pudo bloquear $path. Comprueba si hay otra operación en curso." }
}

function Get-NexusConfig([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Falta $Path. Ejecuta nexus-setup.ps1 para provisionar la instancia."
  }
  $cfg = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $cfg.data_dir -or -not $cfg.homeserver_bind -or -not $cfg.homeserver_port -or -not $cfg.server_name) {
    throw "Configuración NEXUS incompleta en $Path."
  }
  $cfg
}

function Enable-NexusLocalPresence([string]$Yaml) {
  $block = [regex]'(?m)^  presence:[^\r\n]*\r?\n(?:[ \t]{4}[^\r\n]*(?:\r?\n|$))*'
  if ($block.Matches($Yaml).Count -ne 1) { throw 'No se pudo identificar la sección de presencia en dendrite.yaml.' }
  $outbound = [regex]'(?m)^(    enable_outbound:[ \t]*)(true|false)(?=[ \t]*(?:#|\r?$))'
  if ($outbound.Matches($block.Match($Yaml).Value).Count -ne 1) { throw 'No se encontró enable_outbound en la sección de presencia.' }
  $block.Replace($Yaml, { param($match) $outbound.Replace($match.Value, '${1}true') })
}

function Assert-NexusEndpoint([string]$Mode, [string]$BindAddress, [int]$Port) {
  if ($Port -lt 1 -or $Port -gt 65535) { throw 'Puerto fuera del rango 1–65535.' }
  if ($Mode -eq 'Local') {
    if ($BindAddress -ne '127.0.0.1') { throw 'LOCAL requiere 127.0.0.1.' }
    return
  }
  $ip = $null
  if (-not [Net.IPAddress]::TryParse($BindAddress, [ref]$ip) -or
      $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
      $ip.ToString() -ne $BindAddress) { throw 'LAN requiere una IPv4 privada.' }
  $a, $b, $c, $d = $ip.GetAddressBytes()
  if (-not ($a -eq 10 -or ($a -eq 172 -and $b -ge 16 -and $b -le 31) -or ($a -eq 192 -and $b -eq 168))) {
    throw 'LAN requiere una IPv4 privada.'
  }
  $localAddresses = [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } | ForEach-Object { $_.Address.ToString() }
  if ($BindAddress -notin $localAddresses) { throw "La IP $BindAddress no pertenece a este equipo." }
}

function Test-NexusTcp([string]$Address, [int]$Port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $pending = $client.ConnectAsync($Address, $Port)
    $pending.Wait(1200) -and $client.Connected
  } catch { $false }
  finally { $client.Dispose() }
}

function Test-NexusMatrix([string]$Address, [int]$Port) {
  try {
    $request = [Net.HttpWebRequest]::Create("http://${Address}:$Port/_matrix/client/versions")
    $request.Proxy = $null
    $request.AllowAutoRedirect = $false
    $request.Timeout = 1800
    $response = $request.GetResponse()
    try {
      $reader = New-Object IO.StreamReader($response.GetResponseStream())
      try { $versions = $reader.ReadToEnd() | ConvertFrom-Json }
      finally { $reader.Dispose() }
      [int]$response.StatusCode -eq 200 -and [bool]$versions.versions.Count
    } finally { $response.Dispose() }
  } catch { $false }
}

function Get-NexusProcess([string]$DataDir) {
  $pidFile = Join-Path $DataDir 'homeserver\dendrite.pid'
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $record = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($record -notmatch '^(\d+)(?:\|(\d+))?$') { throw "Registro PID inválido: $pidFile" }
  $processId = [int]$Matches[1]
  $startTime = $Matches[2]
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process -or $process.ProcessName -ne 'dendrite') { return }
  if ($startTime) {
    if ($process.StartTime.ToUniversalTime().Ticks -eq [long]$startTime) { return $process }
    return
  }
  # Los paquetes anteriores guardaban solo el PID. Confirma la instancia por su argumento -config.
  $yaml = [IO.Path]::GetFullPath((Join-Path $DataDir 'homeserver\dendrite.yaml'))
  $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$processId").CommandLine
  $escapedYaml = [regex]::Escape($yaml)
  if ($commandLine -match "(?i)(?:^|\s)-config\s+(?:`"$escapedYaml`"|$escapedYaml)(?:\s|$)") { return $process }
  throw "No se pudo verificar que el PID $processId pertenezca a esta instancia de NEXUS."
}
