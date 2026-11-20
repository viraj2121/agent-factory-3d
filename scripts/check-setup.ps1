# Checks whether this computer can run agent-factory-3d and its desktop widget. Read-only: it changes nothing, installs
# nothing and sends nothing anywhere. It prints OK, WARN or FAIL per item with a short tip. Run it with check-setup.cmd.

$ErrorActionPreference = 'Continue'
$fails = 0; $warns = 0
function Say([string]$state, [string]$what, [string]$tip = '') {
  $colour = @{ OK = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$state]
  Write-Host ('{0,-5}' -f $state) -ForegroundColor $colour -NoNewline
  Write-Host " $what"
  if ($tip) { Write-Host "      $tip" -ForegroundColor DarkGray }
  if ($state -eq 'FAIL') { $script:fails++ } elseif ($state -eq 'WARN') { $script:warns++ }
}

Write-Host ''
Write-Host 'agent-factory-3d: setup check (read-only)' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Needed for everything' -ForegroundColor White

# Node 22.18 or newer (the service runs TypeScript directly, which needs 22.18)
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Say FAIL 'Node.js not found' 'Install Node 22.18 or newer from https://nodejs.org (a per-user install needs no admin rights).'
} else {
  $v = (& node --version) -replace '^v', ''
  $parts = $v.Split('.') | ForEach-Object { [int]$_ }
  if ($parts[0] -gt 22 -or ($parts[0] -eq 22 -and $parts[1] -ge 18)) { Say OK "Node.js $v" } else { Say FAIL "Node.js $v is too old" 'Install Node 22.18 or newer.' }
}
if (Get-Command npm -ErrorAction SilentlyContinue) { Say OK "npm $(& npm --version)" } else { Say FAIL 'npm not found' 'It comes with Node.js; reinstall Node.' }

# packages installed?
$root = Split-Path -Parent $PSScriptRoot
foreach ($app in 'agent-service', 'dashboard') {
  if (Test-Path (Join-Path $root "apps\$app\node_modules")) { Say OK "packages of $app installed" }
  else { Say INFO "packages of $app not installed yet" 'The first start installs them (needs access to the npm registry; behind a proxy: npm config set proxy / https-proxy).' }
}

# ports: free, or already used by this app
foreach ($port in 4317, 5173) {
  $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $l) { Say OK "port $port is free" ; continue }
  $name = (Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue).ProcessName
  if ($name -eq 'node') { Say OK "port $port is in use by Node (probably this app, already running)" }
  else { Say FAIL "port $port is used by another program ($name)" 'Close that program, or start the service on another port (see apps/agent-service/README.md).' }
}

# the service, if it runs
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/health' -TimeoutSec 2
  if ($h.ok) { Say OK 'the agent service answers on 127.0.0.1:4317' }
} catch { Say INFO 'the agent service is not running right now' 'start-widget.cmd or start-factory.bat starts it.' }

Write-Host ''
Write-Host 'What it can watch (only whether the folders exist; nothing inside is read here)' -ForegroundColor White
$homeDir = [Environment]::GetFolderPath('UserProfile')
$found = 0
if (Test-Path (Join-Path $homeDir '.claude\projects')) { Say OK 'Claude Code sessions folder found'; $found++ } else { Say INFO 'no Claude Code sessions folder' }
if (Test-Path (Join-Path $homeDir '.codex')) { Say OK 'Codex folder found'; $found++ } else { Say INFO 'no Codex folder' }
if (Test-Path (Join-Path $env:APPDATA 'Code\User\workspaceStorage')) { Say OK 'VS Code (stable) folder found, for GitHub Copilot Chat'; $found++ } else { Say INFO 'no VS Code (stable) user folder' 'Insiders, VSCodium, Cursor and Remote sessions are not read yet.' }
if ($found -eq 0) { Say WARN 'no agent tool folders found' 'The page will show labelled demo projects until an agent runs on this computer.' }

Write-Host ''
Write-Host 'Desktop widget (Windows only)' -ForegroundColor White
$edge = Get-Command msedge -ErrorAction SilentlyContinue
if (-not $edge) { $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if ($edge) { Say OK 'Microsoft Edge found' } else { Say WARN 'Microsoft Edge not found' 'The widget opens in Edge app mode; open http://localhost:5173/widget.html in any browser instead.' }

$mode = $ExecutionContext.SessionState.LanguageMode
if ($mode -eq 'FullLanguage') { Say OK 'PowerShell runs normal scripts (FullLanguage)' }
else { Say WARN "PowerShell is locked down ($mode)" 'The widget still opens, but cannot stay on top, fade or dock into the edge tab.' }

try { Add-Type -AssemblyName PresentationFramework -ErrorAction Stop; Say OK 'Windows drawing (WPF) available: the edge tab can show' }
catch { Say WARN 'Windows drawing (WPF) blocked' 'Docking into the edge tab will not work; everything else does.' }

try {
  Add-Type -ErrorAction Stop -TypeDefinition 'namespace AgentFactorySetupCheck { public static class T { public static int One() { return 1; } } }'
  Say OK 'small Windows calls (Add-Type) allowed: pin on top, fade and dock work'
} catch { Say WARN 'small Windows calls (Add-Type) blocked' 'The widget opens but cannot stay on top, fade or dock.' }

$pol = Get-ExecutionPolicy
if ($pol -in 'Restricted', 'AllSigned') { Say WARN "script policy is $pol" 'The start files pass -ExecutionPolicy Bypass for their own scripts; if your company enforces the policy, the widget opens without pinning.' }
else { Say OK "script policy: $pol" }

Write-Host ''
if ($fails -gt 0) { Write-Host "$fails problem(s) to fix before it can run." -ForegroundColor Red }
elseif ($warns -gt 0) { Write-Host "Ready, with $warns limit(s) noted above." -ForegroundColor Yellow }
else { Write-Host 'All good. Double-click start-widget.cmd (widget) or start-factory.bat (3D hall).' -ForegroundColor Green }
Write-Host ''
if ($fails -gt 0) { exit 1 } else { exit 0 }
