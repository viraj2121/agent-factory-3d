@echo off
rem Puts "Agent widget" and "Stop agent widget" shortcuts (with the app icon) on the desktop. Changes nothing else.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcuts.ps1"
echo.
pause
