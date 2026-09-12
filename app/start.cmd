@echo off
rem Ephix launcher - starts the unified server, then opens the site.
start "ephix" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8930/
