@echo off
rem Stops the local backend, frontend, and MongoDB container started by the launcher.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop_all.ps1"
timeout /t 3 >nul
