@echo off
rem EpicBench launcher - starts the unified server, then opens the site.
start "epicbench" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8930/
