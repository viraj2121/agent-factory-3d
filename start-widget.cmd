@echo off
rem Starts the agent widget: a small window that lists every agent session on this computer and stays on top.
rem Double-click this file. It starts the agent service and the dashboard in the background (no windows), then opens the
rem widget. Nothing is installed. To stop everything, double-click stop-widget.cmd.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node 22.18 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "apps\agent-service\node_modules" (
  echo Installing the agent service packages, first run only...
  pushd "apps\agent-service" & call npm install & popd
)
if not exist "apps\dashboard\node_modules" (
  echo Installing the dashboard packages, first run only...
  pushd "apps\dashboard" & call npm install & popd
)

set "LOGS=%LOCALAPPDATA%\agent-factory-3d\logs"
if not exist "%LOGS%" mkdir "%LOGS%"

rem the agent service on 127.0.0.1:4317, in the background (skipped when it already runs)
netstat -ano | findstr /R /C:":4317 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the agent service...
  powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm start > \"%LOGS%\service.log\" 2>&1' -WorkingDirectory '%~dp0apps\agent-service' -WindowStyle Hidden"
)

rem the dashboard (it serves the widget page) on port 5173, in the background (skipped when it already runs)
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the dashboard...
  powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev -- --port 5173 --strictPort > \"%LOGS%\dashboard.log\" 2>&1' -WorkingDirectory '%~dp0apps\dashboard' -WindowStyle Hidden"
)

rem wait until the dashboard answers (up to a minute)
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try{ (New-Object Net.Sockets.TcpClient('localhost',5173)).Close(); exit 0 }catch{ Start-Sleep 1 } }; exit 1"
if errorlevel 1 (
  echo The dashboard did not start. See "%LOGS%\dashboard.log".
  pause
  exit /b 1
)

rem open the widget window and keep it on top; if this computer blocks the script, open it without pinning
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\widget-window.ps1"
if errorlevel 1 start "" msedge --app=http://localhost:5173/widget.html --window-size=380,680

rem the edge tab: a small tab at the right edge of the screen that stands in for the widget while it is docked (it ends
rem by itself when the widget is closed)
powershell -NoProfile -Command "Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0scripts\widget-tab.ps1\"'"
