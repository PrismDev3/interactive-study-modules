# Installs the game supervisor as a Windows startup task and starts it now.
$ErrorActionPreference = 'Stop'

$taskName = 'LEGO Spider-Man Local Server'
$supervisor = Join-Path $PSScriptRoot 'server\keep-game-online.ps1'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershell = Join-Path $PSHOME 'powershell.exe'

if (-not (Test-Path -LiteralPath $supervisor -PathType Leaf)) {
    throw "Supervisor script not found: $supervisor"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed or is not available on PATH. Install Node.js, then run this script again.'
}

$action = New-ScheduledTaskAction -Execute $powershell `
    -Argument "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`""
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

try {
    # S4U lets this local-only task run at boot without saving the account password.
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($bootTrigger, $logonTrigger) `
        -Principal $principal -Settings $settings -Description 'Keeps the local LEGO Spider-Man game server on port 8080 running.' -Force | Out-Null
    $bootInstalled = $true
} catch {
    # Some Windows policies disallow S4U. A logon task still starts it automatically when this account signs in.
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $logonTrigger `
        -Principal $principal -Settings $settings -Description 'Keeps the local LEGO Spider-Man game server on port 8080 running.' -Force | Out-Null
    $bootInstalled = $false
}

Start-ScheduledTask -TaskName $taskName
if ($bootInstalled) {
    Write-Output 'Startup task installed. The supervisor starts at Windows boot and at sign-in, and it is running now.'
} else {
    Write-Output 'Startup task installed. This Windows policy allows it to start at sign-in; it is running now.'
}
Write-Output 'Open http://localhost:8080 to play. Watchdog logs are in server\logs.'
