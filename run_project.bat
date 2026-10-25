@echo off
setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  echo Python virtual environment is missing.
  echo Run check_project.bat after installing dependencies, or create backend\.venv first.
  pause
  exit /b 1
)
if not exist "%ROOT%backend\.env" (
  echo backend\.env is missing. Copy backend\.env.example to backend\.env and configure MongoDB and JWT settings.
  pause
  exit /b 1
)
if not exist "%ROOT%frontend\node_modules\vite\bin\vite.js" (
  echo Frontend dependencies are missing. Run npm ci in the frontend folder.
  pause
  exit /b 1
)

echo Starting AI Interview Coach backend and frontend...
rem /D sets each new Command Prompt's working directory without nesting quoted cd commands.
start "AI Interview Coach Backend" /D "%ROOT%backend" cmd /k "call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload"
start "AI Interview Coach Frontend" /D "%ROOT%frontend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo Frontend: http://localhost:5173
echo Backend docs: http://127.0.0.1:8000/docs
echo Close the two server windows to stop the application.
endlocal
