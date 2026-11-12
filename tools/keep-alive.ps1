# Keeps the game server (port 8080) and the Cloudflare quick tunnel alive.
# Every 10 s: if nothing listens on 8080, start `node server/server.js` (hidden);
# if the quick tunnel's cloudflared is gone, start a new one (the URL then changes
# and is written to tools/tunnel-url.txt). Log: tools/keep-alive.log
$ErrorActionPreference = 'Continue'
$root   = Split-Path -Parent $PSScriptRoot
$tools  = $PSScriptRoot
$exe    = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$cfg    = Join-Path $tools 'tunnel-empty.yml'
$tlog   = Join-Path $tools 'tunnel.log'
$urlTxt = Join-Path $tools 'tunnel-url.txt'
$log    = Join-Path $tools 'keep-alive.log'
if (-not (Test-Path $cfg)) { Set-Content -Path $cfg -Value '# empty: keeps the named-tunnel config out of the quick tunnel' -Encoding ascii }

function Log($m) { Add-Content -Path $log -Value ("{0:u} {1}" -f (Get-Date), $m) }

function Get-Tunnel {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like '*--url http://localhost:8080*' }
}

# Ask Windows not to idle-sleep while this watchdog runs (no power settings changed;
# released automatically when the process exits). Lid close / manual Sleep still sleep.
Add-Type -Namespace KA -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][KA.Power]::SetThreadExecutionState([uint32]'0x80000001')   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

Log 'watchdog started'
while ($true) {
  if (-not (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)) {
    Log 'server down -> starting node server/server.js'
    Start-Process -FilePath 'node' -ArgumentList 'server/server.js' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
  if (-not (Get-Tunnel)) {
    Log 'tunnel down -> starting new quick tunnel'
    Remove-Item $tlog -ErrorAction SilentlyContinue
    Start-Process -FilePath $exe -WindowStyle Hidden -ArgumentList @(
      'tunnel','--config',"`"$cfg`"",'--no-autoupdate','--url','http://localhost:8080','--logfile',"`"$tlog`"")
    foreach ($i in 1..30) {
      Start-Sleep -Seconds 1
      if (Test-Path $tlog) {
        $m = Select-String -Path $tlog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($m) { $u = $m.Matches[0].Value; Set-Content -Path $urlTxt -Value $u; Log "new tunnel URL: $u"; break }
      }
    }
  }
  Start-Sleep -Seconds 10
}
