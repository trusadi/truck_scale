@echo off
rem Runs the backup with no prompts, for use from Windows Task Scheduler.
rem For interactive use, run BACKUP_DATA.bat instead.
cd /d "%~dp0"
if not exist "backups" mkdir "backups"
call npm run backup >> "backups\backup.log" 2>&1
