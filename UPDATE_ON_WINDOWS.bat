@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "node_modules\.bin\next.cmd" (
  echo Dependencies are missing. Extract node_modules.zip first.
  pause
  exit /b 1
)
start "Truck Scale 2 - server 3001" cmd /k "npm run start:server"
timeout /t 3 /nobreak >nul
start "" http://localhost:3001/board
