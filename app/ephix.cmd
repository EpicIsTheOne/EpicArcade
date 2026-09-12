@echo off
rem ============================================================
rem  Ephix launcher - boots all three servers and opens the
rem  landing page. Safe to re-run: skips servers already up.
rem    Tracker (python api_server)  -> http://127.0.0.1:8932
rem    Arcade  (node ..\arcade)     -> http://127.0.0.1:8795
rem    Ephix unified (node)         -> http://127.0.0.1:8930
rem ============================================================
setlocal
rem ROOT = the Ephix repo root (one level above this app/ folder)
set ROOT=%~dp0..
set ARCADE=%ROOT%\arcade
set TRACKER=%ROOT%\tracker
set OX_DIR=%ARCADE%

rem --- tracker API (python) on 8932 ---
netstat -ano | findstr /r ":8932 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo starting tracker api on 8932...
  start "ephix-tracker" /min cmd /c "cd /d "%TRACKER%" && python api_server.py 8932"
) else (
  echo tracker api already running on 8932
)

rem --- arcade on 8795 ---
netstat -ano | findstr /r ":8795 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo starting arcade on 8795...
  start "ephix-arcade" /min cmd /c "cd /d "%ARCADE%" && node server.js"
) else (
  echo arcade already running on 8795
)

rem --- unified Ephix on 8930 ---
netstat -ano | findstr /r ":8930 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo starting Ephix on 8930...
  start "ephix-unified" /min cmd /c "cd /d "%~dp0." && set ARCHIVE_PORT=8930&& node server.js"
) else (
  echo Ephix already running on 8930
)

timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8930/
echo all servers up. Ephix: http://127.0.0.1:8930/
endlocal
