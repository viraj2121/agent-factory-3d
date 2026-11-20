@echo off
rem Closes the agent widget and stops the agent service (port 4317) and the dashboard (port 5173) that start-widget.cmd
rem started in the background. Other Edge windows are not touched: the widget runs in its own Edge profile.
setlocal
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*agent-factory-3d\widget-edge*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "foreach ($port in 4317, 5173) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo The agent widget, the agent service and the dashboard are stopped.
timeout /t 3 >nul
