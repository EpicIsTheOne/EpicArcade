@echo off
cd /d "%~dp0"
if not exist PORT.txt start "" /b pythonw serve.py
timeout /t 2 /nobreak >nul
set /p PORT=<PORT.txt
start "" http://127.0.0.1:%PORT%
