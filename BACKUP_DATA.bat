@echo off
setlocal EnableExtensions
title SMF Truck Scale - Backup data
cd /d "%~dp0"

echo.
echo ============================================================
echo  SMF Truck Scale - Backup data
echo ============================================================
echo.
echo This makes a consistent, timestamped copy of data\app.db into
echo the "backups" folder, even while the app is running. The 30
echo most recent backups are kept; older ones are removed.
echo.

call npm run backup
if errorlevel 1 goto :failed

echo.
echo Backup complete. See the "backups" folder in this directory.
echo.
pause
exit /b 0

:failed
echo.
echo Backup did not complete. Read the message above, then run this
echo file again.
echo.
pause
exit /b 1
