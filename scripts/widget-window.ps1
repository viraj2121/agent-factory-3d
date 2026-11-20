# Opens the agent widget as its own small Edge app window at the top right of the screen and keeps it on top of other
# windows. Nothing is installed: it uses Edge (part of Windows) and one Windows call (SetWindowPos). The widget gets its own
# Edge profile folder, so it opens as a separate window even when Edge is already open, and stop-widget.cmd can close it.
# It opens as a guest: no account, no sign-in or sync screens over the widget, nothing kept after it closes.
# If pinning is not allowed on this computer, the window still opens; it just is not always on top.

param(
  [string]$Url = 'http://localhost:5173/widget.html',
  [int]$Width = 380,
  [int]$Height = 680
)

$profileDir = Join-Path $env:LOCALAPPDATA 'agent-factory-3d\widget-edge'

# top right of the main screen's working area (above the taskbar)
$x = 40; $y = 40
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $x = [Math]::Max(0, $area.Right - $Width - 24)
  $y = $area.Top + 24
} catch { }

$edgeArgs = @("--app=$Url", "--window-size=$Width,$Height", "--window-position=$x,$y", "--user-data-dir=$profileDir", '--no-first-run', '--no-default-browser-check', '--guest')
try {
  Start-Process -FilePath 'msedge' -ArgumentList $edgeArgs -ErrorAction Stop
} catch {
  Write-Host 'Could not start Microsoft Edge. Open this address in a browser instead:' $Url
  exit 1
}

# keep it on top: find the window by its title ("Agents" or "Agents (2 waiting)") and set it topmost
try {
  Add-Type -ErrorAction Stop -Namespace AgentWidget -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr hWnd, System.IntPtr after, int x, int y, int cx, int cy, uint flags);
'@
} catch {
  Write-Host 'The widget is open, but this computer does not allow keeping it on top.'
  exit 0
}

$TOPMOST = [System.IntPtr]::new(-1)
$NOMOVE_NOSIZE_SHOW = [uint32](0x0002 -bor 0x0001 -bor 0x0040)
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $win = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like 'Agents*' } | Select-Object -First 1
  if ($win) {
    [void][AgentWidget.Win]::SetWindowPos($win.MainWindowHandle, $TOPMOST, 0, 0, 0, 0, $NOMOVE_NOSIZE_SHOW)
    Write-Host 'The agent widget is open and stays on top.'
    exit 0
  }
}
Write-Host 'The widget is open, but its window was not found to keep it on top.'
