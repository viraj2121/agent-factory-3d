# Creates two shortcuts with the app icon: "Agent widget" (starts the widget) and "Stop agent widget". They go on the desktop,
# or in the folder given with -To. Nothing is installed and nothing outside that folder is touched. Read-only app, as always.
param([string]$To = [Environment]::GetFolderPath('Desktop'))

$root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $root 'assets\icon\agent-factory.ico'
$shell = New-Object -ComObject WScript.Shell

function New-AppShortcut([string]$name, [string]$cmd, [string]$tip) {
  $lnk = $shell.CreateShortcut((Join-Path $To "$name.lnk"))
  $lnk.TargetPath = Join-Path $root $cmd
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = $tip
  $lnk.WindowStyle = 7   # minimized: the start file only launches things in the background and ends
  $lnk.Save()
  Write-Host "Created: $(Join-Path $To "$name.lnk")"
}

New-AppShortcut 'Agent widget' 'start-widget.cmd' 'Opens the agent widget: every AI coding agent on this computer, circling you'
New-AppShortcut 'Stop agent widget' 'stop-widget.cmd' 'Closes the agent widget and stops its background service'
