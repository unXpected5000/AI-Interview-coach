@echo off
setlocal
set "ROOT=%~dp0"
set "FAILED=0"

if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  echo [FAIL] Python virtual environment not found at backend\.venv
  set "FAILED=1"
) else (
  echo [1/5] Checking Python syntax...
  pushd "%ROOT%backend"
  .venv\Scripts\python.exe -m compileall -q app
  if errorlevel 1 (echo [FAIL] Python syntax check & set "FAILED=1") else echo [PASS] Python syntax check
  echo [2/5] Running backend tests...
  .venv\Scripts\python.exe -m pytest -q
  if errorlevel 1 (echo [FAIL] Backend tests & set "FAILED=1") else echo [PASS] Backend tests
  popd
)

if not exist "%ROOT%frontend\node_modules\vite\bin\vite.js" (
  echo [FAIL] Frontend dependencies not found. Run npm ci in frontend.
  set "FAILED=1"
) else (
  pushd "%ROOT%frontend"
  echo [3/5] Running frontend tests...
  call npm test
  if errorlevel 1 (echo [FAIL] Frontend tests & set "FAILED=1") else echo [PASS] Frontend tests
  echo [4/5] Running frontend lint...
  call npm run lint
  if errorlevel 1 (echo [FAIL] Frontend lint & set "FAILED=1") else echo [PASS] Frontend lint
  echo [5/5] Building frontend...
  call npm run build
  if errorlevel 1 (echo [FAIL] Frontend build & set "FAILED=1") else echo [PASS] Frontend build
  popd
)

echo.
if "%FAILED%"=="0" (
  echo All available checks passed.
) else (
  echo One or more checks failed. Review the output above.
)
pause
exit /b %FAILED%
