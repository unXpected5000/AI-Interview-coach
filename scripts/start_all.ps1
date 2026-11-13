<#
.SYNOPSIS
  Start everything AI Interview Coach needs locally: MongoDB, the FastAPI backend,
  and the Vite frontend. Safe to run repeatedly; healthy services are reused.

.DESCRIPTION
  1. Checks Python, Node.js and npm.
  2. Creates backend\.venv and installs backend requirements on first run (or when they change).
  3. Installs frontend packages on first run (or when package-lock.json changes).
  4. Creates backend\.env from .env.example on first run with a generated JWT secret
     and development settings (verification codes are printed to the backend window).
  5. Starts MongoDB: reuses anything already listening on 27017, otherwise the
     Windows "MongoDB" service, otherwise a Docker container (starting Docker
     Desktop if needed). Data persists in the Docker volume "ai-interview-coach-mongo-data".
  6. Starts the backend and frontend in their own windows and opens the app.

  Nothing secret is printed. Stop everything with stop_all.ps1 / "Stop AI Interview Coach.bat".
#>
param(
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Backend ".env"
$BackendUrl = "http://127.0.0.1:8000"
$FrontendUrl = "http://127.0.0.1:5173"
$MongoContainer = "ai-interview-coach-mongo"
$MongoVolume = "ai-interview-coach-mongo-data"
$MongoImage = "mongo:7.0"

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message) { Write-Host "    $message" -ForegroundColor Green }
function Stop-WithError($message) {
    Write-Host ""
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        return $task.Wait(800) -and $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds, [string]$What) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) { return $true }
        Start-Sleep -Seconds 2
    }
    Stop-WithError "$What did not become ready within $Seconds seconds."
}

function Test-BackendHealthy {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$BackendUrl/api/health"
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Test-FrontendHealthy {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $FrontendUrl
        return $response.Content -match "AI Interview Coach"
    } catch { return $false }
}

function Get-FileHashString($path) {
    if (Test-Path $path) { return (Get-FileHash -Algorithm SHA256 $path).Hash } else { return "" }
}

# ---------------------------------------------------------------- prerequisites
Write-Step "Checking prerequisites"
$python = $null
foreach ($candidate in @(
    @{ Exe = "py"; Args = @("-3.11") },
    @{ Exe = "python"; Args = @() }
)) {
    if (-not (Get-Command $candidate.Exe -ErrorAction SilentlyContinue)) { continue }
    try {
        $version = & $candidate.Exe @($candidate.Args + "--version") 2>$null
        if ($LASTEXITCODE -eq 0 -and "$version" -match "Python 3\.(1[1-9])") { $python = $candidate; Write-Ok "$version"; break }
    } catch { }
}
if (-not (Test-Path $VenvPython) -and -not $python) { Stop-WithError "Python 3.11 or newer is required. Install Python 3.11 from python.org, then run this again." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithError "Node.js is required. Install the LTS version from nodejs.org, then run this again." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-WithError "npm is required (it is installed with Node.js)." }
Write-Ok "Node $(node --version)"

# ---------------------------------------------------------------- backend setup
if (-not $SkipInstall) {
    if (-not (Test-Path $VenvPython)) {
        Write-Step "Creating the Python virtual environment (first run)"
        & $python.Exe @($python.Args + @("-m", "venv", (Join-Path $Backend ".venv")))
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Could not create backend\.venv." }
    }
    $requirementsHash = (Get-FileHashString (Join-Path $Backend "requirements.txt")) + (Get-FileHashString (Join-Path $Backend "requirements-dev.txt"))
    $marker = Join-Path $Backend ".venv\.requirements-hash"
    if (-not (Test-Path $marker) -or (Get-Content $marker -Raw).Trim() -ne $requirementsHash) {
        Write-Step "Installing backend requirements"
        & $VenvPython -m pip install --disable-pip-version-check -q -r (Join-Path $Backend "requirements-dev.txt")
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Installing backend requirements failed. See the messages above." }
        Set-Content -Path $marker -Value $requirementsHash -Encoding ascii
    }

    $lockHash = Get-FileHashString (Join-Path $Frontend "package-lock.json")
    $frontendMarker = Join-Path $Frontend "node_modules\.lock-hash"
    if (-not (Test-Path (Join-Path $Frontend "node_modules\vite\bin\vite.js")) -or -not (Test-Path $frontendMarker) -or (Get-Content $frontendMarker -Raw).Trim() -ne $lockHash) {
        Write-Step "Installing frontend packages"
        Push-Location $Frontend
        try { npm ci --no-audit --no-fund } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { Stop-WithError "npm ci failed. See the messages above." }
        Set-Content -Path $frontendMarker -Value $lockHash -Encoding ascii
    }
}

