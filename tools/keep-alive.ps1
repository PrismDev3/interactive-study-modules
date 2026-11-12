# Keeps the game server (port 8080) and the STABLE named Cloudflare tunnel alive.
# The named tunnel serves https://lswob.lootline.xyz -> localhost:8080 and the URL
# never changes (unlike a quick trycloudflare.com tunnel).
# Every 10 s: if nothing listens on 8080, start `node server/server.js` (hidden);
# if the lswob tunnel isn't running, start it. Log: tools/keep-alive.log
$ErrorActionPreference = 'Continue'
$root    = Split-Path -Parent $PSScriptRoot
$tools   = $PSScriptRoot
$exe     = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$cfConfig = 'C:\Users\zeqrY\.cloudflared\lswob-config.yml'
$urlTxt  = Join-Path $tools 'tunnel-url.txt'
$log     = Join-Path $tools 'keep-alive.log'

# Public URL is now fixed.
Set-Content -Path $urlTxt -Value 'https://lswob.lootline.xyz' -Encoding ascii

function Log($m) { Add-Content -Path $log -Value ("{0:u} {1}" -f (Get-Date), $m) }

# The lswob tunnel is the cloudflared process launched with lswob-config.yml.
# (Matching on the config path keeps it distinct from the user's other 'chalkle' tunnel.)
function Get-LswobTunnel {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like '*lswob-config*' }
}

# Ask Windows not to idle-sleep while this watchdog runs (released when it exits).
Add-Type -Namespace KA -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][KA.Power]::SetThreadExecutionState([uint32]'0x80000001')   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

Log 'watchdog started (named tunnel: lswob.lootline.xyz)'
while ($true) {
  if (-not (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)) {
    Log 'server down -> starting node server/server.js'
    Start-Process -FilePath 'node' -ArgumentList 'server/server.js' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
  if (-not (Get-LswobTunnel)) {
    Log 'lswob tunnel down -> starting named tunnel'
    Start-Process -FilePath $exe -WindowStyle Hidden -ArgumentList @(
      '--config', $cfConfig, '--no-autoupdate', 'tunnel', 'run', 'lswob')
    Start-Sleep -Seconds 4
  }
  Start-Sleep -Seconds 10
}
