@echo off
title SMF Truck Scale - Remove auto-start
echo.
echo Removing the "SMF Truck Scale Autostart" scheduled task...
schtasks /delete /tn "SMF Truck Scale Autostart" /f
echo.
pause
