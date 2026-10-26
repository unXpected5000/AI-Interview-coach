@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://127.0.0.1:5173"
set "DB_MODE=UNSET"
set "JWT_STATUS=INVALID"

if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  echo [ERROR] Python virtual environment is missing at backend\.venv.
  echo Run check_project.bat after installing the backend requirements.
  pause
  exit /b 1
)
if not exist "%ROOT%backend\.env" (
  echo [ERROR] backend\.env is missing. Copy backend\.env.example to backend\.env and configure it.
  pause
  exit /b 1
)
if not exist "%ROOT%frontend\node_modules\vite\bin\vite.js" (
  echo [ERROR] Frontend packages are missing. Run npm ci from the frontend folder.
  pause
  exit /b 1
)

rem Read configuration status only; the MongoDB URI and JWT secret are never printed.
for /f "tokens=1,2 delims=|" %%D in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%check_local_config.ps1" -EnvFile "%ROOT%backend\.env"') do (
  set "DB_MODE=%%D"
  set "JWT_STATUS=%%E"
)
if /i "!DB_MODE!"=="UNSET" (
  echo [ERROR] MONGODB_URI is not configured in backend\.env.
  pause
  exit /b 1
)
if /i not "!JWT_STATUS!"=="OK" (
  echo [ERROR] JWT_SECRET_KEY must be a stable, non-placeholder secret of at least 32 characters in backend\.env.
  echo Keep this value unchanged between launches to preserve valid login sessions.
  pause
  exit /b 1
)

if /i "!DB_MODE!"=="LOCAL" (
  call :ensure_local_mongodb
  if errorlevel 1 exit /b 1
)

echo Checking backend health...
call :backend_healthy
if errorlevel 1 (
  set "PORT=8000"
  call :port_is_listening
  if not errorlevel 1 (
    echo [ERROR] Port 8000 is occupied, but it is not a healthy AI Interview Coach backend.
    echo Close the process using port 8000 or change the backend port configuration.
    pause
    exit /b 1
  )
  echo Starting backend. Its server log will remain visible in the backend window.
  start "AI Interview Coach Backend" /D "%ROOT%backend" cmd /k "call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
  set "BACKEND_READY="
  for /L %%I in (1,1,30) do (
    if not defined BACKEND_READY (
      call :backend_healthy
      if not errorlevel 1 (set "BACKEND_READY=1") else (timeout /t 2 /nobreak >nul)
    )
  )
  if not defined BACKEND_READY (
    echo [ERROR] Backend did not pass its health check within 60 seconds.
    echo Check the backend window for database, environment, or dependency errors.
    pause
    exit /b 1
  )
) else (
  echo Reusing the healthy backend already running on port 8000.
)

echo Checking frontend...
call :frontend_healthy
if errorlevel 1 (
  set "PORT=5173"
  call :port_is_listening
  if not errorlevel 1 (
    echo [ERROR] Port 5173 is occupied, but it does not serve this application.
    echo Close the process using port 5173 or change the frontend port configuration.
    pause
    exit /b 1
  )
  echo Starting frontend. Its server log will remain visible in the frontend window.
  start "AI Interview Coach Frontend" /D "%ROOT%frontend" cmd /k "npm run dev -- --host 127.0.0.1 --strictPort"
  set "FRONTEND_READY="
  for /L %%I in (1,1,30) do (
    if not defined FRONTEND_READY (
      call :frontend_healthy
      if not errorlevel 1 (set "FRONTEND_READY=1") else (timeout /t 2 /nobreak >nul)
    )
  )
  if not defined FRONTEND_READY (
    echo [ERROR] Frontend did not become ready within 60 seconds.
    echo Check the frontend window for dependency or port errors.
    pause
    exit /b 1
  )
) else (
  echo Reusing the frontend already running on port 5173.
)

echo.
echo AI Interview Coach is ready: %FRONTEND_URL%
echo Backend health: %BACKEND_URL%/api/health
start "" "%FRONTEND_URL%"
echo Close the server windows to stop only servers started by this launcher.
endlocal
exit /b 0

:backend_healthy
curl.exe --silent --show-error --fail --max-time 3 "%BACKEND_URL%/api/health" 2>nul | findstr /i /c:"ok" >nul
exit /b %errorlevel%

:frontend_healthy
curl.exe --silent --show-error --fail --max-time 3 "%FRONTEND_URL%" 2>nul | findstr /i /c:"AI Interview Coach" >nul
exit /b %errorlevel%

:port_is_listening
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:ensure_local_mongodb
sc.exe query MongoDB >nul 2>&1
if errorlevel 1 (
  echo [ERROR] backend\.env points to local MongoDB, but the MongoDB service is not installed.
  echo Install MongoDB Community Server or configure an existing remote MongoDB instance.
  pause
  exit /b 1
)
sc.exe query MongoDB | findstr /i /c:"RUNNING" >nul
if not errorlevel 1 exit /b 0
echo Starting the installed MongoDB service...
net.exe start MongoDB >nul 2>&1
if errorlevel 1 (
  echo [ERROR] MongoDB service could not be started with your current Windows permissions.
  echo Start the service through Windows Services, then run this file again.
  pause
  exit /b 1
)
exit /b 0
