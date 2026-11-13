# Installs the lswob Cloudflare tunnel to start hidden at every sign-in (no admin needed).
# It drops a tiny .vbs launcher in the user's Startup folder and starts the tunnel now.
# Result: https://lswob.lootline.xyz -> localhost:8080 is live whenever you're signed in.
#
# Want it up at BOOT (before sign-in) too? Run this from an *elevated* PowerShell and it
# will also register a Task Scheduler boot task.
$ErrorActionPreference = 'Stop'

$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$config      = 'C:\Users\zeqrY\.cloudflared\lswob-config.yml'
if (-not (Test-Path -LiteralPath $cloudflared)) { throw "cloudflared not found: $cloudflared" }
if (-not (Test-Path -LiteralPath $config))      { throw "tunnel config not found: $config" }

# 1) Startup-folder launcher (logon, no admin)
$startup = [Environment]::GetFolderPath('Startup')
$vbsPath = Join-Path $startup 'lswob-tunnel.vbs'
$vbs = @"
' Starts the lswob Cloudflare tunnel, hidden, at every sign-in.
Set sh = CreateObject("WScript.Shell")
sh.Run """$cloudflared"" --config ""$config"" --no-autoupdate tunnel run lswob", 0, False
"@
Set-Content -LiteralPath $vbsPath -Value $vbs -Encoding ASCII
Write-Output "Installed sign-in launcher: $vbsPath"

# 2) Optional boot task (only works elevated; ignored otherwise)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if ($isAdmin) {
    try {
        $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $action = New-ScheduledTaskAction -Execute $cloudflared -Argument "--config `"$config`" --no-autoupdate tunnel run lswob"
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
        Register-ScheduledTask -TaskName 'Lswob Cloudflare Tunnel' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Force | Out-Null
        Write-Output 'Also registered a boot-level Task Scheduler task (runs before sign-in).'
    } catch { Write-Output "Boot task skipped: $($_.Exception.Message)" }
} else {
    Write-Output 'Run elevated to also add a boot-level task; sign-in launcher is installed.'
}

# 3) Start it now if not already running
$running = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*lswob-config*' }
if (-not $running) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbsPath`"" -WindowStyle Hidden
    Write-Output 'Started the lswob tunnel now.'
} else {
    Write-Output 'lswob tunnel already running.'
}
