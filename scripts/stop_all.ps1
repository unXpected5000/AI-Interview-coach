<#
.SYNOPSIS
  Stop the local AI Interview Coach backend, frontend, and MongoDB container.
  Only processes whose command line points at this project are stopped.
  Data in the MongoDB Docker volume is kept.
#>
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

foreach ($port in 8000, 5173) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
        $commandLine = [string]$process.CommandLine
        $belongsHere = $commandLine -like "*$Root*" -or $commandLine -match "uvicorn app\.main:app" -or $commandLine -match "vite"
        if ($belongsHere) {
            Write-Host "Stopping $($process.Name) on port $port (PID $($connection.OwningProcess))"
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host "Port $port is used by $($process.Name) (not this project); leaving it running."
        }
    }
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        $running = docker ps --filter "name=^/ai-interview-coach-mongo$" --format "{{.Names}}"
        if ($running) {
            Write-Host "Stopping the MongoDB container (data is kept)"
            docker stop ai-interview-coach-mongo | Out-Null
        }
    }
}
Write-Host "Done."
