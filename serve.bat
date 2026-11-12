@echo off
echo Starting LEGO Spider-Man server...
echo Open http://localhost:8080 in your browser.
echo.
where node >nul 2>&1 || (
  echo ERROR: Node.js not found. Install it from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules\ws call npm install
node server/server.js
pause
