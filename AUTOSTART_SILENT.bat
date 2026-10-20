@echo off
rem Runs at Windows sign-in via a scheduled task (see SETUP_AUTO_START.bat).
rem For interactive use, run RESTART_ON_WINDOWS.bat instead.
cd /d "%~dp0"
if not exist "node_modules" exit /b 1
if not exist ".next\BUILD_ID" exit /b 1
start "SMF Truck Scale - server (close this window to stop)" cmd /k "set NODE_ENV=production&& set SECURE_COOKIE=false&& npm run start"
ping -n 4 127.0.0.1 >nul
start "" http://localhost:3002
exit /b 0
