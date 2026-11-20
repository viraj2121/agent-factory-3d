@echo off
rem Checks whether this computer can run agent-factory-3d and its desktop widget. Read-only: changes and installs nothing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-setup.ps1"
echo.
pause
