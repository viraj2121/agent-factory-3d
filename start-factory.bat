@echo off
rem Starts the whole AI Software Factory: the agent service (port 4317) and the dashboard (port 5173), then opens the page.
rem Double-click this file. Close the two windows it opens (or press Ctrl+C in them) to stop everything.
setlocal
cd /d "%~dp0"
title AI Software Factory launcher

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node 22.15 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

rem first run: install the packages of both apps
if not exist "apps\agent-service\node_modules" (
  echo Installing the agent service packages, first run only...
  pushd "apps\agent-service"
  call npm install
  popd
)
if not exist "apps\dashboard\node_modules" (
  echo Installing the dashboard packages, first run only...
  pushd "apps\dashboard"
  call npm install
  popd
)

rem agent service on 127.0.0.1:4317 (skipped when something already listens there)
netstat -ano | findstr /R /C:":4317 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the agent service on port 4317...
  start "Agent service (4317)" /D "%~dp0apps\agent-service" cmd /k npm start
) else (
  echo The agent service is already running on port 4317.
)

rem dashboard on port 5173 (the agent service only accepts pages from 5173 and 4173, so the port must not change)
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the dashboard on port 5173...
  start "Dashboard (5173)" /D "%~dp0apps\dashboard" cmd /k npm run dev -- --port 5173 --strictPort
) else (
  echo The dashboard is already running on port 5173.
)

rem wait until the dashboard answers (up to a minute), then open it in the browser
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try{ (New-Object Net.Sockets.TcpClient('localhost',5173)).Close(); break }catch{ Start-Sleep 1 } }; Start-Process 'http://localhost:5173'"

echo.
echo Running: http://localhost:5173  (agent service: http://127.0.0.1:4317)
echo To stop, close the "Agent service" and "Dashboard" windows.
ping -n 6 127.0.0.1 >nul
