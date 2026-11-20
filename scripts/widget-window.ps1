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

# keep it on top: find the widget window by its title ("Agents" or "Agents (2 waiting)") among the windows of the widget's
# own Edge (the 3D hall may be open in the same Edge, so its main window is not always the widget) and set it topmost
try {
  Add-Type -ErrorAction Stop -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
namespace AgentFactoryWidget { public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static IntPtr Find(int[] pids, string prefix) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      int pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) < 0) return true;
      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().StartsWith(prefix)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
} }
'@
} catch {
  Write-Host 'The widget is open, but this computer does not allow keeping it on top.'
  exit 0
}

$TOPMOST = [System.IntPtr]::new(-1)
$NOMOVE_NOSIZE_SHOW = [uint32](0x0002 -bor 0x0001 -bor 0x0040)
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $ids = [int[]]@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$profileDir*" } | ForEach-Object { $_.ProcessId })
  if ($ids.Count -eq 0) { continue }
  $h = [AgentFactoryWidget.Win]::Find($ids, 'Agents')
  if ($h -ne [System.IntPtr]::Zero) {
    [void][AgentFactoryWidget.Win]::SetWindowPos($h, $TOPMOST, 0, 0, 0, 0, $NOMOVE_NOSIZE_SHOW)
    Write-Host 'The agent widget is open and stays on top.'
    exit 0
  }
}
Write-Host 'The widget is open, but its window was not found to keep it on top.'
