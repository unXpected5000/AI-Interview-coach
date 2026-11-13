<#
.SYNOPSIS
  Create "AI Interview Coach" and "Stop AI Interview Coach" shortcuts on the
  current user's desktop that run the project's start/stop launchers.
#>
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath("Desktop")
$Shell = New-Object -ComObject WScript.Shell

foreach ($item in @(
    @{ Name = "AI Interview Coach"; Target = "Start AI Interview Coach.bat"; Description = "Start MongoDB, the API, and the web app" },
    @{ Name = "Stop AI Interview Coach"; Target = "Stop AI Interview Coach.bat"; Description = "Stop the local AI Interview Coach services" }
)) {
    $shortcut = $Shell.CreateShortcut((Join-Path $Desktop "$($item.Name).lnk"))
    $shortcut.TargetPath = Join-Path $Root $item.Target
    $shortcut.WorkingDirectory = $Root
    $shortcut.Description = $item.Description
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
    $shortcut.Save()
    Write-Host "Created shortcut: $(Join-Path $Desktop "$($item.Name).lnk")"
}