# ---------------------------------------------------------------- configuration
if (-not (Test-Path $EnvFile)) {
    Write-Step "Creating backend\.env for local development (first run)"
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
    $content = Get-Content (Join-Path $Backend ".env.example") -Raw
    $content = $content -replace "(?m)^APP_ENV=.*$", "APP_ENV=development"
    $content = $content -replace "(?m)^MONGODB_URI=.*$", "MONGODB_URI=mongodb://127.0.0.1:27017"
    $content = $content -replace "(?m)^JWT_SECRET_KEY=.*$", "JWT_SECRET_KEY=$secret"
    # Without SMTP, show verification codes in the backend window (development only).
    $content = $content -replace "(?m)^EMAIL_DEV_LOG_CODES=.*$", "EMAIL_DEV_LOG_CODES=true"
    Set-Content -Path $EnvFile -Value $content -Encoding utf8
    Write-Ok "Created backend\.env (git-ignored). Add SMTP, Google, and AI keys there when you need them."
}

$status = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "check_local_config.ps1") -EnvFile $EnvFile
$databaseMode, $jwtStatus = ($status -split "\|")
if ($databaseMode -eq "UNSET") { Stop-WithError "MONGODB_URI is empty in backend\.env." }
if ($jwtStatus -ne "OK") { Stop-WithError "JWT_SECRET_KEY in backend\.env must be a stable secret of at least 32 characters." }

# ---------------------------------------------------------------- database
if ($databaseMode -eq "LOCAL") {
    Write-Step "Starting MongoDB"
    if (Test-Port 27017) {
        Write-Ok "MongoDB is already listening on 127.0.0.1:27017."
    } elseif (Get-Service -Name MongoDB -ErrorAction SilentlyContinue) {
        try { Start-Service MongoDB } catch { Stop-WithError "The MongoDB service could not be started. Start it from Windows Services (may need administrator rights)." }
        Wait-Until { Test-Port 27017 } 30 "MongoDB service" | Out-Null
        Write-Ok "Started the MongoDB Windows service."
    } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        docker info *> $null
        if ($LASTEXITCODE -ne 0) {
            $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
            if (-not (Test-Path $dockerDesktop)) { Stop-WithError "Docker is installed but not running. Start Docker Desktop, then run this again." }
            Write-Ok "Starting Docker Desktop (this can take a minute)..."
            Start-Process $dockerDesktop | Out-Null
            Wait-Until { docker info *> $null; $LASTEXITCODE -eq 0 } 180 "Docker Desktop" | Out-Null
        }
        $existing = docker ps -a --filter "name=^/$MongoContainer$" --format "{{.Names}}"
        if ($existing) {
            docker start $MongoContainer | Out-Null
        } else {
            Write-Ok "Creating the MongoDB container (first run downloads the $MongoImage image)."
            docker run -d --name $MongoContainer -p 127.0.0.1:27017:27017 -v "${MongoVolume}:/data/db" --restart unless-stopped $MongoImage | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Docker could not start the MongoDB container." }
        Wait-Until { Test-Port 27017 } 90 "MongoDB container" | Out-Null
        Write-Ok "MongoDB is running in Docker (data volume: $MongoVolume)."
    } else {
        Stop-WithError "No local MongoDB found. Install Docker Desktop or MongoDB Community Server, or set MONGODB_URI in backend\.env to a hosted database."
    }
} else {
    Write-Step "Using the remote MongoDB configured in backend\.env"
}

# ---------------------------------------------------------------- backend
Write-Step "Starting the backend API"
if (Test-BackendHealthy) {
    Write-Ok "Reusing the healthy backend on port 8000."
} else {
    if (Test-Port 8000) { Stop-WithError "Port 8000 is in use by something that is not a healthy AI Interview Coach backend. Close it or run stop_all." }
    Start-Process -FilePath "cmd.exe" -WorkingDirectory $Backend -ArgumentList "/k", "title AI Interview Coach Backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" | Out-Null
    Wait-Until { Test-BackendHealthy } 90 "The backend (check its window for errors)" | Out-Null
    Write-Ok "Backend is healthy: $BackendUrl/api/health"
}

# ---------------------------------------------------------------- frontend
Write-Step "Starting the frontend"
if (Test-FrontendHealthy) {
    Write-Ok "Reusing the frontend on port 5173."
} else {
    if (Test-Port 5173) { Stop-WithError "Port 5173 is in use by something else. Close it or run stop_all." }
    Start-Process -FilePath "cmd.exe" -WorkingDirectory $Frontend -ArgumentList "/k", "title AI Interview Coach Frontend && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort" | Out-Null
    Wait-Until { Test-FrontendHealthy } 90 "The frontend (check its window for errors)" | Out-Null
    Write-Ok "Frontend is ready."
}

Write-Host ""
Write-Host "AI Interview Coach is running at $FrontendUrl" -ForegroundColor Green
Write-Host "API docs: $BackendUrl/docs   Health: $BackendUrl/api/health"
Write-Host "Verification codes appear in the backend window until SMTP is configured."
if (-not $NoBrowser) { Start-Process $FrontendUrl }
exit 0
