' Starts the lswob Cloudflare tunnel, hidden, at every sign-in.
' Serves https://lswob.lootline.xyz -> localhost:8080 (the LEGO Spider-Man game server).
' Reference copy; the active one lives in the user's Startup folder (installed by install-lswob-startup.ps1).
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files (x86)\cloudflared\cloudflared.exe"" --config ""C:\Users\zeqrY\.cloudflared\lswob-config.yml"" --no-autoupdate tunnel run lswob", 0, False
