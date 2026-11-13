@echo off
rem One-click local start: MongoDB, backend API, and frontend. See scripts\start_all.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_all.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup did not finish. Read the message above, fix it, and run this file again.
  pause
  exit /b 1
)
timeout /t 5 >nul
