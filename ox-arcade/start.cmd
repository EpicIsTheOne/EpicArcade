@echo off
rem Ox Arcade launcher - starts the server, then opens the site.
cd /d "%~dp0"
start "ox-arcade" /min cmd /c "node server.js"
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:8795
