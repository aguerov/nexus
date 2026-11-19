param(
  [string]$ConfigPath = $(if ($env:NEXUS_CONFIG) { $env:NEXUS_CONFIG } else { "$env:ProgramData\NEXUS\config\nexus.json" })
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
. (Join-Path $PSScriptRoot 'nexus-runtime.ps1')
$ConfigPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigPath)
$form = New-Object Windows.Forms.Form
$form.Text = 'NEXUS Administración'
$form.Font = New-Object Drawing.Font('Segoe UI', 10)
$form.ClientSize = New-Object Drawing.Size(680, 510)
$form.MinimumSize = New-Object Drawing.Size(650, 540)
$form.StartPosition = 'CenterScreen'

$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'
$layout.Padding = New-Object Windows.Forms.Padding(20)
$layout.ColumnCount = 1
$form.Controls.Add($layout)

function New-Section([string]$Title) {
  $group = New-Object Windows.Forms.GroupBox
  $group.Text = $Title
  $group.AutoSize = $true
  $group.Dock = 'Top'
  $group.Padding = New-Object Windows.Forms.Padding(12)
  $section = New-Object Windows.Forms.TableLayoutPanel
  $section.Dock = 'Top'
  $section.AutoSize = $true
  $section.ColumnCount = 1
  $group.Controls.Add($section)
  $layout.Controls.Add($group)
  $section
}
function New-Row($Section) {
  $row = New-Object Windows.Forms.FlowLayoutPanel
  $row.Dock = 'Top'
  $row.AutoSize = $true
  $Section.Controls.Add($row)
  $row
}
function Add-Label($Parent, [string]$Text) {
  $label = New-Object Windows.Forms.Label
  $label.Text = $Text
  $label.AutoSize = $true
  $label.Margin = New-Object Windows.Forms.Padding(3, 8, 6, 3)
  $Parent.Controls.Add($label)
}
function Add-Field($Parent, [string]$Label, [int]$Width) {
  Add-Label $Parent $Label
  $field = New-Object Windows.Forms.TextBox
  $field.AccessibleName = $Label
  $field.Width = $Width
  $Parent.Controls.Add($field)
  $field
}
function Add-Button($Parent, [string]$Title, [scriptblock]$Action) {
  $button = New-Object Windows.Forms.Button
  $button.Text = $Title
  $button.AutoSize = $true
  $button.Add_Click($Action)
  $Parent.Controls.Add($button)
}

$server = New-Section 'Servidor Matrix'
$operations = New-Row $server
Add-Button $operations 'Actualizar estado' { Start-Operation 'nexus-status' @{} }
Add-Button $operations 'Iniciar' { Start-Operation 'nexus-start' @{} }
Add-Button $operations 'Detener' { Start-Operation 'nexus-stop' @{} }
Add-Button $operations 'Habilitar presencia' { Start-Operation 'nexus-presence' @{} }
$health = New-Object Windows.Forms.Label
$health.AutoSize = $true
$server.Controls.Add($health)

$settings = New-Section 'Configuración de red'
$network = New-Row $settings
Add-Label $network 'Modo'
$mode = New-Object Windows.Forms.ComboBox
$mode.AccessibleName = 'Modo'
$mode.DropDownStyle = 'DropDownList'
$mode.Items.AddRange(@('LOCAL', 'LAN'))
$mode.Width = 85
$network.Controls.Add($mode)
$address = Add-Field $network 'IPv4' 145
$port = Add-Field $network 'Puerto' 65
$mode.Add_SelectedIndexChanged({
  $address.ReadOnly = $mode.Text -eq 'LOCAL'
  if ($address.ReadOnly) { $address.Text = '127.0.0.1' }
})
$settingsActions = New-Row $settings
Add-Button $settingsActions 'Aplicar con el servidor detenido' {
  $number = 0
  if (-not [int]::TryParse($port.Text, [ref]$number)) { $feedback.Text = 'Introduce un puerto numérico.'; return }
  Start-Operation 'nexus-configure' @{ Mode = $mode.Text; BindAddress = $address.Text.Trim(); Port = $number }
}
$connection = New-Object Windows.Forms.TextBox
$connection.ReadOnly = $true
$connection.AccessibleName = 'Datos de conexión para el cliente'
$connection.Dock = 'Top'
$settings.Controls.Add($connection)

