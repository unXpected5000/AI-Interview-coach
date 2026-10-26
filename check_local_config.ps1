param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFile
)

$lines = Get-Content -LiteralPath $EnvFile -ErrorAction SilentlyContinue
$mongoLine = $lines | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' } | Select-Object -First 1
$jwtLine = $lines | Where-Object { $_ -match '^\s*JWT_SECRET_KEY\s*=' } | Select-Object -First 1
$mongoUri = if ($mongoLine) { $mongoLine -replace '^\s*MONGODB_URI\s*=\s*', '' } else { '' }
$jwtSecret = if ($jwtLine) { $jwtLine -replace '^\s*JWT_SECRET_KEY\s*=\s*', '' } else { '' }

$databaseMode = if ([string]::IsNullOrWhiteSpace($mongoUri)) {
    'UNSET'
} elseif ($mongoUri -match '^mongodb://(localhost|127\.0\.0\.1)(:|/)') {
    'LOCAL'
} else {
    'REMOTE'
}
$jwtStatus = if ($jwtSecret.Length -ge 32 -and $jwtSecret -notmatch 'replace|change|example|placeholder') {
    'OK'
} else {
    'INVALID'
}

[Console]::WriteLine("$databaseMode|$jwtStatus")
