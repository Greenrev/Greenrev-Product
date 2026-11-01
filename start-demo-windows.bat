@echo off
cd /d "%~dp0"
set GREENREV_DEMO=1
call npm ci
if errorlevel 1 exit /b 1
echo Open http://localhost:3100 when the server says Ready.
call npm run demo
