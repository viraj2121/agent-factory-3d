# The edge tab of the agent widget: a small rounded tab on the right edge of the screen, half way down, that stands in for
# the widget while it is docked. Drawn by Windows itself (WPF, part of Windows), so it has no title bar and nothing is
# installed. start-widget.cmd starts it hidden; it shows only while the widget window is docked (hidden) or minimized, shows the
# waiting and working counts from the local agent service, and a click brings the widget back. It ends by itself when the
# widget window is closed. Read-only: it reads /api/snapshot and touches no window but the widget's own.

$ErrorActionPreference = 'Stop'
$service = 'http://127.0.0.1:4317'
$profileMark = 'agent-factory-3d\widget-edge'

# one tab at a time
$mutex = New-Object System.Threading.Mutex($false, 'AgentFactoryWidgetTab')
if (-not $mutex.WaitOne(0)) { exit 0 }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
namespace AgentFactoryTab { public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
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

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="False"
        ResizeMode="NoResize" Width="70" Height="212" ShowActivated="False" Title="Agent widget edge tab">
  <Grid>
    <Border x:Name="Tab" Width="54" HorizontalAlignment="Right" Margin="0,8,0,8" CornerRadius="16,0,0,16" BorderThickness="1,1,0,1" Opacity="0.82"
            BorderBrush="#33FFFFFF" Cursor="Hand" ToolTip="Agents: click to open">
      <Border.Background>
        <LinearGradientBrush StartPoint="0,0" EndPoint="0,1"><GradientStop Color="#B31C2442" Offset="0"/><GradientStop Color="#B3111522" Offset="1"/></LinearGradientBrush>
      </Border.Background>
      <Border.Effect><DropShadowEffect BlurRadius="12" ShadowDepth="0" Color="#000000" Opacity="0.5"/></Border.Effect>
      <Grid>
        <TextBlock x:Name="Quit" Text="&#x2715;" FontSize="10" Foreground="#889AA3B8" HorizontalAlignment="Center" VerticalAlignment="Top" Margin="3,6,0,0" Padding="4,1,4,2" Cursor="Hand" Background="Transparent" ToolTip="Quit: close the widget and stop it in the background"/>
        <Rectangle x:Name="Accent" Width="3" HorizontalAlignment="Left" Margin="0,18,0,18" RadiusX="1.5" RadiusY="1.5" Fill="#FFB547" Visibility="Collapsed"/>
        <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center" Margin="3,0,0,0">
          <Canvas x:Name="Sky" Width="40" Height="40" Margin="0,0,0,4" ClipToBounds="False">
            <Canvas.RenderTransform><ScaleTransform ScaleX="0.8" ScaleY="0.8"/></Canvas.RenderTransform>
            <Ellipse Canvas.Left="2" Canvas.Top="2" Width="46" Height="46" Stroke="#447F889C" StrokeThickness="1" StrokeDashArray="2 3"/>
            <Ellipse Canvas.Left="11" Canvas.Top="11" Width="28" Height="28" Stroke="#554EE7A0" StrokeThickness="1" StrokeDashArray="2 3"/>
            <Ellipse x:Name="Core" Canvas.Left="15" Canvas.Top="15" Width="20" Height="20">
              <Ellipse.Fill>
                <RadialGradientBrush><GradientStop Color="#FFFFFFFF" Offset="0"/><GradientStop x:Name="CoreMid" Color="#FFCFE4FF" Offset="0.4"/><GradientStop Color="#005B8CFF" Offset="1"/></RadialGradientBrush>
              </Ellipse.Fill>
            </Ellipse>
            <Canvas x:Name="Ring" Width="50" Height="50"><Canvas.RenderTransform><RotateTransform x:Name="Spin" CenterX="25" CenterY="25"/></Canvas.RenderTransform></Canvas>
            <Canvas x:Name="Near" Width="50" Height="50"/>
          </Canvas>
          <TextBlock x:Name="Waiting" Text="&#x2013;" FontFamily="Segoe UI Variable Display, Segoe UI" FontWeight="SemiBold" FontSize="20" Foreground="#FF7F889C" HorizontalAlignment="Center"/>
          <TextBlock x:Name="WaitingLabel" Text="waiting" FontFamily="Segoe UI" FontSize="10" Foreground="#FF9AA3B8" HorizontalAlignment="Center" Margin="0,-2,0,6"/>
          <TextBlock x:Name="Working" Text="&#x2013;" FontFamily="Segoe UI Variable Display, Segoe UI" FontWeight="SemiBold" FontSize="14" Foreground="#FF4EE7A0" HorizontalAlignment="Center"/>
          <TextBlock Text="working" FontFamily="Segoe UI" FontSize="10" Foreground="#FF9AA3B8" HorizontalAlignment="Center"/>
        </StackPanel>
      </Grid>
    </Border>
  </Grid>
</Window>
'@
$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$ui = @{}
foreach ($n in 'Tab', 'Quit', 'Accent', 'Ring', 'Near', 'Spin', 'CoreMid', 'Waiting', 'WaitingLabel', 'Working') { $ui[$n] = $win.FindName($n) }

# flush with the right edge of the working area (above the taskbar), half way down
function Set-Place {
  $wa = [System.Windows.SystemParameters]::WorkArea
  $win.Left = $wa.Right - $win.Width
  $win.Top = $wa.Top + [Math]::Round(($wa.Height - $win.Height) / 2)
}
Set-Place

$toolColour = @{ 'claude-code' = '#E8835F'; 'codex' = '#5B8CFF'; 'copilot' = '#A77BFF' }
function New-Dot([double]$x, [double]$y, [double]$r, [string]$colour, [double]$alpha) {
  $e = New-Object System.Windows.Shapes.Ellipse
  $e.Width = 2 * $r; $e.Height = 2 * $r
  $e.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString($colour)
  $e.Opacity = $alpha
  [System.Windows.Controls.Canvas]::SetLeft($e, $x - $r); [System.Windows.Controls.Canvas]::SetTop($e, $y - $r)
  return $e
}

# the counts and the little orbit, from the service (the amber edge marks that someone waits)
$script:last = ''
function Update-Counts {
  try {
    $snap = Invoke-RestMethod -Uri "$service/api/snapshot" -TimeoutSec 2
  } catch {
    $ui.Waiting.Text = '-'; $ui.Working.Text = '-'; $ui.Tab.ToolTip = 'The agent service is not running'
    return
  }
  $wait = @(); $run = @()
  foreach ($p in $snap.projects) {
    foreach ($e in @($p.roster)) {
      if ($e.state -eq 'needs-you') { $wait += $e.agent } elseif ($e.state -eq 'running') { $run += $e.agent }
    }
  }
  $key = "$($wait -join ',')|$($run -join ',')"
  if ($key -eq $script:last) { return }
  $script:last = $key
  $ui.Waiting.Text = "$($wait.Count)"
  $ui.WaitingLabel.Text = if ($wait.Count -eq 1) { 'waits' } else { 'waiting' }
  $ui.Working.Text = "$($run.Count)"
  $ui.Tab.ToolTip = "$($wait.Count) waiting for you, $($run.Count) working. Click to open."
  $alert = $wait.Count -gt 0
  $ui.Waiting.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString($(if ($alert) { '#FFFFB547' } else { '#FF7F889C' }))
  $ui.Accent.Visibility = if ($alert) { 'Visible' } else { 'Collapsed' }
  $ui.CoreMid.Color = [System.Windows.Media.ColorConverter]::ConvertFromString($(if ($alert) { '#FFFFD9A0' } else { '#FFCFE4FF' }))
  # working agents circle on the middle ring, waiting ones sit close to you, coloured by tool
  $ui.Ring.Children.Clear(); $ui.Near.Children.Clear()
  $n = [Math]::Min($run.Count, 6)
  for ($i = 0; $i -lt $n; $i++) {
    $a = 2 * [Math]::PI * $i / [Math]::Max(1, $n)
    $c = $toolColour[$run[$i]]; if (-not $c) { $c = '#4EE7A0' }
    [void]$ui.Ring.Children.Add((New-Dot (25 + 14 * [Math]::Cos($a)) (25 + 14 * [Math]::Sin($a)) 3 $c 1))
  }
  $m = [Math]::Min($wait.Count, 4)
  for ($i = 0; $i -lt $m; $i++) {
    $a = -[Math]::PI / 2 + 2 * [Math]::PI * $i / [Math]::Max(1, $m)
    [void]$ui.Near.Children.Add((New-Dot (25 + 9 * [Math]::Cos($a)) (25 + 9 * [Math]::Sin($a)) 3.2 '#FFB547' 1))
  }
}

# motion: the working ring turns
$spin = New-Object System.Windows.Media.Animation.DoubleAnimation(0, 360, [TimeSpan]::FromSeconds(9))
$spin.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$ui.Spin.BeginAnimation([System.Windows.Media.RotateTransform]::AngleProperty, $spin)

# hover: the tab slides out a little
function Set-TabWidth([double]$to) {
  $an = New-Object System.Windows.Media.Animation.DoubleAnimation($to, [TimeSpan]::FromMilliseconds(160))
  $an.EasingFunction = New-Object System.Windows.Media.Animation.CubicEase
  $ui.Tab.BeginAnimation([System.Windows.FrameworkElement]::WidthProperty, $an)
}
# a little see-through at rest, solid under the mouse
$ui.Tab.Add_MouseEnter({ Set-TabWidth 64; $ui.Tab.Opacity = 1 })
$ui.Tab.Add_MouseLeave({ Set-TabWidth 54; $ui.Tab.Opacity = 0.82 })
$ui.Quit.Add_MouseEnter({ $ui.Quit.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString('#FFFF6B6B') })
$ui.Quit.Add_MouseLeave({ $ui.Quit.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString('#889AA3B8') })

# the widget window: found while it is visible, remembered while it is hidden (docked)
$script:edge = [IntPtr]::Zero
$script:started = Get-Date
function Find-Widget {
  $ids = [int[]]@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$profileMark*" } | ForEach-Object { $_.ProcessId })
  if ($ids.Count -eq 0) { return [IntPtr]::Zero }
  return [AgentFactoryTab.Win]::Find($ids, 'Agents')
}

# the cross: quit everything, as stop-widget.cmd does (the widget's Edge, then the service and dashboard on this
# computer's ports 4317 and 5173, only when they are Node), then the tab itself
$ui.Quit.Add_MouseLeftButtonUp({
  $_.Handled = $true
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$profileMark*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($port in 4317, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
  }
  Stop-Tab
})

# click: bring the widget back, solid, and hide the tab
$ui.Tab.Add_MouseLeftButtonUp({
  if ($script:edge -ne [IntPtr]::Zero -and [AgentFactoryTab.Win]::IsWindow($script:edge)) {
    [void][AgentFactoryTab.Win]::ShowWindow($script:edge, 5)
    if ([AgentFactoryTab.Win]::IsIconic($script:edge)) { [void][AgentFactoryTab.Win]::ShowWindow($script:edge, 9) } # minimized: restore it
    if (([AgentFactoryTab.Win]::GetWindowLong($script:edge, -20) -band 0x80000) -ne 0) { [void][AgentFactoryTab.Win]::SetLayeredWindowAttributes($script:edge, 0, 255, 2) }
    [void][AgentFactoryTab.Win]::SetForegroundWindow($script:edge)
  }
  $win.Hide()
})

function Stop-Tab { $tick.Stop(); $win.Hide(); $app.Shutdown() }

$tick = New-Object System.Windows.Threading.DispatcherTimer
$tick.Interval = [TimeSpan]::FromMilliseconds(700)
$script:countEvery = 0
$tick.Add_Tick({
  if ($script:edge -eq [IntPtr]::Zero -or -not [AgentFactoryTab.Win]::IsWindow($script:edge)) {
    if ($script:edge -ne [IntPtr]::Zero) { Stop-Tab; return } # the widget was closed: so is the tab
    $script:edge = Find-Widget
    if ($script:edge -eq [IntPtr]::Zero -and ((Get-Date) - $script:started).TotalSeconds -gt 120) { Stop-Tab } # it never opened
    return
  }
  # docked (hidden) or minimized: the tab stands in for the widget
  if ([AgentFactoryTab.Win]::IsWindowVisible($script:edge) -and -not [AgentFactoryTab.Win]::IsIconic($script:edge)) {
    if ($win.IsVisible) { $win.Hide() }
    return
  }
  # docked: show the tab and keep its counts fresh (every 2 seconds)
  if (-not $win.IsVisible) { Set-Place; $script:last = ''; $script:countEvery = 0; $win.Show() }
  if ($script:countEvery -le 0) { Update-Counts; $script:countEvery = 3 }
  $script:countEvery--
})
$tick.Start()

$app = New-Object System.Windows.Application
$app.ShutdownMode = 'OnExplicitShutdown'
[void]$app.Run()
$mutex.ReleaseMutex()
