@echo off
setlocal EnableExtensions
title SMF Truck Scale - Set up automatic backups
cd /d "%~dp0"

echo.
echo ============================================================
echo  SMF Truck Scale - Set up automatic backups
echo ============================================================
echo.
echo This creates a Windows Scheduled Task that runs BACKUP_DATA_SILENT.bat
echo on the schedule you choose. It only runs while someone is logged in
echo to this Windows account at the scheduled time (open Task Scheduler
echo afterwards and check "Run whether user is logged on or not" on the
echo task's Properties if you need it to run through a locked screen too).
echo.
echo Run this file again any time to change the schedule; it replaces the
echo previous one. Use REMOVE_AUTO_BACKUP.bat to turn it off.
echo.
echo How often should it back up?
echo   1) Daily
echo   2) Weekly
echo   3) Monthly
echo.
set /p FREQ_CHOICE=Enter 1, 2 or 3:

set SCHEDTYPE=
if "%FREQ_CHOICE%"=="1" set SCHEDTYPE=DAILY
if "%FREQ_CHOICE%"=="2" set SCHEDTYPE=WEEKLY
if "%FREQ_CHOICE%"=="3" set SCHEDTYPE=MONTHLY
if not "%SCHEDTYPE%"=="" goto :gottype
echo Invalid choice. Run this file again and enter 1, 2 or 3.
echo.
pause
exit /b 1

:gottype
set RUNTIME=
set /p RUNTIME=What time should it run, 24-hour HH:MM (Enter for 02:00):
if "%RUNTIME%"=="" set RUNTIME=02:00

set EXTRA=
if "%SCHEDTYPE%"=="WEEKLY" goto :askweekday
if "%SCHEDTYPE%"=="MONTHLY" goto :askmonthday
goto :create

:askweekday
set WEEKDAY=
echo Which day? MON, TUE, WED, THU, FRI, SAT, SUN
set /p WEEKDAY=Enter day, default MON:
if "%WEEKDAY%"=="" set WEEKDAY=MON
set EXTRA=/D %WEEKDAY%
goto :create

:askmonthday
set MONTHDAY=
set /p MONTHDAY=Which day of the month, 1 to 28, default 1:
if "%MONTHDAY%"=="" set MONTHDAY=1
set EXTRA=/D %MONTHDAY%
goto :create

:create
echo.
echo Running: schtasks /create /tn "SMF Truck Scale Backup" /tr "%~dp0BACKUP_DATA_SILENT.bat" /sc %SCHEDTYPE% /st %RUNTIME% %EXTRA% /f
schtasks /create /tn "SMF Truck Scale Backup" /tr "\"%~dp0BACKUP_DATA_SILENT.bat\"" /sc %SCHEDTYPE% /st %RUNTIME% %EXTRA% /f
if errorlevel 1 goto :failed

echo.
echo Scheduled: %SCHEDTYPE% backup at %RUNTIME%.
echo Backups land in the "backups" folder; the log is backups\backup.log.
echo.
pause
exit /b 0

:failed
echo.
echo Could not create the scheduled task. Read the message above, then
echo run this file again.
echo.
pause
exit /b 1
