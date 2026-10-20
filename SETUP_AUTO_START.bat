@echo off
setlocal EnableExtensions
title SMF Truck Scale - Set up auto-start after sign-in
cd /d "%~dp0"

echo.
echo ============================================================
echo  SMF Truck Scale - Start automatically after Windows sign-in
echo ============================================================
echo.
echo This creates a Windows Scheduled Task that starts the app in its
echo own window (same as RESTART_ON_WINDOWS.bat) every time you sign
echo in to this Windows account, including after a restart.
echo.
echo Note: if Windows restarts and nobody signs in, the app will not
echo start until someone does sign in - there is no fully unattended
echo option on this setup.
echo.
echo Run this file again any time; it replaces the previous task. Use
echo REMOVE_AUTO_START.bat to turn it off.
echo.

net session >nul 2>&1
if not errorlevel 1 goto :elevated
echo This needs to run as Administrator. Right-click this file and
echo choose "Run as administrator", then try again.
echo.
pause
exit /b 1

:elevated
schtasks /create /tn "SMF Truck Scale Autostart" /tr "\"%~dp0AUTOSTART_SILENT.bat\"" /sc ONLOGON /f
if errorlevel 1 goto :failed

echo.
echo Done. The app will start automatically the next time you sign in.
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
