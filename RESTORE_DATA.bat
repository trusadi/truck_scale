@echo off
setlocal EnableExtensions
title SMF Truck Scale - Restore data
cd /d "%~dp0"

echo.
echo ============================================================
echo  SMF Truck Scale - Restore data from a backup
echo ============================================================
echo.
echo IMPORTANT: Stop the running server first (close its window, or
echo Ctrl+C in it) before restoring. Restoring while the app is
echo running will be overwritten by the app's next write and may
echo corrupt the data file.
echo.

if not exist "backups" (
  echo No "backups" folder found. Run BACKUP_DATA.bat first to create one.
  echo.
  pause
  exit /b 1
)

echo Available backups (newest first):
echo.
dir /b /o-d "backups\app-*.db"
echo.

set /p BACKUP_FILE=Type the exact backup file name to restore (or press Enter to cancel):
if "%BACKUP_FILE%"=="" (
  echo Cancelled.
  pause
  exit /b 0
)
if not exist "backups\%BACKUP_FILE%" (
  echo File "backups\%BACKUP_FILE%" was not found.
  echo.
  pause
  exit /b 1
)

echo.
echo This will REPLACE data\app.db with backups\%BACKUP_FILE%.
set /p CONFIRM=Type YES to continue:
if not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 0
)

if not exist "data" mkdir "data"
del /f /q "data\app.db" 2>nul
del /f /q "data\app.db-wal" 2>nul
del /f /q "data\app.db-shm" 2>nul
copy /y "backups\%BACKUP_FILE%" "data\app.db" >nul
if errorlevel 1 goto :failed

echo.
echo Restore complete. Start the app with RESTART_ON_WINDOWS.bat.
echo.
pause
exit /b 0

:failed
echo.
echo Restore did not complete. Read the message above, then run this
echo file again.
echo.
pause
exit /b 1
