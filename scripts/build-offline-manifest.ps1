<#
  Genera manifiesto de artefactos offline (nombre, versión, ruta, SHA256) para firma/verificación.
  Ejecutar en máquina de build tras descargar/fijar todos los componentes.
#>
param([string]$ArtifactsDir = ".\runtime", [string]$OutFile = ".\runtime\manifest.json")
$items = @()
if (Test-Path $ArtifactsDir) {
  Get-ChildItem -Path $ArtifactsDir -File -Recurse | ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash
    $items += [ordered]@{ path = $_.FullName.Substring((Resolve-Path $ArtifactsDir).Path.Length).TrimStart('\'); sha256 = $hash; size = $_.Length }
  }
}
$obj = [ordered]@{ generated_utc = (Get-Date).ToUniversalTime().ToString('o'); artifacts = $items }
$target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
[IO.File]::WriteAllText($target, ($obj | ConvertTo-Json -Depth 6))
Write-Host "Manifest escrito en $OutFile ($($items.Count) artefactos)"