$accounts = New-Section 'Alta de cuenta Matrix'
$credentials = New-Row $accounts
$user = Add-Field $credentials 'Usuario' 145
$password = Add-Field $credentials 'Contraseña' 170
$password.UseSystemPasswordChar = $true
$accountActions = New-Row $accounts
$admin = New-Object Windows.Forms.CheckBox
$admin.Text = 'Administrador Matrix'
$admin.AutoSize = $true
$accountActions.Controls.Add($admin)
Add-Button $accountActions 'Crear cuenta' {
  if (-not $user.Text.Trim() -or -not $password.Text) { $feedback.Text = 'Indica el usuario y la contraseña.'; return }
  Start-Operation 'nexus-create-user' @{ User = $user.Text.Trim(); Password = $password.Text; Admin = $admin.Checked }
  $password.Clear()
}

Add-Label $layout $ConfigPath
$feedback = New-Object Windows.Forms.TextBox
$feedback.AccessibleName = 'Resultado de la operación'
$feedback.Multiline = $true
$feedback.ReadOnly = $true
$feedback.ScrollBars = 'Vertical'
$feedback.Dock = 'Top'
$feedback.Height = 88
$layout.Controls.Add($feedback)

function Sync-Configuration {
  $cfg = Get-NexusConfig $ConfigPath
  $mode.SelectedItem = $cfg.mode.ToUpperInvariant()
  $address.Text = $cfg.homeserver_bind
  $port.Text = [string]$cfg.homeserver_port
  $connection.Text = "http://$($cfg.homeserver_bind):$($cfg.homeserver_port)  |  $($cfg.server_name)"
}

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 150
$script:operation = $null
function Start-Operation([string]$Name, [hashtable]$Arguments) {
  if ($script:operation) { return }
  $worker = [PowerShell]::Create()
  try {
    $Arguments.ConfigPath = $ConfigPath
    $null = $worker.AddCommand((Join-Path $PSScriptRoot "$Name.ps1")).AddParameters($Arguments)
    $script:operation = @{ Worker = $worker; Result = $worker.BeginInvoke(); Name = $Name }
    $feedback.Text = 'Operación en curso…'
    $server.Enabled = $settings.Enabled = $accounts.Enabled = $false
    $timer.Start()
  } catch {
    $worker.Dispose()
    $feedback.Text = $_.Exception.Message
  }
}

$timer.Add_Tick({
  $current = $script:operation
  if (-not $current.Result.IsCompleted) { return }
  $timer.Stop()
  try {
    $output = @($current.Worker.EndInvoke($current.Result))
    if ($current.Worker.HadErrors) { throw ($current.Worker.Streams.Error | Out-String).Trim() }
    if ($current.Name -eq 'nexus-status') {
      $state = ($output -join '') | ConvertFrom-Json
      $matrixText = if ($state.homeserver -eq 'ready') { 'Disponible' } else { 'Sin respuesta' }
      $pgText = if ($state.postgres -eq 'ready') { 'Disponible' } else { 'Sin respuesta' }
      $health.Text = "Matrix: $matrixText   |   PostgreSQL: $pgText"
      $feedback.Text = 'Estado actualizado.'
    } else {
      $feedback.Text = ($output | Out-String).Trim()
      if ($current.Name -eq 'nexus-configure') { Sync-Configuration }
      if ($current.Name -in @('nexus-start', 'nexus-stop', 'nexus-configure')) {
        $health.Text = 'Pulsa Actualizar estado para comprobar el servicio.'
      }
    }
  } catch {
    $feedback.Text = if ($current.Worker.Streams.Error.Count) {
      ($current.Worker.Streams.Error | ForEach-Object { $_.Exception.Message }) -join [Environment]::NewLine
    } else { $_.Exception.Message }
  } finally {
    $current.Worker.Dispose()
    $script:operation = $null
    $server.Enabled = $settings.Enabled = $accounts.Enabled = $true
  }
})
$form.Add_FormClosing({ param($sender, $eventArgs) if ($script:operation) { $eventArgs.Cancel = $true } })
try {
  Sync-Configuration
  $form.Add_Shown({ Start-Operation 'nexus-status' @{} })
} catch {
  $server.Enabled = $settings.Enabled = $accounts.Enabled = $false
  $feedback.Text = $_.Exception.Message
}
try { [void]$form.ShowDialog() }
finally { $timer.Dispose(); $form.Dispose() }
