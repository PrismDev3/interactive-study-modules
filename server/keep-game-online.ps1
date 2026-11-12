# Keeps the local LEGO Spider-Man server available on port 8080.
# This process is launched by Windows Task Scheduler and runs without a console window.
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $PSScriptRoot 'server.js'
$logDirectory = Join-Path $PSScriptRoot 'logs'
$watchdogLog = Join-Path $logDirectory 'watchdog.log'
$stdoutLog = Join-Path $logDirectory 'autostart-server.log'
$stderrLog = Join-Path $logDirectory 'autostart-server-error.log'
$healthUrl = 'http://127.0.0.1:8080/'
$healthPattern = '(?is)<title>\s*LEGO Spider-Man:'
$pollSeconds = 10
$retrySeconds = 5
$nextStart = Get-Date
$lastConflictLog = [datetime]::MinValue

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-WatchdogLog([string]$Message) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $watchdogLog -Value "[$stamp] $Message"
}

function Test-GameServer {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -eq 200 -and $response.Content -match $healthPattern)
    } catch {
        return $false
    }
}

Write-WatchdogLog "Supervisor started for $projectRoot."

while ($true) {
    if (Test-GameServer) {
        $retrySeconds = 5
        $nextStart = Get-Date
        Start-Sleep -Seconds $pollSeconds
        continue
    }

    # Never compete with another application that already owns the port.
    $listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        if (((Get-Date) - $lastConflictLog).TotalMinutes -ge 5) {
            Write-WatchdogLog "Port 8080 is occupied by PID $($listener.OwningProcess), but it is not serving this game. Waiting without stopping it."
            $lastConflictLog = Get-Date
        }
        Start-Sleep -Seconds $pollSeconds
        continue
    }

    if ((Get-Date) -ge $nextStart) {
        try {
            $node = (Get-Command node -ErrorAction Stop).Source
            $process = Start-Process -FilePath $node `
                -ArgumentList 'server/server.js' `
                -WorkingDirectory $projectRoot `
                -WindowStyle Hidden `
                -RedirectStandardOutput $stdoutLog `
                -RedirectStandardError $stderrLog `
                -PassThru
            Write-WatchdogLog "Started the game server with PID $($process.Id)."
        } catch {
            Write-WatchdogLog "Could not start the game server: $($_.Exception.Message)"
        }

        $nextStart = (Get-Date).AddSeconds($retrySeconds)
        $retrySeconds = [Math]::Min($retrySeconds * 2, 60)
    }

    Start-Sleep -Seconds 2
}
