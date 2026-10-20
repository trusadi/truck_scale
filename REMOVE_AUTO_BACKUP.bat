@echo off
title SMF Truck Scale - Remove automatic backups
echo.
echo Removing the "SMF Truck Scale Backup" scheduled task...
schtasks /delete /tn "SMF Truck Scale Backup" /f
echo.
pause
